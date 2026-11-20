"""Bounded Meta Graph container-status cooldown, never a media-create permit.

Error (#4) means the account/app request limit was reached. It does not prove
an existing Instagram Story container failed. This module is deliberately
limited to GET-status polling; a media_publish POST failure is ambiguous and
requires its existing stronger duplicate-publication safeguards.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any

RATE_LIMIT_STAGE = "AP1_IGS_POLL_RATE_LIMIT"
BACKOFF_MINUTES = 60


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _parse_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value or "").strip().replace("Z", "+00:00"))
        return _utc(parsed)
    except (TypeError, ValueError, OverflowError):
        return None


def _error_text(status: Any) -> str:
    if isinstance(status, dict):
        error = status.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)
        return str(status.get("status") or status.get("message") or status)
    return str(getattr(status, "status", "") or status or "")


def graph_container_poll_rate_limited(status: Any) -> bool:
    """Recognize throttled Graph GET responses; never treat them as terminal."""
    if isinstance(status, dict):
        error = status.get("error")
        if isinstance(error, dict) and error.get("code") in (4, 17, 32, 613):
            return True
    msg = _error_text(status).lower()
    return (
        bool(re.search(r"\(#(?:4|17|32|613)\)", msg))
        or "application request limit reached" in msg
        or "user request limit reached" in msg
        or "calls to this api have exceeded" in msg
        or "rate limit exceeded" in msg
    )


def next_story_poll_retry_at(existing: Any, *, now: datetime | None = None) -> str:
    clock = _utc(now or datetime.now(timezone.utc))
    prior = _parse_time(existing)
    delayed = clock + timedelta(minutes=BACKOFF_MINUTES)
    if prior is not None and prior > delayed:
        delayed = prior
    return delayed.isoformat(timespec="seconds").replace("+00:00", "Z")


def story_poll_cooldown_reason(error_stage: Any, retry_at: Any, *, now: datetime | None = None) -> str | None:
    if str(error_stage or "").strip().upper() != RATE_LIMIT_STAGE:
        return None
    # Missing or invalid stage-specific cooldown means stop, not a flood of GETs.
    due = _parse_time(retry_at)
    if due is None:
        return "story_poll_cooldown_timestamp_invalid"
    return "story_poll_rate_limited" if due > _utc(now or datetime.now(timezone.utc)) else None
