from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from yt.common import (
    cover_quota_park_fields,
    is_quota_exceeded,
    manual_publish_required_fields,
    next_pacific_midnight_iso,
)
from yt.constants import PUBLISH_STATUS_MANUAL_PUBLISH_REQUIRED, STAGE_YT1
from yt.yts2 import vertical_still_attached

PACIFIC = ZoneInfo("America/Los_Angeles")


def test_is_quota_exceeded_detects_google_reasons():
    assert is_quota_exceeded(403, {"error": {"errors": [{"reason": "quotaExceeded"}]}})
    assert is_quota_exceeded("The request cannot be completed because you have exceeded your <a href=\"/youtube/v3/getting-started#quota\">quota</a>.")
    assert is_quota_exceeded("The request cannot be completed because you have exceeded your quota.")
    # Uploader often returns HTTP 500 with the Google status embedded in the message.
    assert is_quota_exceeded(500, {"error": "videos.list failed 403"})
    assert is_quota_exceeded("YTS2 poll failed. HTTP 500: {'error': 'videos.list failed 403'}")
    assert is_quota_exceeded(500, {"error": "thumbnails.set failed 403"})
    assert not is_quota_exceeded(500, {"error": "backendError"})


def test_cover_quota_park_fields_keep_live_short():
    fields = cover_quota_park_fields(
        youtube_message="YTS2 thumbnail upload/compression failed. HTTP 500: thumbnails.set failed 403",
        body={"error": "thumbnails.set failed 403"},
    )
    assert fields["YouTube_Stage"] == "YT2"
    assert fields["Publish_Status"] == "Publishing"
    assert fields["Publish_Error_Stage"] == "YTS2_QUOTA"
    assert fields["Manual_Fallback_Required"] is False
    assert "already live" in fields["Publish_Error_Message"]
    assert fields["Publish_Next_Retry_At"].endswith("Z")


def test_next_pacific_midnight_iso_rolls_forward():
    now = datetime(2026, 9, 12, 3, 0, tzinfo=ZoneInfo("UTC"))
    assert next_pacific_midnight_iso(now=now) == "2026-09-12T07:00:00Z"
    at_midnight = datetime(2026, 9, 12, 0, 0, tzinfo=PACIFIC)
    assert next_pacific_midnight_iso(now=at_midnight) == "2026-09-13T07:00:00Z"


def test_manual_publish_required_fields_park_until_midnight():
    fields = manual_publish_required_fields(
        error_stage="YTP1",
        publish_message="parked",
        youtube_message="quotaExceeded",
        body={"error": "quotaExceeded"},
        youtube_stage=STAGE_YT1,
        clear_upload_job=True,
    )
    assert fields["Publish_Status"] == PUBLISH_STATUS_MANUAL_PUBLISH_REQUIRED
    assert fields["YouTube_Stage"] == STAGE_YT1
    assert fields["YouTube_Upload_Job_ID"] == ""
    assert fields["Publish_Retry_Eligible"] is True
    assert fields["Manual_Fallback_Required"] is True
    assert fields["Manual_Completion_Status"] == "Required"
    assert fields["Publish_Error_Stage"] == "YTP1"
    assert fields["Publish_Next_Retry_At"].endswith("Z")


def test_supported_thumbnail_set_response_counts_as_attached():
    body = {
        "kind": "youtube#thumbnailSetResponse",
        "items": [{"default": {"url": "https://i.ytimg.com/example.jpg"}}],
        "apiThumbnailAccepted": True,
    }
    assert vertical_still_attached(body)
    assert not vertical_still_attached({"kind": "youtube#thumbnailSetResponse", "items": []})
