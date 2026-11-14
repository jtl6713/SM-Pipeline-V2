"""Regression: a repeated TikTok delivery must not rearm its handoff email."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "ttd"


def test_ttd2_does_not_clear_handoff_receipt():
    source = (ROOT / "ttd2.py").read_text()
    assert '"TikTok_Draft_Email_Sent_At": None' not in source
    assert '"Operational_Email_Sent_At": None' not in source
    assert '"Operational_Email_Key": ""' not in source


def test_ttd1_rearms_receipt_only_for_new_publish_id():
    source = (ROOT / "ttd1.py").read_text()
    assert '"TikTok_Draft_Publish_ID": publish_id' in source
    assert '"TikTok_Draft_Email_Sent_At": None' in source
