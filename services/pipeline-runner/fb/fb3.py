"""FB3 — finalize a stored Facebook Page post with its Graph permalink (Make 5813534)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc, stamp_minutes
from fb.common import append_note, preview, response_json, retry_at, unlock_fields, valid_record_id
from fb.constants import (
    MAKE_FB3_ID,
    MAKE_FB3_NAME,
    MANUAL_NOT_REQUIRED,
    OUTPUT_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHING,
    PUBLISH_STATUS_PUBLISHED,
    RETRY_MINUTES,
    STAGE_FB3,
    STATUS_PENDING_FINALIZE,
    STATUS_PUBLISHED,
)
from fb.eligibility import fb3_eligibility_reason
from fb.graph import FacebookPhotoClient, FacebookPhotoError, load_facebook_page_settings
from item4.settings import PipelineSettings
from render.fields import field_str


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="fb3",
        make_id=MAKE_FB3_ID,
        make_name=MAKE_FB3_NAME,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
    )
    record_id = str(output_record_id or "").strip()
    if not valid_record_id(record_id):
        return {"processed": False, "reason": "missing_output_record_id", **result}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    if test_run_id and field_str(output, "Test_Run_ID") != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **result}

    reason = fb3_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    result["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_FB3,
            "FB_Last_Checked_At": now,
            "Publish_Retry_Eligible": False,
        },
        typecast=True,
    )

    post_id = field_str(output, "Platform_Post_ID")
    try:
        creds = load_facebook_page_settings(PipelineSettings(client), output, client=client)
        graph = FacebookPhotoClient(**creds)
        status_code, data = graph.post_permalink(post_id)
    except FacebookPhotoError as exc:
        status_code, data = 0, exc.payload
    permalink = str(data.get("permalink_url") or "").strip()
    graph_id = str(data.get("id") or "").strip()
    result["http_status"] = status_code
    if 200 <= status_code <= 299 and graph_id and permalink:
        published_at = str(data.get("created_time") or "").strip() or now
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Output_Notes": append_note(
                    output,
                    f"FB3 finalized Facebook Page post {graph_id} at {stamp_minutes()}.",
                ),
                "Published_At": published_at,
                "Output_Status": OUTPUT_STATUS_PUBLISHED,
                "Publish_Status": PUBLISH_STATUS_PUBLISHED,
                "FB_Publish_Status": STATUS_PUBLISHED,
                "Platform_Post_URL": permalink,
                "FB_Last_Checked_At": now,
                "Publish_Error_Stage": "",
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Manual_Completion_Status": MANUAL_NOT_REQUIRED,
                "Manual_Fallback_Required": False,
                "Platform_Publish_Response_JSON": response_json(data),
            },
            typecast=True,
        )
        result["published"] = True
        result["platform_post_url"] = permalink
        result["fb_publish_status"] = STATUS_PUBLISHED
        return {"processed": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "FB_Publish_Status": STATUS_PENDING_FINALIZE,
            "Publish_Error_Stage": "FB3_FINALIZE",
            "Publish_Error_Message": (
                f"FB3 could not retrieve the Page post permalink. HTTP {status_code}: "
                f"{(data.get('error') or {}).get('message') or data}"
            ),
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
        },
        typecast=True,
    )
    result["retry"] = True
    return {"processed": True, "retry": True, "reason": "finalize_read_failed", **result}
