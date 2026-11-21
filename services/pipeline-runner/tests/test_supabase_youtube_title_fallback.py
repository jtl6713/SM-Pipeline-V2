"""YouTube YT0 reads the exact Supabase parent title without a provider action."""
from __future__ import annotations

import pytest

from airtable.constants import PLATFORM_OUTPUTS_TABLE
from supabase_reads import _record_from_row


@pytest.mark.parametrize("platform", ["YouTube", "TikTok"])
def test_blank_output_title_uses_exact_supabase_parent(platform: str) -> None:
    record = _record_from_row({
        "airtable_record_id": "recKpst2oF5qM3vKY",
        "output_number": 10634,
        "platform": platform,
        "output_title": None,
        "content_items": {
            "airtable_record_id": "recAOq4JSNdKIqKH6",
            "content_title": "Wynwood Walls Texture Tease",
        },
    }, PLATFORM_OUTPUTS_TABLE)
    assert record is not None
    assert record["fields"]["Output_Title"] == "Wynwood Walls Texture Tease"


def test_nonblank_output_title_remains_authoritative() -> None:
    record = _record_from_row({
        "airtable_record_id": "rec21RlfXCIJbQlde",
        "output_number": 10581,
        "platform": "YouTube",
        "output_title": "Specific approved YouTube headline",
        "content_items": {
            "airtable_record_id": "rec5DZUqcqXG3F3Mw",
            "content_title": "Different parent title",
        },
    }, PLATFORM_OUTPUTS_TABLE)
    assert record["fields"]["Output_Title"] == "Specific approved YouTube headline"


@pytest.mark.parametrize("parent", [None, {}, {"content_title": ""}, {"content_title": "   "}])
def test_missing_parent_does_not_invent_output_title(parent) -> None:
    record = _record_from_row({
        "airtable_record_id": "recM4QtGwXHOUC3Gz",
        "output_number": 10677,
        "platform": "YouTube",
        "output_title": None,
        "content_items": parent,
    }, PLATFORM_OUTPUTS_TABLE)
    assert not record["fields"].get("Output_Title")


def test_other_platform_does_not_inherit_youtube_title_policy() -> None:
    record = _record_from_row({
        "airtable_record_id": "recKpst2oF5qM3vKY",
        "output_number": 10634,
        "platform": "Instagram",
        "output_title": None,
        "content_items": {"content_title": "Parent title not assigned to Instagram"},
    }, PLATFORM_OUTPUTS_TABLE)
    assert not record["fields"].get("Output_Title")
