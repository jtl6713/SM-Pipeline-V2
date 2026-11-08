from datetime import datetime, timedelta, timezone

from ttd.eligibility import ttd1_eligibility_reason, ttd2_eligibility_reason
from ttd.recovery import photo_delivery_recovery

NOW = datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)


def _recovery(*, age_min=130, init_attempts=1, polls=20, status="PROCESSING_DOWNLOAD", reason=""):
    return photo_delivery_recovery(
        status=status,
        fail_reason=reason,
        poll_attempts=polls,
        max_poll_attempts=20,
        init_attempts=init_attempts,
        last_attempt_at=(NOW - timedelta(minutes=age_min)).isoformat(),
        now=NOW,
    )


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_processing_download_stays_system_owned_during_provider_window():
    assert _recovery(age_min=40) == "slow_poll"
    assert _recovery(age_min=119) == "slow_poll"
    assert _recovery(age_min=130) == "reinit"
    assert _recovery(age_min=130, init_attempts=3) == "provider_hold"


def test_completed_and_not_yet_stale_drafts_do_not_reinitialize():
    assert _recovery(status="SEND_TO_USER_INBOX") is None
    assert _recovery(status="PUBLISH_COMPLETE") is None
    assert _recovery(polls=19) is None
    assert _recovery(age_min=130, status="PROCESSING_UPLOAD") is None


def test_retryable_tiktok_pull_failure_reinitializes_boundedly():
    assert _recovery(status="FAILED", reason="photo_pull_failed", polls=2) == "reinit"
    assert _recovery(status="FAILED", reason="internal", polls=1, init_attempts=3) == "provider_hold"
    assert _recovery(status="FAILED", reason="auth_removed") is None
    assert _recovery(status="FAILED", reason="spam_risk") is None


def test_future_scheduled_photo_is_eligible_in_15_minute_lead_window():
    scheduled_soon = (datetime.now(timezone.utc) + timedelta(minutes=9)).isoformat()
    scheduled_later = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    row = _record(
        Platform="TikTok",
        Auto_Publish_Enabled=True,
        TikTok_Draft_Status="Waiting for Schedule",
        Scheduled_Post_Date=scheduled_soon,
    )
    assert ttd1_eligibility_reason(row) is None
    future = _record(**{**row["fields"], "Scheduled_Post_Date": scheduled_later})
    assert ttd1_eligibility_reason(future) == "tiktok_draft_before_inbox_lead_window"
    backoff = _record(**{
        **row["fields"], "Publish_Next_Retry_At": scheduled_later,
    })
    assert ttd1_eligibility_reason(backoff) == "tiktok_retry_backoff"


def test_poll_backoff_blocks_premature_repeat_status_requests():
    future = (datetime.now(timezone.utc) + timedelta(minutes=25)).isoformat()
    row = _record(
        Platform="TikTok",
        TikTok_Draft_Status="Processing",
        TikTok_Draft_Publish_ID="p_inbox_url~v2.example",
        Publish_Next_Retry_At=future,
    )
    assert ttd2_eligibility_reason(row) == "tiktok_retry_backoff"
