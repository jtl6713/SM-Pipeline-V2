from integrations.gmail import PURPOSE_TIKTOK_HANDOFF, GmailClient
from i2.constants import I2_EMAIL_ENABLED
from c3.constants import C3_EMAIL_ENABLED
from p4.constants import P4_EMAIL_ENABLED
from p5.constants import P5_EMAIL_ENABLED
from rr1.constants import REVIEW_EMAIL_ENABLED
from studio_produce.ops_alert import OPS_ALERT_EMAIL_ENABLED, send_produce_escalation


def test_only_tiktok_handoff_purpose_is_allowed():
    skipped = GmailClient().send_html(
        to="nobody@example.com",
        subject="should not send",
        html_body="<p>no</p>",
        purpose="rr1_review",
    )
    assert skipped["skipped"] is True
    assert skipped["reason"] == "email_disabled"


def test_blank_purpose_is_blocked():
    skipped = GmailClient().send_html(
        to="nobody@example.com",
        subject="should not send",
        html_body="<p>no</p>",
    )
    assert skipped["skipped"] is True


def test_non_tiktok_email_flags_are_off():
    assert PURPOSE_TIKTOK_HANDOFF == "ttd3_tiktok_handoff"
    assert I2_EMAIL_ENABLED is False
    assert C3_EMAIL_ENABLED is False
    assert P4_EMAIL_ENABLED is False
    assert P5_EMAIL_ENABLED is False
    assert REVIEW_EMAIL_ENABLED is False
    assert OPS_ALERT_EMAIL_ENABLED is False


def test_ops_alert_skips_gmail(monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("ops alert must not send Gmail")

    monkeypatch.setattr("studio_produce.ops_alert.GmailClient.send_html", boom)
    result = send_produce_escalation(
        request_id="PR-TEST",
        job={"error": "blocked", "heal": {"resume_count": 3}},
    )
    assert result["ok"] is True
    assert result["email_skipped"] is True
    assert result["email_reason"] == "email_disabled"
