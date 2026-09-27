from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from carousel.timeutil import iso_utc, utc_now
from render.fields import json_text
from yt.constants import (
    PACKAGE_READY,
    PROCESSING_SUCCEEDED,
    PUBLISH_STATUS_MANUAL_PUBLISH_REQUIRED,
    PUBLISH_STATUS_PUBLISHING,
    STAGE_YT1,
    STAGE_YT2,
    THUMB_PENDING,
    UPLOAD_FAILED,
    UPLOAD_UPLOADED,
)

RECORD_ID_PREFIX = "rec"
PACIFIC = ZoneInfo("America/Los_Angeles")
_QUOTA_RE = re.compile(
    r"quotaExceeded|dailyLimitExceeded|uploadLimitExceeded|rateLimitExceeded|"
    r"userRateLimitExceeded|youtube\.quota|quota.?exceeded|exceeded your.{0,80}?quota|"
    r"queries per day|"
    # YouTube uploader wraps Google 403 as HTTP 500 + "videos.list failed 403".
    r"videos\.(?:list|insert|update|delete)\s+failed\s+403|"
    r"thumbnails\.set\s+failed\s+403|"
    r"\bfailed 403\b",
    re.IGNORECASE,
)


def valid_record_id(record_id: str) -> bool:
    return record_id.startswith(RECORD_ID_PREFIX) and len(record_id) == 17


def preview(*, stage: str, make_id: int, make_name: str, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": make_id,
        "make_scenario_name": make_name,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "YouTube",
        "stage": stage,
    }


def retry_at(minutes: int) -> str:
    return iso_utc(utc_now() + timedelta(minutes=minutes))


def response_json(payload: Any) -> str:
    return json_text(payload)


def error_text(*parts: Any) -> str:
    chunks: list[str] = []
    for part in parts:
        if part is None or part == "":
            continue
        if isinstance(part, (dict, list)):
            try:
                chunks.append(json.dumps(part, default=str))
            except TypeError:
                chunks.append(str(part))
        else:
            chunks.append(str(part))
    return "\n".join(chunks)


def is_quota_exceeded(*parts: Any) -> bool:
    """True for Google quota reasons and uploader-wrapped videos.* 403 responses."""
    return bool(_QUOTA_RE.search(error_text(*parts)))


def next_pacific_midnight_iso(*, now: datetime | None = None) -> str:
    """Next America/Los_Angeles midnight as UTC ISO-8601 (quota reset boundary)."""
    current = now.astimezone(PACIFIC) if now is not None else datetime.now(PACIFIC)
    local_midnight = datetime(
        year=current.year,
        month=current.month,
        day=current.day,
        tzinfo=PACIFIC,
    )
    if current >= local_midnight:
        local_midnight = local_midnight + timedelta(days=1)
    return iso_utc(local_midnight.astimezone(timezone.utc))


def manual_publish_required_fields(
    *,
    error_stage: str,
    publish_message: str,
    youtube_message: str,
    body: Any = None,
    youtube_stage: str = STAGE_YT1,
    clear_upload_job: bool = True,
    upload_status: str = UPLOAD_FAILED,
    package_status: str | None = PACKAGE_READY,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Park after one failed publish attempt until Pacific midnight auto-retry."""
    fields: dict[str, Any] = {
        "YouTube_Stage": youtube_stage,
        "Publish_Status": PUBLISH_STATUS_MANUAL_PUBLISH_REQUIRED,
        "Publish_Locked_At": None,
        "Publish_Locked_By": "",
        "Publish_Error_Stage": error_stage,
        "Publish_Error_Message": publish_message,
        "Publish_Next_Retry_At": next_pacific_midnight_iso(),
        "YouTube_Error_Message": youtube_message,
        "YouTube_Response_JSON": response_json(body) if body is not None else "",
        "YouTube_Upload_Status": upload_status,
        "Publish_Retry_Eligible": True,
        "Manual_Fallback_Required": True,
        "Manual_Completion_Status": "Required",
    }
    if clear_upload_job:
        fields["YouTube_Upload_Job_ID"] = ""
    if package_status is not None:
        fields["YouTube_Package_Status"] = package_status
    if extra:
        fields.update(extra)
    return fields


COVER_QUOTA_MESSAGE = (
    "YouTube cover will retry after Pacific midnight. The Short is already live. No operator action."
)


def cover_quota_park_fields(
    *,
    youtube_message: str,
    body: Any = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Park thumbnails.set quota on a live Short until Pacific midnight. Not operator work."""
    fields: dict[str, Any] = {
        "YouTube_Stage": STAGE_YT2,
        "Publish_Status": PUBLISH_STATUS_PUBLISHING,
        "Publish_Locked_At": None,
        "Publish_Locked_By": "",
        "Publish_Error_Stage": "YTS2_THUMBNAIL",
        "Publish_Error_Message": COVER_QUOTA_MESSAGE,
        "Publish_Next_Retry_At": next_pacific_midnight_iso(),
        "YouTube_Error_Message": youtube_message,
        "YouTube_Response_JSON": response_json(body) if body is not None else "",
        "YouTube_Upload_Status": UPLOAD_UPLOADED,
        "Publish_Retry_Eligible": True,
        "Manual_Fallback_Required": False,
        "Manual_Completion_Status": "Not Required",
        "YouTube_Thumbnail_Status": THUMB_PENDING,
        "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
    }
    if extra:
        fields.update(extra)
    return fields
