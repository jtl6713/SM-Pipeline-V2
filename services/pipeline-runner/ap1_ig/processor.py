"""AP1-IG processor — Instagram Reel Graph publish (Make 5862882)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from ap0.public_cover import ensure_public_cover_url
from ap1_ig.caption import reel_create_body
from ap1_ig.constants import (
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PUBLISH_LOCKED_BY,
    PUBLISH_METHOD,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHING,
    PUBLISH_STATUS_READY,
    REPLACE_CLEANUP_STATE,
    RETRY_MINUTES,
)
from ap1_ig.eligibility import eligibility_reason
from ap1_ig.graph import InstagramGraphError, InstagramReelClient, load_instagram_graph_settings
from asset.helpers import parse_int
from carousel.timeutil import chicago_now, iso_utc, stamp_minutes, utc_now
from item4.settings import PipelineSettings
from publish.location import resolve_publish_location
from render.fields import field, field_str

RECORD_ID_PREFIX = "rec"


def _append_notes(existing: str, paragraph: str) -> str:
    base = (existing or "").rstrip()
    if not base:
        return paragraph
    return f"{base}\n\n{paragraph}"


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "Instagram",
        "format": "Reel",
    }


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = _preview(output_record_id=output_record_id, test_run_id=test_run_id)
    record_id = str(output_record_id or "").strip()
    if not record_id or not record_id.startswith(RECORD_ID_PREFIX) or len(record_id) != 17:
        return {"processed": False, "reason": "missing_output_record_id", **preview}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    output_test = field_str(output, "Test_Run_ID")
    if test_run_id and output_test != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **preview}

    reason = eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    if not reason and not dry_run:
        try:
            ensure_public_cover_url(client, output)
        except Exception:
            pass
    pipeline_settings = PipelineSettings(client)
    graph_settings = None
    try:
        graph_settings = load_instagram_graph_settings(pipeline_settings)
    except InstagramGraphError:
        graph_settings = None
    location = resolve_publish_location(
        client,
        output,
        settings=pipeline_settings,
        token=(graph_settings or {}).get("token", ""),
        version=(graph_settings or {}).get("version", "v25.0"),
    )
    body = reel_create_body(output, location_id=(location.page_id if location else None))
    preview["eligibility_reason"] = reason
    preview["video_url"] = body.get("video_url")
    preview["has_cover_url"] = bool(body.get("cover_url"))
    preview["cover_url"] = body.get("cover_url") or ""
    preview["location"] = location.as_dict() if location else None
    preview["replace_transaction_id"] = field_str(output, "Replace_Transaction_ID")
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    started_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IG publish lock set at {stamp_minutes()}. "
            f"Publish asset URL: {field_str(output, 'Publish_Asset_URL')}. "
            "Cover source: public Thumbnail_URL as cover_url when Graph-fetchable; thumb_offset only if no cover."
        ),
    )
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_By": PUBLISH_LOCKED_BY,
            "Publish_Attempt_Count": attempt,
            "Last_Publish_Attempt_At": now,
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "Publish_Locked_At": now,
            "Publish_Started_At": now,
            "Publish_Method": PUBLISH_METHOD,
            "Publish_Error_Message": "",
            "Output_Notes": started_notes,
        },
        typecast=True,
    )
    output["fields"] = {**(output.get("fields") or {}), "Output_Notes": started_notes}

    try:
        settings = graph_settings or load_instagram_graph_settings(pipeline_settings)
        graph = InstagramReelClient(
            ig_user_id=settings["ig_user_id"],
            token=settings["token"],
            version=settings["version"],
        )
        try:
            created = graph.create_reel(body)
        except InstagramGraphError as exc:
            # Invalid curated/search place IDs must not block the publish.
            if body.get("location_id") and "LOCATION" in str(exc).upper():
                body = {k: v for k, v in body.items() if k != "location_id"}
                preview["location_tag_dropped"] = str(exc)
                created = graph.create_reel(body)
            else:
                raise
        creation_id = str(created.get("id") or "").strip()
        graph.wait_for_container(creation_id)
        published = graph.publish(creation_id)
        media_id = str(published.get("id") or creation_id).strip()
        meta = graph.media_meta(media_id)
        permalink = str(meta.get("permalink") or created.get("permalink") or "").strip()
        if not permalink and meta.get("shortcode"):
            permalink = f"https://www.instagram.com/p/{meta['shortcode']}/"
    except Exception as exc:
        _mark_failed(client, output, exc)
        if isinstance(exc, InstagramGraphError):
            return {
                "processed": False,
                "reason": "graph_create_failed",
                "error": str(exc),
                "attempt_count": attempt,
                **preview,
            }
        raise

    response_text = (
        "Instagram Reel publish response\n"
        f"Created Media ID: {creation_id}\n"
        f"Resolved Permalink: {permalink}\n"
        f"Get Post Media Type: {meta.get('media_type') or ''}\n"
        f"Get Post Product Type: {meta.get('media_product_type') or ''}\n"
        f"Get Post Timestamp: {meta.get('timestamp') or ''}\n"
        f"Published at: {stamp_minutes()}\n"
        f"Source URL: {field_str(output, 'Publish_Asset_URL')}\n"
        "Cover handling: AP1-IG sent the public thumbnail as cover_url without thumb_offset when a cover exists."
    )
    ready_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IG automated Instagram Reel publish completed at {stamp_minutes()}.\n"
            f"Instagram response ID: {creation_id}\n"
            f"Instagram permalink: {permalink}\n"
            f"Published from: {field_str(output, 'Publish_Asset_URL')}\n"
            + (
                f"Location tag: {location.label} (page_id={location.page_id}, source={location.source}).\n"
                if location and location.page_id and not preview.get("location_tag_dropped")
                else (
                    f"Location resolved as {location.label} but Meta rejected the place tag; published without it.\n"
                    if location and preview.get("location_tag_dropped")
                    else (f"Location text: {location.label} (no Meta page id).\n" if location else "")
                )
            )
            + "Cover handling: native 3D thumbnail as Instagram Reel cover_url when a public cover exists."
        ),
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_By": "",
            "Manual_Fallback_Required": False,
            "Platform_Post_URL": permalink,
            "Platform_Publish_Response_JSON": response_text,
            "Platform_Media_ID": creation_id,
            "Published_At": iso_utc(),
            "Publish_Status": PUBLISH_STATUS_PUBLISHED,
            "Output_Status": PUBLISH_STATUS_PUBLISHED,
            "Publish_Locked_At": None,
            "Platform_Post_ID": media_id,
            "Publish_Next_Retry_At": None,
            "Publish_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "Output_Notes": ready_notes,
        },
        typecast=True,
    )
    return {
        "processed": True,
        "attempt_count": attempt,
        "creation_id": creation_id,
        "media_id": media_id,
        "permalink": permalink,
        **preview,
    }


def _mark_failed(client: AirtableClient, output: dict[str, Any], exc: Exception) -> None:
    status_code = getattr(exc, "status_code", "") or "unknown"
    status = getattr(exc, "status", "") or str(exc) or "No status returned"
    replacing = bool(field_str(output, "Replace_Transaction_ID"))
    retry_at = utc_now() + timedelta(minutes=RETRY_MINUTES)
    retry_stamp = (chicago_now() + timedelta(minutes=RETRY_MINUTES)).strftime("%Y-%m-%d %H:%M")
    message = f"Instagram Reel create failed. Meta status_code: {status_code}. Status: {status}"
    response_text = (
        "Instagram Reel create failure\n"
        f"Media ID: none\n"
        f"Meta status_code: {status_code}\n"
        f"Meta status: {status}\n"
        f"Retry eligible: {str(not replacing).lower()}\n"
        f"Next retry: {retry_stamp}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IG Meta Reel create failed at {stamp_minutes()}.\n"
            f"Status code: {status_code}\n"
            f"Status: {status}\n"
            + (
                "Publish lock cleared; Item6 replacement blocked automatic retry."
                if replacing
                else f"Publish lock cleared; retry eligible after {retry_stamp}."
            )
        ),
    )
    fields: dict[str, Any] = {
        "Publish_Locked_By": "",
        "Platform_Publish_Response_JSON": response_text,
        "Last_Publish_Attempt_At": None,
        "Publish_Locked_At": None,
        "Publish_Started_At": None,
        "Publish_Error_Message": message[:1500],
        "Output_Notes": notes,
        "Manual_Fallback_Required": replacing,
    }
    if replacing:
        fields.update(
            {
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Retry_Eligible": False,
                "Publish_Next_Retry_At": None,
                "Replace_State": REPLACE_CLEANUP_STATE,
                "Replace_Cleanup_State": REPLACE_CLEANUP_STATE,
                "Replace_Updated_At": iso_utc(),
                "Replace_Error": (
                    "Item6 replacement blocked automatic retry after an ambiguous Instagram Reel "
                    "create result. A platform object may already exist; reconcile or clean up before retrying."
                ),
            }
        )
    else:
        fields.update(
            {
                "Publish_Status": PUBLISH_STATUS_READY,
                "Publish_Retry_Eligible": True,
                "Publish_Next_Retry_At": iso_utc(retry_at),
            }
        )
    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
