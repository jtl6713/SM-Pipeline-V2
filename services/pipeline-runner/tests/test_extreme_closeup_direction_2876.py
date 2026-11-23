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
