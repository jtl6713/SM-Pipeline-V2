"""YTS3 — finalize a processed YouTube video (Make 5830623)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc
from render.fields import field_str
from yt.common import preview, valid_record_id
from yt.constants import (
    MAKE_YTS3_ID,
    MAKE_YTS3_NAME,
    OUTPUT_STATUS_PUBLISHED,
    PACKAGE_COMPLETE,
    PUBLISH_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHED_PRIVATELY,
    STAGE_COMPLETE,
)
from yt.eligibility import yts3_eligibility_reason


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="yts3",
        make_id=MAKE_YTS3_ID,
        make_name=MAKE_YTS3_NAME,
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

    reason = yts3_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    video_id = field_str(output, "YouTube_Video_ID")
    privacy = field_str(output, "YouTube_Privacy_Status")
    result["eligibility_reason"] = reason
    result["video_id"] = video_id
    result["privacy"] = privacy
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    now = iso_utc()
    private = privacy.casefold() == "private"
    permalink = f"https://www.youtube.com/watch?v={video_id}"
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Published_At": now,
            "Output_Status": OUTPUT_STATUS_PUBLISHED,
            "YouTube_Stage": STAGE_COMPLETE,
            "Publish_Status": PUBLISH_STATUS_PUBLISHED_PRIVATELY if private else PUBLISH_STATUS_PUBLISHED,
            "Platform_Post_ID": video_id,
            "Platform_Post_URL": permalink,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Error_Stage": "",
            "YouTube_Published_At": now,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "YouTube_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "YouTube_Package_Status": PACKAGE_COMPLETE,
            "YouTube_Last_Checked_At": now,
            "Platform_Publish_Response_JSON": field_str(output, "YouTube_Response_JSON"),
        },
    )
    result["permalink"] = permalink
    result["youtube_stage"] = STAGE_COMPLETE
    return {"processed": True, **result}
