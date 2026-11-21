"""TTD1 output identity must be supplied from Supabase without archive reads."""

from airtable.constants import PLATFORM_OUTPUTS_TABLE
from render.fields import field_str
from supabase_reads import _record_from_row
from ttd.package import photo_title


def _row(*, platform="TikTok", output_title=None, content_title="Concert Hall Closeups",
         output_number=10705):
    return {
        "airtable_record_id": "recm7uIyT1y4VEvLd",
        "platform": platform,
        "output_number": output_number,
        "output_title": output_title,
        "content_items": {
            "airtable_record_id": "recParentContent000",
            "content_title": content_title,
        },
        "error_messages": {},
    }


def test_tiktok_missing_output_title_inherits_authoritative_parent():
    row = _record_from_row(_row(), PLATFORM_OUTPUTS_TABLE)
    assert row["id"] == "recm7uIyT1y4VEvLd"
    assert row["fields"]["Output_ID"] == 10705
    assert row["fields"]["Output_Title"] == "Concert Hall Closeups"
    assert photo_title(row) == "Concert Hall Closeups"


def test_tiktok_specific_output_title_wins_over_parent():
    row = _record_from_row(
        _row(output_title="Custom TikTok Headline"),
        PLATFORM_OUTPUTS_TABLE,
    )
    assert row["fields"]["Output_Title"] == "Custom TikTok Headline"


def test_tiktok_with_no_credible_title_is_not_fabricated():
    row = _record_from_row(_row(content_title=None), PLATFORM_OUTPUTS_TABLE)
    assert not field_str(row, "Output_Title")


def test_non_tiktok_output_does_not_inherit_tiktok_title_fallback():
    row = _record_from_row(_row(platform="Instagram"), PLATFORM_OUTPUTS_TABLE)
    assert not field_str(row, "Output_Title")


def test_tiktok_missing_numeric_id_is_not_fabricated():
    row = _record_from_row(_row(output_number=None), PLATFORM_OUTPUTS_TABLE)
    assert not row["fields"].get("Output_ID")
    assert row["fields"]["Output_Title"] == "Concert Hall Closeups"
