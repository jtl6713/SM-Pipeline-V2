"""Bounded, provider-aware recovery for stalled TikTok photo PULL_FROM_URL.

TikTok documents a one-hour media download timeout. Wait at least two
hours before reinitializing a still-processing publish ID, and never
reinitialize a confirmed inbox delivery.
"""
from datetime import datetime, timezone

MAX_AUTO_INIT_ATTEMPTS = 3
STALE_DOWNLOAD_MINUTES = 120
SLOW_POLL_MINUTES = 15
AUTO_REINIT_DELAY_MINUTES = 30
RETRYABLE_FAILED_REASONS = {"photo_pull_failed", "internal"}


def since_init_minutes(last_attempt_at: str, now: datetime | None = None) -> float | None:
    if not last_attempt_at:
        return None
    try:
        started = datetime.fromisoformat(str(last_attempt_at).replace("Z", "+00:00"))
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        return max(0.0, (current - started).total_seconds() / 60.0)
    except (TypeError, ValueError, OverflowError):
        return None


def photo_delivery_recovery(
    *,
    status: str,
    fail_reason: str,
    poll_attempts: int,
    max_poll_attempts: int,
    init_attempts: int,
    last_attempt_at: str,
    now: datetime | None = None,
) -> str | None:
    """Return reinit, slow_poll, provider_hold, or None.

    Never turn a non-terminal PROCESSING_DOWNLOAD into a manual-user task.
    """
    state = str(status or "").strip().upper()
    failure = str(fail_reason or "").strip().lower()
    recover_failed = state == "FAILED" and failure in RETRYABLE_FAILED_REASONS
    slow_download = state == "PROCESSING_DOWNLOAD" and poll_attempts >= max_poll_attempts
    if not recover_failed and not slow_download:
        return None
    age = since_init_minutes(last_attempt_at, now)
    stale = recover_failed or (age is not None and age >= STALE_DOWNLOAD_MINUTES)
    if not stale:
        return "slow_poll"
    return "reinit" if init_attempts < MAX_AUTO_INIT_ATTEMPTS else "provider_hold"
