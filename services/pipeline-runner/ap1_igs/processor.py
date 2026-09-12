"""AP1-IGS processor — Instagram Story container create (Make 5612664)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from ap1_ig.graph import InstagramGraphError, InstagramReelClient, load_instagram_graph_settings
from ap1_igs.asset import cache_busted_story_url, story_asset_url
from ap1_igs.constants import (
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PUBLISH_LOCKED_BY,
    PUBLISH_STATUS_FAILED,
    REPLACE_CLEANUP_STATE,
    STORY_STATUS_FAILED,
    STORY_STATUS_PUBLISHING,
)
from ap1_igs.eligibility import create_eligibility_reason
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
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
        "format": "Story",
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

    reason = create_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    video_url = cache_busted_story_url(output)
    pipeline_settings = PipelineSettings(client)
    graph_settings = None
    try:
        graph_settings = load_instagram_graph_settings(pipeline_settings, output, client=client)
    except InstagramGraphError:
        graph_settings = None
    location = resolve_publish_location(
        client,
        output,
        settings=pipeline_settings,
        token=(graph_settings or {}).get("token", ""),
        version=(graph_settings or {}).get("version", "v25.0"),
    )
    preview["eligibility_reason"] = reason
    preview["video_url"] = video_url
    preview["story_asset_url"] = story_asset_url(output)
    preview["location"] = location.as_dict() if location else None
    preview["replace_transaction_id"] = field_str(output, "Replace_Transaction_ID")
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    attempt = (parse_int(field(output, "IG_Story_Attempt_Count"), 0) or 0) + 1
    started_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IGS Story publish lock set at {stamp_minutes()}. "
            f"Source output type: {field_str(output, 'Platform_Output_Type')}. "
            f"Story asset URL: {story_asset_url(output)}"
        ),
    )
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "IG_Story_Status": STORY_STATUS_PUBLISHING,
            "IG_Story_Asset_URL": story_asset_url(output),
            "IG_Story_Last_Attempt_At": now,
            "IG_Story_Attempt_Count": attempt,
            "IG_Story_Error_Message": "",
            "IG_Story_Locked_At": now,
            "IG_Story_Locked_By": PUBLISH_LOCKED_BY,
            "Output_Notes": started_notes,
        },
        typecast=True,
    )
    output["fields"] = {**(output.get("fields") or {}), "Output_Notes": started_notes}

    try:
        settings = graph_settings or load_instagram_graph_settings(pipeline_settings, output, client=client)
        graph = InstagramReelClient(
            ig_user_id=settings["ig_user_id"],
            token=settings["token"],
            version=settings["version"],
        )
        location_id = location.page_id if location else None
        try:
            created = graph.create_story(video_url, location_id=location_id)
        except InstagramGraphError as exc:
            if location_id and "LOCATION" in str(exc).upper():
                preview["location_tag_dropped"] = str(exc)
                created = graph.create_story(video_url)
            else:
                raise
        container_id = str(created.get("id") or "").strip()
        if not container_id:
            raise InstagramGraphError("container create returned no id", status_code="unknown", status="No container ID")
    except Exception as exc:
        _mark_create_failed(client, output, exc, video_url)
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
        "IG Story container created and queued for async processing.\n"
        f"Container ID: {container_id}\n"
        f"Create response: {created}\n"
        f"Queued at: {stamp_minutes()}"
    )
    ready_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IGS created Instagram Story container {container_id} and left "
            "IG_Story_Status=Publishing while Meta processes the media. "
            "AP1-IGS-POLL will publish only after Meta reports FINISHED."
        ),
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "IG_Story_Error_Message": "",
            "IG_Story_Response_JSON": response_text,
            "IG_Story_Container_ID": container_id,
            "IG_Story_Status": STORY_STATUS_PUBLISHING,
            "Output_Notes": ready_notes,
        },
        typecast=True,
    )
    return {
        "processed": True,
        "needs_poll": True,
        "attempt_count": attempt,
        "container_id": container_id,
        **preview,
    }


def _mark_create_failed(
    client: AirtableClient,
    output: dict[str, Any],
    exc: Exception,
    video_url: str,
) -> None:
    status_code = getattr(exc, "status_code", "") or "unknown"
    status = getattr(exc, "status", "") or str(exc) or "No status returned"
    replacing = bool(field_str(output, "Replace_Transaction_ID"))
    message = f"IG Story container create failed. HTTP status: {status_code}. Response: {status}"
    response_text = (
        "IG Story container create failed\n"
        f"Status: {status_code}\n"
        f"Response: {status}\n"
        f"Attempted URL: {video_url}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        f"AP1-IGS Story container create failed at {stamp_minutes()}. HTTP status: {status_code}.",
    )
    fields: dict[str, Any] = {
        "IG_Story_Error_Message": message[:1500],
        "IG_Story_Response_JSON": response_text,
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
                    "container-create result. A container may already exist; reconcile or clean up before retrying."
                ),
            }
        )
    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
