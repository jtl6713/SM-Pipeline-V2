"""#2294: a full-row refresh must never release an existing publication hold."""
from unittest.mock import patch

from supabase_pipeline import _preserve_existing_native_gallery_hold


def test_held_output_stays_held_and_unscheduled():
    row = {"airtable_record_id": "recX9tOrTfQldqs32", "do_not_publish": False,
           "auto_publish_enabled": True, "publish_retry_eligible": True,
           "scheduled_post_date": "2026-12-01T12:00:00Z",
           "studio_scheduled_at": "2026-12-01T12:00:00Z"}
    with patch("supabase_pipeline._rest", return_value=[{"do_not_publish": True}]) as read:
        actual = _preserve_existing_native_gallery_hold({}, row)
    assert actual["do_not_publish"] is True
    assert actual["auto_publish_enabled"] is False
    assert actual["publish_retry_eligible"] is False
    assert actual["scheduled_post_date"] is None
    assert actual["studio_scheduled_at"] is None
    assert row["do_not_publish"] is False
    assert read.call_args.args[-1] == "GET"


def test_unheld_output_does_not_acquire_unrequested_hold():
    row = {"airtable_record_id": "recX9tOrTfQldqs32", "do_not_publish": False}
    with patch("supabase_pipeline._rest", return_value=[{"do_not_publish": False}]):
        assert _preserve_existing_native_gallery_hold({}, row) is row


def test_readback_error_fails_closed():
    row = {"airtable_record_id": "recX9tOrTfQldqs32", "do_not_publish": False}
    with patch("supabase_pipeline._rest", return_value=None):
        try:
            _preserve_existing_native_gallery_hold({}, row)
            assert False, "must not proceed without hold readback"
        except RuntimeError as error:
            assert str(error) == "native_gallery_hold_readback_unavailable"
