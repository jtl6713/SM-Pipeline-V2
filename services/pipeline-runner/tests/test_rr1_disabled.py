from rr1.constants import REVIEW_EMAIL_ENABLED
from rr1.processor import process_batch


def test_review_email_is_disabled():
    assert REVIEW_EMAIL_ENABLED is False


def test_process_batch_skips_send_when_disabled():
    result = process_batch()
    assert result["processed"] is False
    assert result["reason"] == "review_email_disabled"
