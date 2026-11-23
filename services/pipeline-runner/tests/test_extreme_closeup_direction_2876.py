"""Regression tests for the prompt-only first slice of issue #2876."""

from idea.prompt import build_i1_prompt
from sai1.prompt import build_themer_prompt
from studio_produce.closeup_direction import (
    CLOSEUP_SHARE_ENV,
    ai_slide_closeup_guidance,
    closeup_target,
    cover_closeup_guidance,
    extreme_closeup_share,
    idea_closeup_guidance,
    market_closeup_examples,
)
from studio_produce.thumbnail_prompt import build_finished_thumbnail_prompt


def test_default_is_half_of_eligible_candidate_sets(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    assert extreme_closeup_share() == 0.5
    assert closeup_target(0) == 0
    assert closeup_target(4) == 2
    assert closeup_target(5) == 3
    assert closeup_target(10) == 5


def test_setting_is_configurable_and_invalid_values_are_bounded(monkeypatch):
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "0")
    assert extreme_closeup_share() == 0
    assert idea_closeup_guidance(market="Chicago", candidates=10) == ""
    assert ai_slide_closeup_guidance(market="Miami", requested_count=5) == ""
    assert cover_closeup_guidance() == ""
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "1")
    assert closeup_target(7) == 7
    for bad in ("banana", "-1", "1.1", "NaN", "inf"):
        monkeypatch.setenv(CLOSEUP_SHARE_ENV, bad)
        assert extreme_closeup_share() == 0.5


def test_localized_examples_do_not_mix_shining_markets():
    assert "Wrigley Building" in market_closeup_examples("Chicago")
    assert "Grand Central" in market_closeup_examples("New York City")
    assert "Griffith" in market_closeup_examples("Los Angeles")
    assert "Vizcaya" in market_closeup_examples("Miami Beach")
    assert "Wrigley" not in market_closeup_examples("Miami")


def test_i1_actual_dry_run_includes_closeup_visual_brief_without_new_schema(monkeypatch):
    from i1 import processor

    class Client:
        _settings = {}

        def get_record(self, table, record_id):
            return {
                "id": record_id,
                "fields": {
                    "Profile_Name": "ChicagoShining",
                    "Market_Name": "Chicago",
                    "Daily_Idea_Limit": 10,
                },
            }

    monkeypatch.setattr(processor, "AirtableClient", Client)
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    result = processor.process_request(
        profile_record_id="rec" + "P" * 14,
        requested_count=4,
        dry_run=True,
    )
    assert "EXTREME CLOSE-UP CREATIVE PRIORITY" in result["prompt"]
    assert "Wrigley Building clock" in result["prompt"]
    assert "roughly 65–90%" in result["prompt"]
    assert "suggested_visuals" in result["prompt"]
    assert "Do not invent" in result["prompt"]
    assert "no auto-approval" not in result["prompt"].lower()


def test_ai_slide_prompt_steers_two_of_four_eligible_slides_but_preserves_contract(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    prompt = build_themer_prompt(
        title="Miami Art Deco Details",
        covered_text="(none)",
        needed=4,
        total=4,
        market="Miami",
        creative_guidance={"narration_instructions": "Friendly and brief"},
    )
    assert "approximately 2 visually suitable extreme-close-up" in prompt
    assert "Vizcaya stonework" in prompt
    assert "Friendly and brief" in prompt
    assert "slides array length must be exactly the REQUESTED COUNT" in prompt
    assert "do not render words, logos, or UI" in prompt
    assert "Preserve all existing slide-count" in prompt


def test_generated_cover_prefers_closeup_without_losing_ratio_or_lettering(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    prompt = build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": "Wrigley Building Clock"}},
        {"fields": {"Market_Name": "Chicago"}},
        aspect_ratio="9:16",
    )
    assert "single recognizable clock" in prompt
    assert "65–90%" in prompt
    assert "9:16 platform cover" in prompt
    assert "safe margins" in prompt
    assert "Do not fabricate" in prompt


def test_closeup_direction_never_overrides_explicit_creator_composition():
    assert "Do not invent real-world landmark features" in idea_closeup_guidance(
        market="New York", candidates=5,
    )
    assert "use a truthful medium/establishing composition" in ai_slide_closeup_guidance(
        market="Chicago", requested_count=3,
    )
    assert "Do not fabricate" in cover_closeup_guidance(market="LA")
    assert "override an explicit composition" in cover_closeup_guidance()


def test_short_single_idea_still_respects_original_json_schema():
    original = build_i1_prompt({"fields": {"Market_Name": "Chicago"}}, remaining_slots=1, quality="Balanced")
    assert '"suggested_visuals"' in original
    assert '"required_assets"' in original
    assert '"ideas"' in original


def test_cover_uses_explicit_linked_city_profile_instead_of_chicago_default(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    parent = {"fields": {"Content_Title": "Ocean Drive Neon", "Content_Profile": ["rec" + "M" * 14]}}
    profile = {"fields": {"Market_Name": "Miami", "Brand_Name": "Miami Shining"}}
    prompt = build_finished_thumbnail_prompt({}, parent, profile=profile)
    assert "Create a Miami Shining social thumbnail" in prompt
    assert "Ocean Drive Art Deco neon" in prompt
    assert "ChicagoShining" not in prompt
    assert "Wrigley Building" not in prompt


def test_cover_without_verified_profile_uses_neutral_brand_not_chicago():
    prompt = build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": "An Unknown Location"}},
        {"fields": {}},
    )
    assert "Create a Shining Cities social thumbnail" in prompt
    assert "ChicagoShining" not in prompt


def test_cover_runner_gets_profile_from_explicit_content_profile(monkeypatch):
    from studio_produce import thumbnail

    class FakeClient:
        def get_record(self, table, record_id):
            assert table == thumbnail.CONTENT_PROFILES_TABLE
            assert record_id == "rec" + "N" * 14
            return {"fields": {"Market_Name": "New York City", "Brand_Name": "New York Shining"}}

    received = {}
    monkeypatch.setattr(thumbnail, "load_profile_creative_guidance", lambda *a: {})
    monkeypatch.setattr(thumbnail, "generate_thumbnail_png",
                        lambda prompt, aspect_ratio: received.update(prompt=prompt, ratio=aspect_ratio) or b"png")
    monkeypatch.setattr(thumbnail, "brand_watermark_bytes", lambda client: b"watermark")
    monkeypatch.setattr(thumbnail, "apply_watermark_bytes",
                        lambda raw, watermark, output_format: raw)
    result, prompt = thumbnail._generate_cover_bytes(
        FakeClient(),
        {"fields": {}},
        {"fields": {"Content_Title": "Grand Central Clock", "Content_Profile": ["rec" + "N" * 14]}},
        aspect_ratio="9:16",
    )
    assert result == b"png"
    assert "New York Shining" in prompt
    assert "Grand Central's clock" in prompt
    assert "Wrigley Building" not in prompt
    assert received["ratio"] == "9:16"


def test_classified_closeup_library_assets_are_suggested_first_without_auto_approval():
    from i1.asset_sourcing import idea_sourcing_fields

    assets = [
        {"id": "rec" + "W" * 14, "key": "vizcaya", "shot_type": "Wide"},
        {"id": "rec" + "D" * 14, "key": "vizcaya", "shot_type": "Detail"},
        {"id": "rec" + "M" * 14, "key": "vizcaya", "shot_type": "Close-up"},
        {"id": "rec" + "F" * 14, "key": "centralpark", "shot_type": "Close-up"},
    ]
    ctx = {"mode": "existing", "available": True, "assets": assets}
    macro_idea = {
        "primary_location": "Vizcaya Museum and Gardens",
        "suggested_visuals": "Extreme close-up of historic stonework",
        "required_assets": "Macro stone detail",
    }
    fields = idea_sourcing_fields(macro_idea, ctx)
    assert fields["Suggested_Library_Asset_IDs"] == [
        "rec" + "D" * 14, "rec" + "M" * 14, "rec" + "W" * 14,
    ]
    assert fields["Verified_Library_Asset_IDs"] == []
    assert "rec" + "F" * 14 not in fields["Suggested_Library_Asset_IDs"]

    ordinary = idea_sourcing_fields({
        "primary_location": "Vizcaya Museum and Gardens",
        "suggested_visuals": "Wide garden and building overview",
    }, ctx)
    assert ordinary["Suggested_Library_Asset_IDs"] == [
        "rec" + "W" * 14, "rec" + "D" * 14, "rec" + "M" * 14,
    ]


def test_explicit_macro_intent_only_and_classifier_required():
    from i1.asset_sourcing import _asks_for_closeup, _classified_closeup

    assert _asks_for_closeup({"suggested_visuals": "Macro clock face"}) is True
    assert _asks_for_closeup({"required_assets": "Tightly framed skating blade"}) is True
    assert _asks_for_closeup({"candidate_title": "Ice Skate Closeup"}) is True
    assert _asks_for_closeup({"suggested_visuals": "Building architectural details"}) is False
    assert _classified_closeup({"shot_type": "Detail"}) is True
    assert _classified_closeup({"shot_type": "Close-up"}) is True
    assert _classified_closeup({"shot_type": "Wide"}) is False
    assert _classified_closeup({"asset_name": "closeup.jpg"}) is False


def test_actual_supabase_source_metadata_drives_only_advisory_shot_type(monkeypatch):
    from i1 import asset_sourcing as sourcing

    profile_id = "rec" + "M" * 14
    media = {
        "airtable_record_id": "rec" + "X" * 14,
        "asset_name": "Vizcaya-Detail.jpg",
        "asset_role": "Raw Photo",
        "media_class": "Image",
        "asset_status": "Available",
        "active": True,
        "do_not_use": False,
        "google_drive_file_id": "drive-verified",
        "metadata": {
            "location": "Vizcaya Museum and Gardens, Miami",
            "content_profile_airtable_id": profile_id,
            "rights_status": "Owned",
            "classification_status": "Classified",
            "shot_type": "Close-up",
        },
    }
    monkeypatch.setattr(sourcing, "_request",
                        lambda settings, path: [media] if "asset_role=eq.Raw%20Photo" in path else [])
    assets = sourcing._read_source_media({"mock": True}, profile_id)
    assert len(assets) == 1
    assert assets[0]["shot_type"] == "Close-up"
    assert assets[0]["id"] == media["airtable_record_id"]
