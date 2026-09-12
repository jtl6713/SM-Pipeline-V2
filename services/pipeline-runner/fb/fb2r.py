"""FB2R — reconcile an ambiguous Facebook Page publish (Make 5813511)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from fb.assets import facebook_message
from fb.common import preview, response_json, retry_at, unlock_fields, valid_record_id
from fb.constants import (
    DEFAULT_RECONCILE_MAX_ATTEMPTS,
    MAKE_FB2R_ID,
    MAKE_FB2R_NAME,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    RECONCILE_RETRY_MINUTES,
    STAGE_FB2R,
    STATUS_MANUAL_FALLBACK,
    STATUS_PENDING_FINALIZE,
    STATUS_RECONCILE,
)
from fb.eligibility import fb2r_eligibility_reason
from fb.graph import FacebookPhotoClient, FacebookPhotoError, feed_since, load_facebook_page_settings
from item4.settings import PipelineSettings
from render.fields import field, field_str


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="fb2r",
        make_id=MAKE_FB2R_ID,
        make_name=MAKE_FB2R_NAME,
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

    reason = fb2r_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    result["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    attempt = (parse_int(field(output, "FB_Reconcile_Attempt_Count"), 0) or 0) + 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Locked_At": iso_utc(),
            "Publish_Locked_By": STAGE_FB2R,
            "FB_Last_Checked_At": iso_utc(),
            "Publish_Retry_Eligible": False,
            "FB_Reconcile_Attempt_Count": attempt,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    max_attempts = parse_int(settings.get("FB_PUBLISH_RECONCILE_MAX_ATTEMPTS"), DEFAULT_RECONCILE_MAX_ATTEMPTS) or DEFAULT_RECONCILE_MAX_ATTEMPTS
    expected = facebook_message(output).strip()
    result["expected_message"] = expected
    try:
        creds = load_facebook_page_settings(settings, output, client=client)
        graph = FacebookPhotoClient(**creds)
        status_code, payload = graph.recent_feed(since=feed_since(field_str(output, "Publish_Started_At")))
    except FacebookPhotoError as exc:
        status_code, payload = 0, exc.payload
    posts = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(posts, list):
        posts = []
    matches = [
        item
        for item in posts
        if isinstance(item, dict) and str(item.get("message") or "").strip() == expected and str(item.get("id") or "").strip()
    ]
    result["http_status"] = status_code
    result["match_count"] = len(matches)

    if len(matches) == 1:
        post = matches[0]
        post_id = str(post.get("id") or "").strip()
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Platform_Post_ID": post_id,
                "FB_Publish_Status": STATUS_PENDING_FINALIZE,
                "Platform_Media_ID": post_id,
                "Platform_Post_URL": str(post.get("permalink_url") or "").strip(),
                "Publish_Error_Stage": "",
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "FB_Reconcile_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result["needs_finalize"] = True
        result["platform_post_id"] = post_id
        return {"processed": True, **result}

    if len(matches) > 1:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "FB_Publish_Status": STATUS_MANUAL_FALLBACK,
                "Publish_Error_Stage": "FB2R_MULTIPLE_MATCHES",
                "Publish_Error_Message": "FB2R found multiple exact recent Page message matches; automatic recovery is unsafe.",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Manual_Fallback_Required": True,
                "FB_Reconcile_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result["manual_fallback"] = True
        return {"processed": True, **result}

    if attempt < max_attempts:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Publish_Status": PUBLISH_STATUS_PUBLISHING,
                "FB_Publish_Status": STATUS_RECONCILE,
                "Publish_Error_Stage": "FB2R_RECONCILE",
                "Publish_Error_Message": f"FB2R found no exact recent Page message match. Reconciliation attempt {attempt}.",
                "Publish_Next_Retry_At": retry_at(RECONCILE_RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "FB_Reconcile_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result["needs_reconcile"] = True
        return {"processed": True, "retry": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "FB_Publish_Status": STATUS_MANUAL_FALLBACK,
            "Publish_Error_Stage": "FB2R_RECONCILE",
            "Publish_Error_Message": "FB2R found no exact recent Page post after the maximum reconciliation attempts. Do not replay FB2 automatically.",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Manual_Fallback_Required": True,
            "FB_Reconcile_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    result["manual_fallback"] = True
    return {"processed": True, **result}
