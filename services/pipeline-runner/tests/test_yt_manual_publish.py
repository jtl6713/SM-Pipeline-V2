from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from yt.common import (
    is_quota_exceeded,
    manual_publish_required_fields,
    next_pacific_midnight_iso,
)
from yt.constants import PUBLISH_STATUS_MANUAL_PUBLISH_REQUIRED, STAGE_YT1

PACIFIC = ZoneInfo("America/Los_Angeles")


def test_is_quota_exceeded_detects_google_reasons():
    assert is_quota_exceeded(403, {"error": {"errors": [{"reason": "quotaExceeded"}]}})
    assert is_quota_exceeded("The request cannot be completed because you have exceeded your <a href=\"/youtube/v3/getting-started#quota\">quota</a>.")
    assert is_quota_exceeded("The request cannot be completed because you have exceeded your quota.")
    assert not is_quota_exceeded(500, {"error": "backendError"})


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
