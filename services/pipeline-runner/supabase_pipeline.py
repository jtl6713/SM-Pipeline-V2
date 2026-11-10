"""Phase 5 second half: pipeline-runner Output and Content Item writes.

Airtable remains the write source of truth unless STUDIO_WRITE_SOURCE=supabase.
Make.com is retired. This client is the writer the Studio Worker cannot see.

Default: after a successful Airtable create/update of Platform Outputs or
Content Items, upsert the returned row into Supabase. Supabase errors are
logged and do not fail the Airtable write.

STUDIO_WRITE_SOURCE=supabase (not enabled in production): updates to those
two tables commit to Supabase first. Airtable is then a best-effort legacy
export. A failed export is logged and the caller still receives the record.
Creates still go to Airtable first so Airtable can mint rec ids.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from airtable.constants import (
    CONTENT_ITEMS_TABLE,
    MEDIA_ASSETS_TABLE,
    MEDIA_TRANSFER_QUEUE_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
)

logger = logging.getLogger("pipeline-runner.supabase")

OUTPUT_EXCLUDE = {
    "Selected_Assets_JSON",
    "Creative_Render_Manifest_JSON",
    "Render_Clip_List_JSON",
    "Remotion_Props_JSON",
    "Platform_Publish_Response_JSON",
    "Insights_Platform_Metrics_JSON",
}

OUTPUT_JSON_COLUMNS = {
    "Selected_Assets_JSON": "selected_assets",
    "Creative_Render_Manifest_JSON": "creative_render_manifest",
    "Render_Clip_List_JSON": "render_clip_list",
    "Remotion_Props_JSON": "remotion_props",
    "Platform_Publish_Response_JSON": "platform_publish_response",
    "Insights_Platform_Metrics_JSON": "insights_metrics",
}

RUNNER_RECORD_PROJECTION = "v1"

TYPED_OUTPUT = {
    "Output_ID", "Platform", "Format", "Platform_Output_Type", "Studio_Output_Type", "Aspect_Ratio",
    "Output_Status", "Render_Status", "Review_Status", "Publish_Status", "Publish_Method",
    "Do_Not_Publish", "Test_Run_ID", "Output_Title", "Output_Caption", "Output_Hashtags",
    "Thumbnail_URL", "Final_File_URL", "Publish_Asset_URL", "Studio_Preview_URL", "Platform_Post_URL",
    "Scheduled_Post_Date", "Studio_Scheduled_At", "YouTube_Scheduled_Publish_At", "Published_At",
    "Remotion_Job_ID", "Selected_Clip_Count", "Content_Item", "Content_Profile",
}

TYPED_CONTENT = {
    "Content_ID", "Content_Title", "Content_Status", "Primary_Location",
    "Voiceover_Status", "Thumbnail_URL", "Created_At", "Content_Profile",
}

OUTPUT_PATCH_COLUMNS = {
    "Output_ID": "output_number",
    "Platform": "platform",
    "Format": "format",
    "Platform_Output_Type": "platform_output_type",
    "Studio_Output_Type": "studio_output_type",
    "Aspect_Ratio": "aspect_ratio",
    "Output_Status": "output_status",
    "Render_Status": "render_status",
    "Review_Status": "review_status",
    "Publish_Status": "publish_status",
    "Publish_Method": "publish_method",
    "Output_Title": "output_title",
    "Output_Caption": "output_caption",
    "Output_Hashtags": "output_hashtags",
    "Thumbnail_URL": "thumbnail_url",
    "Final_File_URL": "final_file_url",
    "Publish_Asset_URL": "publish_asset_url",
    "Studio_Preview_URL": "studio_preview_url",
    "Platform_Post_URL": "platform_post_url",
    "Scheduled_Post_Date": "scheduled_post_date",
    "Studio_Scheduled_At": "studio_scheduled_at",
    "YouTube_Scheduled_Publish_At": "youtube_scheduled_publish_at",
    "Published_At": "published_at",
    "Remotion_Job_ID": "remotion_job_id",
    "Selected_Clip_Count": "selected_clip_count",
    "Test_Run_ID": "test_run_id",
}

CONTENT_PATCH_COLUMNS = {
    "Content_ID": "content_number",
    "Content_Title": "content_title",
    "Content_Status": "content_status",
    "Primary_Location": "primary_location",
    "Voiceover_Status": "voiceover_status",
    "Thumbnail_URL": "thumbnail_url",
    "Created_At": "created_at",
}


def supabase_configured(settings: dict | None) -> bool:
    settings = settings or {}
    return bool(str(settings.get("supabase_url") or "").strip() and str(settings.get("supabase_service_role_key") or "").strip())


def studio_write_source(settings: dict | None) -> str:
    raw = str((settings or {}).get("studio_write_source") or "airtable").strip().lower()
    if raw == "supabase" and supabase_configured(settings):
        return "supabase"
    return "airtable"


def table_kind(table_id: str) -> str:
    """Output and Content Item only. The transfer queue is not part of STUDIO_WRITE_SOURCE."""
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return "output"
    if table_id == CONTENT_ITEMS_TABLE:
        return "content"
    return ""


def legacy_export_enabled(settings: dict | None, table_id: str) -> bool:
    return studio_write_source(settings) == "supabase" and bool(table_kind(table_id))


def _select(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict) and value.get("name") is not None:
        return value.get("name")
    return None


def _first_link(value: Any) -> str | None:
    if isinstance(value, list) and value:
        row = value[0]
        if isinstance(row, str):
            return row
        if isinstance(row, dict):
            return row.get("id")
    return None


def _pack(fields: dict, typed: set[str], exclude: set[str] | None = None) -> dict:
    bag = {}
    for key, value in (fields or {}).items():
        if not key or key in typed or (exclude and key in exclude):
            continue
        if value is None or value == "":
            continue
        bag[key] = value
    return bag


def _ready(record: dict, kind: str) -> bool:
    fields = record.get("fields") if isinstance(record, dict) else None
    if not record.get("id") or not isinstance(fields, dict):
        return False
    if kind == "output":
        return fields.get("Output_ID") is not None or fields.get("Platform") is not None
    return (
        fields.get("Content_ID") is not None
        or fields.get("Content_Title") is not None
        or fields.get("Content_Status") is not None
    )


def _rest(settings: dict, path: str, method: str, body: Any = None, *, prefer: str | None = None) -> Any:
    import requests

    base = str(settings.get("supabase_url") or "").strip().rstrip("/")
    key = str(settings.get("supabase_service_role_key") or "").strip()
    if prefer is None:
        prefer = "return=representation" if method == "GET" else "return=minimal"
    response = requests.request(
        method,
        f"{base}/rest/v1/{path.lstrip('/')}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
        json=body,
        timeout=20,
    )
    if not response.ok:
        detail = (response.text or "")[:400]
        raise RuntimeError(f"Supabase {method} {path} failed {response.status_code}: {detail}")
    if not response.text:
        return None
    return response.json()


def _outbox_missing(error: BaseException) -> bool:
    text = str(error)
    return any(token in text for token in ("PGRST205", "schema cache", "does not exist", "Could not find the table", "404"))


def _profile_uuid(settings: dict, airtable_id: str | None) -> str | None:
    if not airtable_id:
        return None
    rows = _rest(
        settings,
        f"content_profiles?airtable_record_id=eq.{airtable_id}&select=id,airtable_record_id&limit=1",
        "GET",
    )
    if isinstance(rows, list) and rows and rows[0].get("id"):
        return rows[0]["id"]
    return None


def _content_uuid(settings: dict, airtable_id: str | None) -> str | None:
    if not airtable_id:
        return None
    rows = _rest(
        settings,
        f"content_items?airtable_record_id=eq.{airtable_id}&select=id,airtable_record_id&limit=1",
        "GET",
    )
    if isinstance(rows, list) and rows and rows[0].get("id"):
        return rows[0]["id"]
    return None


def _json_column(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if text[:1] in "[{":
            try:
                parsed = json.loads(text)
            except Exception:
                return None
            if isinstance(parsed, (dict, list)):
                return parsed
    return None


def _projection_bag(bag: dict, links: dict[str, str], *, complete: bool) -> dict:
    """Mark a full Airtable record. A partial body must not set this marker."""
    if not complete:
        return bag
    marked = dict(bag)
    marked["_runner_record_projection"] = RUNNER_RECORD_PROJECTION
    marked["_airtable_links"] = links
    return marked


def _output_row(record: dict, profile_uuid: str, content_uuid: str | None) -> dict:
    fields = record.get("fields") or {}
    content_airtable_id = _first_link(fields.get("Content_Item"))
    profile_airtable_id = _first_link(fields.get("Content_Profile"))
    links: dict[str, str] = {}
    complete = True
    if content_airtable_id:
        if content_uuid:
            links["Content_Item"] = content_airtable_id
        else:
            complete = False
    if profile_airtable_id:
        if profile_uuid:
            links["Content_Profile"] = profile_airtable_id
        else:
            complete = False
    bag = _pack(fields, TYPED_OUTPUT, OUTPUT_EXCLUDE)
    for airtable_key in OUTPUT_JSON_COLUMNS:
        if airtable_key not in fields:
            continue
        if _json_column(fields.get(airtable_key)) is None and fields.get(airtable_key) not in (None, ""):
            bag[airtable_key] = fields.get(airtable_key)
    row = {
        "airtable_record_id": record["id"],
        "output_number": fields.get("Output_ID"),
        "content_item_id": content_uuid if content_airtable_id else None,
        "content_profile_id": profile_uuid,
        "platform": _select(fields.get("Platform")) or "Unknown",
        "format": _select(fields.get("Format")),
        "platform_output_type": _select(fields.get("Platform_Output_Type")),
        "studio_output_type": _select(fields.get("Studio_Output_Type")),
        "aspect_ratio": _select(fields.get("Aspect_Ratio")),
        "output_status": _select(fields.get("Output_Status")),
        "render_status": _select(fields.get("Render_Status")),
        "review_status": _select(fields.get("Review_Status")),
        "publish_status": _select(fields.get("Publish_Status")),
        "publish_method": _select(fields.get("Publish_Method")),
        "do_not_publish": bool(fields.get("Do_Not_Publish")),
        "test_run_id": fields.get("Test_Run_ID") or None,
        "output_title": fields.get("Output_Title") or None,
        "output_caption": fields.get("Output_Caption") or None,
        "output_hashtags": fields.get("Output_Hashtags") or None,
        "thumbnail_url": fields.get("Thumbnail_URL") or None,
        "final_file_url": fields.get("Final_File_URL") or None,
        "publish_asset_url": fields.get("Publish_Asset_URL") or None,
        "studio_preview_url": fields.get("Studio_Preview_URL") or None,
        "platform_post_url": fields.get("Platform_Post_URL") or None,
        "scheduled_post_date": fields.get("Scheduled_Post_Date") or None,
        "studio_scheduled_at": fields.get("Studio_Scheduled_At") or None,
        "youtube_scheduled_publish_at": fields.get("YouTube_Scheduled_Publish_At") or None,
        "published_at": fields.get("Published_At") or None,
        "remotion_job_id": fields.get("Remotion_Job_ID") or None,
        "selected_clip_count": fields.get("Selected_Clip_Count"),
        "error_messages": _projection_bag(bag, links, complete=complete),
    }
    for airtable_key, column in OUTPUT_JSON_COLUMNS.items():
        if airtable_key not in fields:
            continue
        parsed = _json_column(fields.get(airtable_key))
        if parsed is not None:
            row[column] = parsed
    return row


def _content_row(record: dict, profile_uuid: str) -> dict:
    fields = record.get("fields") or {}
    profile_airtable_id = _first_link(fields.get("Content_Profile"))
    links: dict[str, str] = {}
    complete = True
    if profile_airtable_id:
        if profile_uuid:
            links["Content_Profile"] = profile_airtable_id
        else:
            complete = False
    return {
        "airtable_record_id": record["id"],
        "content_number": fields.get("Content_ID"),
        "content_title": fields.get("Content_Title") or None,
        "content_status": _select(fields.get("Content_Status")),
        "content_profile_id": profile_uuid,
        "primary_location": fields.get("Primary_Location") or None,
        "voiceover_status": _select(fields.get("Voiceover_Status")),
        "thumbnail_url": fields.get("Thumbnail_URL") or None,
        "created_at": fields.get("Created_At") or record.get("createdTime") or None,
        "extras": _projection_bag(_pack(fields, TYPED_CONTENT), links, complete=complete),
    }


def _partial_patch(record: dict, kind: str) -> dict:
    fields = record.get("fields") or {}
    columns = OUTPUT_PATCH_COLUMNS if kind == "output" else CONTENT_PATCH_COLUMNS
    body = {}
    for airtable_key, column in columns.items():
        if airtable_key not in fields:
            continue
        value = fields.get(airtable_key)
        if airtable_key in {
            "Platform", "Format", "Platform_Output_Type", "Studio_Output_Type", "Aspect_Ratio",
            "Output_Status", "Render_Status", "Review_Status", "Publish_Status", "Publish_Method",
            "Content_Status", "Voiceover_Status",
        }:
            value = _select(value)
        elif value == "":
            value = None
        body[column] = value
    if kind == "output" and "Do_Not_Publish" in fields:
        body["do_not_publish"] = bool(fields.get("Do_Not_Publish"))
    return body


def _queue_text(value: Any) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("id") or value.get("name")
    text = str(value or "").strip()
    return text or None


def _queue_row(record: dict) -> dict:
    """Scalar queue metadata only. Drive file ids, never file bytes or source URLs."""
    fields = record.get("fields") or {}
    row: dict[str, Any] = {}
    if "Transfer_Status" in fields:
        row["status"] = _select(fields.get("Transfer_Status"))
    if "Error_Message" in fields:
        row["error_message"] = _queue_text(fields.get("Error_Message"))
    if "Preview_Error" in fields:
        row["preview_error"] = _queue_text(fields.get("Preview_Error"))
    payload: dict[str, Any] = {}
    for airtable_key, column in (
        ("Transfer_ID", "transfer_id"),
        ("Production_Request_Record_ID", "production_request_record_id"),
        ("Asset_Kind", "asset_kind"),
        ("Source_Asset_ID", "source_asset_id"),
        ("Source_Name", "source_name"),
        ("Source_Drive_File_ID", "source_drive_file_id"),
        ("Source_Media_Asset", "source_media_asset_id"),
        ("Generated_Media_Asset", "generated_media_asset_id"),
        ("Aspect_Ratio", "aspect_ratio"),
        ("Preview_Status", "preview_status"),
        ("Test_Run_ID", "test_run_id"),
    ):
        if airtable_key not in fields:
            continue
        value = _queue_text(fields.get(airtable_key))
        if airtable_key in {"Source_Media_Asset", "Generated_Media_Asset"} and value and not value.startswith("rec"):
            continue
        if value:
            payload[column] = value
    if payload:
        row["payload"] = payload
    return row


def _mirror_queue(settings: dict, record: dict) -> None:
    row = _queue_row(record)
    if not row or not record.get("id"):
        return
    _rest(
        settings,
        "studio_media_transfer_queue?on_conflict=airtable_record_id",
        "POST",
        [{"airtable_record_id": record["id"], **row}],
        prefer="resolution=merge-duplicates,return=minimal",
    )
    _enqueue_outbox(settings, "queue", record, "PATCH")


def _enqueue_outbox(settings: dict, kind: str, record: dict, mutation: str) -> None:
    fields = record.get("fields") or {}
    if kind == "output":
        payload = {
            "output_status": fields.get("Output_Status"),
            "publish_status": fields.get("Publish_Status"),
            "review_status": fields.get("Review_Status"),
            "render_status": fields.get("Render_Status"),
        }
        table = "platform_outputs"
    elif kind == "queue":
        payload = {
            "status": _select(fields.get("Transfer_Status")),
            "source_drive_file_id": _queue_text(fields.get("Source_Drive_File_ID")),
        }
        table = "studio_media_transfer_queue"
    elif kind == "request":
        payload = {
            "production_request_id": fields.get("Production_Request_ID"),
            "request_status": _select(fields.get("Request_Status")),
        }
        table = "production_requests"
    elif kind == "media":
        payload = {
            "asset_name": _queue_text(fields.get("Asset Name")),
            "google_drive_file_id": _queue_text(fields.get("Google Drive File ID")),
        }
        table = "media_assets"
    else:
        payload = {
            "content_status": fields.get("Content_Status"),
            "voiceover_status": fields.get("Voiceover_Status"),
        }
        table = "content_items"
    try:
        _rest(settings, "studio_side_effect_outbox", "POST", [{
            "airtable_table": table,
            "airtable_record_id": record["id"],
            "mutation": mutation,
            "payload": payload,
            "status": "pending",
        }])
    except Exception as error:
        if _outbox_missing(error):
            return
        logger.warning("supabase outbox insert failed for %s: %s", record.get("id"), error)


def _mirror_one(settings: dict, kind: str, record: dict, *, partial: bool) -> None:
    if not _ready(record, kind) and partial:
        body = _partial_patch(record, kind)
        if not body:
            return
        table = "platform_outputs" if kind == "output" else "content_items"
        _rest(settings, f"{table}?airtable_record_id=eq.{record['id']}", "PATCH", body)
        _enqueue_outbox(settings, kind, record, "PATCH")
        return
    if not _ready(record, kind):
        return
    fields = record.get("fields") or {}
    profile_uuid = _profile_uuid(settings, _first_link(fields.get("Content_Profile")))
    if kind == "output":
        if not profile_uuid:
            _rest(settings, f"platform_outputs?airtable_record_id=eq.{record['id']}", "PATCH", {
                "scheduled_post_date": fields.get("Scheduled_Post_Date") or None,
                "studio_scheduled_at": fields.get("Studio_Scheduled_At") or None,
                "youtube_scheduled_publish_at": fields.get("YouTube_Scheduled_Publish_At") or None,
                "publish_status": _select(fields.get("Publish_Status")),
                "output_status": _select(fields.get("Output_Status")),
                "review_status": _select(fields.get("Review_Status")),
                "error_messages": _pack(fields, TYPED_OUTPUT, OUTPUT_EXCLUDE),
            })
        else:
            content_uuid = _content_uuid(settings, _first_link(fields.get("Content_Item")))
            _rest(
                settings,
                "platform_outputs?on_conflict=airtable_record_id",
                "POST",
                [_output_row(record, profile_uuid, content_uuid)],
                prefer="resolution=merge-duplicates,return=minimal",
            )
    else:
        if not profile_uuid:
            body = _partial_patch(record, "content")
            if "Content_ID" in fields:
                body["extras"] = _pack(fields, TYPED_CONTENT)
            if body:
                _rest(settings, f"content_items?airtable_record_id=eq.{record['id']}", "PATCH", body)
        else:
            _rest(
                settings,
                "content_items?on_conflict=airtable_record_id",
                "POST",
                [_content_row(record, profile_uuid)],
                prefer="resolution=merge-duplicates,return=minimal",
            )
    _enqueue_outbox(settings, kind, record, "PATCH")


_REQUEST_STATUSES = {"Draft", "Ready", "Submitted", "Promoted", "Cancelled"}


def _request_row(record: dict) -> dict:
    fields = record.get("fields") or {}
    row: dict[str, Any] = {}
    if "Production_Request_ID" in fields and fields.get("Production_Request_ID") is not None:
        row["production_request_id"] = str(fields.get("Production_Request_ID"))
    if "Request_Status" in fields:
        raw = _select(fields.get("Request_Status")) or "Draft"
        row["request_status"] = raw if raw in _REQUEST_STATUSES else "Draft"
    if "Requested_Title" in fields:
        row["requested_title"] = _queue_text(fields.get("Requested_Title"))
    if "Production_Notes" in fields:
        row["production_notes"] = _queue_text(fields.get("Production_Notes"))
    if "Studio_Variant_Status" in fields:
        row["variant_status"] = _select(fields.get("Studio_Variant_Status"))
    if "Studio_Output_Plan_Status" in fields:
        row["output_plan_status"] = _select(fields.get("Studio_Output_Plan_Status"))
    return row


def _mirror_request(settings: dict, record: dict) -> None:
    row = _request_row(record)
    if not row or not record.get("id"):
        return
    if row.get("production_request_id") is not None and row.get("request_status") is not None:
        _rest(
            settings,
            "production_requests?on_conflict=airtable_record_id",
            "POST",
            [{"airtable_record_id": record["id"], **row}],
            prefer="resolution=merge-duplicates,return=minimal",
        )
    else:
        _rest(
            settings,
            f"production_requests?airtable_record_id=eq.{record['id']}",
            "PATCH",
            row,
            prefer="return=minimal",
        )
    _enqueue_outbox(settings, "request", record, "PATCH")


def _media_row(record: dict) -> dict:
    """Scalar Media Asset metadata. Drive id and URL only; never file bytes."""
    fields = record.get("fields") or {}
    row: dict[str, Any] = {}
    if "Asset Name" in fields:
        name = _queue_text(fields.get("Asset Name"))
        if name:
            row["asset_name"] = name
    for airtable_key, column in (
        ("Media_Class", "media_class"),
        ("Asset_Role", "asset_role"),
        ("Asset_Status", "asset_status"),
    ):
        if airtable_key in fields:
            row[column] = _select(fields.get(airtable_key))
    for airtable_key, column in (
        ("Active", "active"),
        ("Do_Not_Use", "do_not_use"),
        ("Studio_Favorite", "studio_favorite"),
    ):
        if airtable_key in fields:
            row[column] = bool(fields.get(airtable_key))
    if "Google Drive File ID" in fields:
        drive_id = _queue_text(fields.get("Google Drive File ID"))
        if drive_id:
            row["google_drive_file_id"] = drive_id
    if "Google Drive URL" in fields:
        url = _queue_text(fields.get("Google Drive URL"))
        if url and not url.lower().startswith("https://media.chicagoshining.com/"):
            row["google_drive_url"] = url
    if "MIME_Type" in fields:
        mime = _queue_text(fields.get("MIME_Type"))
        if mime:
            row["mime_type"] = mime
    if "File_Extension" in fields:
        extension = _queue_text(fields.get("File_Extension"))
        if extension:
            row["file_extension"] = extension
    if "File_Size_Bytes" in fields and fields.get("File_Size_Bytes") not in (None, ""):
        try:
            row["file_size_bytes"] = int(fields.get("File_Size_Bytes"))
        except (TypeError, ValueError):
            pass
    return row


def _mirror_media(settings: dict, record: dict) -> None:
    row = _media_row(record)
    if not row or not record.get("id"):
        return
    if row.get("asset_name"):
        _rest(
            settings,
            "media_assets?on_conflict=airtable_record_id",
            "POST",
            [{"airtable_record_id": record["id"], **row}],
            prefer="resolution=merge-duplicates,return=minimal",
        )
    else:
        _rest(
            settings,
            f"media_assets?airtable_record_id=eq.{record['id']}",
            "PATCH",
            row,
            prefer="return=minimal",
        )
    _enqueue_outbox(settings, "media", record, "PATCH")


def mirror_airtable_records(settings: dict | None, table_id: str, records: list[dict], *, partial: bool = False) -> dict:
    """Mirror Output, Content Item, request, media, or transfer-queue rows. Never raises."""
    table = str(table_id or "")
    kind = {
        MEDIA_TRANSFER_QUEUE_TABLE: "queue",
        PRODUCTION_REQUESTS_TABLE: "request",
        MEDIA_ASSETS_TABLE: "media",
    }.get(table) or table_kind(table)
    if not kind:
        return {"skipped": True, "reason": "table"}
    if not supabase_configured(settings):
        return {"skipped": True, "reason": "supabase_not_configured"}
    mirrored = 0
    for record in records or []:
        if not isinstance(record, dict) or not record.get("id"):
            continue
        try:
            if kind == "queue":
                _mirror_queue(settings or {}, record)
            elif kind == "request":
                _mirror_request(settings or {}, record)
            elif kind == "media":
                _mirror_media(settings or {}, record)
            else:
                _mirror_one(settings or {}, kind, record, partial=partial)
            mirrored += 1
        except Exception as error:
            logger.warning("supabase %s write-through failed for %s: %s", kind, record.get("id"), error)
    return {"ok": True, "kind": kind, "count": mirrored}
