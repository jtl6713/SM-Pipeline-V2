"""YTS3 — finalize a processed YouTube video (Make 5830623)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc
from render.fields import field_str
from ap0.public_cover import ensure_youtube_short_cover_url, graph_fetchable_cover_url, native_grid_cover_required
from item4.settings import PipelineSettings
from yt.client import YouTubeUploaderClient, load_uploader_settings
from yt.common import preview, response_json, retry_at, valid_record_id
from yt.constants import (
    MAKE_YTS3_ID,
    MAKE_YTS3_NAME,
    OUTPUT_STATUS_PUBLISHED,
    PACKAGE_COMPLETE,
    PUBLISH_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHED_PRIVATELY,
    RETRY_MINUTES,
    STAGE_COMPLETE,
    STAGE_YT4,
    THUMB_UPLOADED,
)
from yt.eligibility import yts3_eligibility_reason
from yt.package import youtube_thumbnail_publish_enabled
from yt.yts2 import thumbnail_fallback_source, vertical_still_attached


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

    pipeline_settings = PipelineSettings(client)
    thumb_publish = youtube_thumbnail_publish_enabled(pipeline_settings, record=output)
    result["thumbnail_publish"] = thumb_publish
    reason = yts3_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
        require_native_cover=thumb_publish,
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
    cover_required = native_grid_cover_required(output)
    if thumb_publish and cover_required:
        settings = load_uploader_settings(PipelineSettings(client), output, client=client)
        uploader = YouTubeUploaderClient(base_url=settings["url"], secret=settings["secret"])
        try:
            thumb_url = ensure_youtube_short_cover_url(client, output) or field_str(output, "Thumbnail_URL")
        except Exception:
            thumb_url = field_str(output, "Thumbnail_URL")
        if not graph_fetchable_cover_url(thumb_url):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    "YouTube_Stage": STAGE_YT4,
                    "Publish_Error_Stage": "YTS3_THUMBNAIL",
                    "Publish_Error_Message": "YouTube Short needs a public native grid cover before publish.",
                    "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                    "YouTube_Error_Message": "YTS3 missing Graph/YouTube-fetchable Thumbnail_URL.",
                    "Publish_Retry_Eligible": True,
                    "YouTube_Last_Checked_At": now,
                },
            )
            result["retry"] = True
            return {"processed": True, "retry": True, "reason": "missing_native_cover", **result}
        thumb_code, thumb_body = uploader.set_thumbnail(
            video_id=video_id,
            source_url=thumb_url,
            fallback_source_url=thumbnail_fallback_source(output, cover_required=True),
            vertical=True,
        )
        result["thumbnail_http_status"] = thumb_code
        if not (200 <= thumb_code <= 299) or not vertical_still_attached(thumb_body):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    "YouTube_Stage": STAGE_YT4,
                    "Publish_Error_Stage": "YTS3_VERTICAL_STILL",
                    "Publish_Error_Message": "YouTube Short thumbnail did not attach. Keeping the video unpublished until the 3D cover is set.",
                    "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                    "YouTube_Error_Message": f"YTS3 vertical still missing. HTTP {thumb_code}: {thumb_body}",
                    "YouTube_Response_JSON": response_json(thumb_body),
                    "Publish_Retry_Eligible": True,
                    "YouTube_Last_Checked_At": now,
                },
            )
            result["retry"] = True
            return {"processed": True, "retry": True, **result}
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Thumbnail_Status": THUMB_UPLOADED,
                "YouTube_Response_JSON": response_json(thumb_body),
                "YouTube_Last_Checked_At": now,
            },
        )

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
