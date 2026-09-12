"""AP1-IGS-POLL processor — Instagram Story container poll + publish (Make 5845193)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from ap1_ig.graph import InstagramGraphError, InstagramReelClient, load_instagram_graph_settings
from ap1_igs.asset import story_asset_url
from ap1_igs.constants import (
    MAKE_POLL_SCENARIO_ID,
    MAKE_POLL_SCENARIO_NAME,
    PLATFORM_OUTPUT_TYPE,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHED,
    REPLACE_CLEANUP_STATE,
    STORY_STATUS_FAILED,
    STORY_STATUS_PUBLISHED,
)
from ap1_igs.eligibility import poll_eligibility_reason
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from item4.settings import PipelineSettings
from render.fields import field, field_str

RECORD_ID_PREFIX = "rec"


def _append_notes(existing: str, paragraph: str) -> str:
    base = (existing or "").rstrip()
    if not base:
        return paragraph
    return f"{base}\n\n{paragraph}"


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_POLL_SCENARIO_ID,
        "make_scenario_name": MAKE_POLL_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "Instagram",
        "format": "Story",
    }


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
    wait: bool = True,
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

    reason = poll_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    container_id = field_str(output, "IG_Story_Container_ID")
    preview["eligibility_reason"] = reason
    preview["container_id"] = container_id
    preview["replace_transaction_id"] = field_str(output, "Replace_Transaction_ID")
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    try:
        settings = load_instagram_graph_settings(PipelineSettings(client), output, client=client)
        graph = InstagramReelClient(
            ig_user_id=settings["ig_user_id"],
            token=settings["token"],
            version=settings["version"],
        )
        status = graph.wait_for_container(container_id) if wait else graph.container_status(container_id)
    except InstagramGraphError as exc:
        code = str(exc.status_code or "").upper()
        if "IN_PROGRESS" in code or "in progress" in str(exc).lower():
            _mark_still_processing(client, output, {"status_code": exc.status_code, "status": exc.status})
            return {"processed": True, "still_processing": True, "error": str(exc), **preview}
        _mark_container_failed(client, output, exc)
        return {
            "processed": False,
            "reason": "graph_container_failed",
            "error": str(exc),
            **preview,
        }
    except Exception:
        raise

    status_blob = f"{status.get('status_code') or ''} {status.get('status') or ''} {status}"
    code = str(status.get("status_code") or "").upper()
    if "ERROR" in status_blob.upper() or "EXPIRED" in status_blob.upper() or code in {"ERROR", "EXPIRED"}:
        _mark_container_failed(
            client,
            output,
            InstagramGraphError(
                str(status.get("status") or "container terminal"),
                status_code=code or "ERROR",
                status=str(status.get("status") or status_blob),
            ),
        )
        return {"processed": False, "reason": "container_terminal", "status": status, **preview}
    if code and code != "FINISHED":
        _mark_still_processing(client, output, status)
        return {"processed": True, "still_processing": True, "status": status, **preview}

    try:
        published = graph.publish(container_id)
        post_id = str(published.get("id") or "").strip()
        if not post_id:
            raise InstagramGraphError("media_publish returned no id", status_code="unknown", status="No media ID")
    except Exception as exc:
        _mark_publish_failed(client, output, exc, status)
        if isinstance(exc, InstagramGraphError):
            return {
                "processed": False,
                "reason": "graph_publish_failed",
                "error": str(exc),
                **preview,
            }
        raise

    _mark_published(client, output, post_id, status, published)
    return {
        "processed": True,
        "post_id": post_id,
        "container_id": container_id,
        "first_class_finalized": _ci(field_str(output, "Platform_Output_Type")) == _ci(PLATFORM_OUTPUT_TYPE),
        **preview,
    }


def _mark_still_processing(client: AirtableClient, output: dict[str, Any], status: dict[str, Any]) -> None:
    attempt = (parse_int(field(output, "IG_Story_Attempt_Count"), 0) or 0) + 1
    container_id = field_str(output, "IG_Story_Container_ID")
    response_text = (
        "IG Story container still processing.\n"
        f"Container ID: {container_id}\n"
        f"Status response: {status}\n"
        f"Checked at: {stamp_minutes()}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IGS-POLL checked container {container_id} and Meta still reports "
            f"IN_PROGRESS at {stamp_minutes()}. IG_Story_Status remains Publishing for the next poll."
        ),
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "IG_Story_Last_Attempt_At": iso_utc(),
            "IG_Story_Attempt_Count": attempt,
            "IG_Story_Response_JSON": response_text,
            "Output_Notes": notes,
        },
        typecast=True,
    )


def _mark_container_failed(client: AirtableClient, output: dict[str, Any], exc: Exception) -> None:
    status_code = getattr(exc, "status_code", "") or "unknown"
    status = getattr(exc, "status", "") or str(exc) or "No status returned"
    container_id = field_str(output, "IG_Story_Container_ID")
    message = f"IG Story container processing failed or expired. Status HTTP {status_code}. Response: {status}"
    response_text = (
        "IG Story container terminal processing result.\n"
        f"Container ID: {container_id}\n"
        f"HTTP status: {status_code}\n"
        f"Response: {status}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IGS-POLL marked Story container {container_id} Failed because Meta returned "
            f"a terminal/error processing result at {stamp_minutes()}."
        ),
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "IG_Story_Error_Message": message[:1500],
            "IG_Story_Response_JSON": response_text,
            "IG_Story_Status": STORY_STATUS_FAILED,
            "Output_Notes": notes,
        },
        typecast=True,
    )


def _mark_publish_failed(
    client: AirtableClient,
    output: dict[str, Any],
    exc: Exception,
    container_status: dict[str, Any],
) -> None:
    status_code = getattr(exc, "status_code", "") or "unknown"
    status = getattr(exc, "status", "") or str(exc) or "No status returned"
    replacing = bool(field_str(output, "Replace_Transaction_ID"))
    container_id = field_str(output, "IG_Story_Container_ID")
    message = f"IG Story media_publish failed. HTTP status: {status_code}. Response: {status}"
    response_text = (
        "IG Story media_publish failed\n"
        f"Container ID: {container_id}\n"
        f"Container status: {container_status}\n"
        f"Publish status HTTP: {status_code}\n"
        f"Publish response: {status}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IGS-POLL Story publish failed at {stamp_minutes()}. "
            f"HTTP status: {status_code}. Container ID: {container_id}."
        ),
    )
    fields: dict[str, Any] = {
        "IG_Story_Error_Message": message[:1500],
        "IG_Story_Response_JSON": response_text,
        "IG_Story_Container_ID": container_id,
        "IG_Story_Status": STORY_STATUS_FAILED,
        "Output_Notes": notes,
    }
    if replacing:
        fields.update(
            {
                "Manual_Fallback_Required": True,
                "Replace_Updated_At": iso_utc(),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Replace_State": REPLACE_CLEANUP_STATE,
                "Replace_Cleanup_State": REPLACE_CLEANUP_STATE,
                "Replace_Error": (
                    "Item6 replacement stopped after an ambiguous Instagram Story "
                    "media_publish result. The Story may already be public; reconcile or clean up before retrying."
                ),
            }
        )
    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)


def _mark_published(
    client: AirtableClient,
    output: dict[str, Any],
    post_id: str,
    container_status: dict[str, Any],
    published: dict[str, Any],
) -> None:
    container_id = field_str(output, "IG_Story_Container_ID")
    source_url = story_asset_url(output)
    published_at = iso_utc()
    response_text = (
        "IG Story publish response\n"
        f"Container ID: {container_id}\n"
        f"Published Story ID: {post_id}\n"
        f"Published at: {stamp_minutes()}\n"
        f"Story source URL: {source_url}\n"
        f"Container status response: {container_status}\n"
        f"Publish response: {published}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IGS-POLL published Instagram Story at {stamp_minutes()}.\n"
            f"Source output type: {field_str(output, 'Platform_Output_Type')}\n"
            f"Container ID: {container_id}\n"
            f"Published Story ID: {post_id}\n"
            f"Story source URL: {source_url}"
        ),
    )
    fields: dict[str, Any] = {
        "IG_Story_Asset_URL": source_url,
        "IG_Story_Error_Message": "",
        "IG_Story_Post_ID": post_id,
        "IG_Story_Response_JSON": response_text,
        "IG_Story_Container_ID": container_id,
        "IG_Story_Published_At": published_at,
        "IG_Story_Status": STORY_STATUS_PUBLISHED,
        "Output_Notes": notes,
    }
    if _ci(field_str(output, "Platform_Output_Type")) == _ci(PLATFORM_OUTPUT_TYPE):
        fields.update(
            {
                "Manual_Fallback_Required": False,
                "Platform_Publish_Response_JSON": response_text,
                "Platform_Media_ID": post_id,
                "Published_At": published_at,
                "Publish_Status": PUBLISH_STATUS_PUBLISHED,
                "Output_Status": PUBLISH_STATUS_PUBLISHED,
                "Platform_Post_ID": post_id,
                "Publish_Error_Message": "",
                "Publish_Retry_Eligible": False,
            }
        )
    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
