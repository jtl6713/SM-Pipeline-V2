"""#2876: new AI-image focal detail variety; never crop/replace existing media."""

from idea.prompt import build_i1_prompt
from sai1.prompt import build_themer_prompt
from studio_produce.closeup_direction import (
    CLOSEUP_SHARE_ENV,
    DEFAULT_EXTREME_CLOSEUP_SHARE,
    ai_slide_closeup_guidance,
    closeup_target,
    cover_closeup_guidance,
    extreme_closeup_share,
    market_closeup_examples,
)
from studio_produce.thumbnail_prompt import build_finished_thumbnail_prompt


def test_default_one_third_of_new_image_batches(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    assert abs(extreme_closeup_share() - 1 / 3) < 0.00001
    assert DEFAULT_EXTREME_CLOSEUP_SHARE == 1 / 3
    assert closeup_target(0) == 0
    assert closeup_target(3) == 1
    assert closeup_target(4) == 1
    assert closeup_target(6) == 2
    assert closeup_target(9) == 3
    assert closeup_target(10) == 3


def test_config_disabled_one_third_or_forced(monkeypatch):
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "0")
    assert extreme_closeup_share() == 0
    assert ai_slide_closeup_guidance(market="Miami", requested_count=6, creation_key="x") == ""
    assert cover_closeup_guidance(market="Chicago", creation_key="x") == ""
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "1")
    assert closeup_target(3) == 3
    assert closeup_target(1, creation_key="single") == 1
    assert "NEW AI COVER" in cover_closeup_guidance(market="Miami", creation_key="single")
    for bad in ("banana", "-1", "1.1", "NaN", "inf"):
        monkeypatch.setenv(CLOSEUP_SHARE_ENV, bad)
        assert extreme_closeup_share() == 1 / 3


def test_single_new_ai_creation_stable_sampling_without_global_force(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    targets = [closeup_target(1, creation_key=f"new-image-{i}") for i in range(120)]
    assert 20 <= sum(targets) <= 60
    assert targets == [closeup_target(1, creation_key=f"new-image-{i}") for i in range(120)]
    assert closeup_target(1) == 0  # unidentifiable image never overrides a prior choice


def test_local_examples_are_specific_to_each_profile():
    assert "Wrigley Building" in market_closeup_examples("Chicago")
    assert "Grand Central" in market_closeup_examples("New York City")
    assert "Griffith" in market_closeup_examples("Los Angeles")
    assert "Vizcaya" in market_closeup_examples("Miami Beach")
    assert "Wrigley" not in market_closeup_examples("Miami")


def test_ideas_are_not_image_generation_and_receive_no_forced_closeup(monkeypatch):
    from i1 import processor

    class Client:
        _settings = {}

        def get_record(self, table, record_id):
            return {"id": record_id, "fields": {
                "Profile_Name": "ChicagoShining", "Market_Name": "Chicago",
                "Daily_Idea_Limit": 10,
            }}

    monkeypatch.setattr(processor, "AirtableClient", Client)
    result = processor.process_request(
        profile_record_id="rec" + "P" * 14,
        requested_count=4, dry_run=True,
    )
    assert "EXTREME CLOSE-UP CREATIVE PRIORITY" not in result["prompt"]
    assert "NEW AI IMAGE FOCAL-DETAIL VARIETY" not in result["prompt"]
    original = build_i1_prompt({"fields": {"Market_Name": "Chicago"}}, remaining_slots=1, quality="Balanced")
    for field in ('"suggested_visuals"', '"required_assets"', '"ideas"'):
        assert field in original


def test_ai_slide_prompt_requests_one_zoomable_detail_for_three_new_images(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    prompt = build_themer_prompt(
        title="Miami Art Deco Details", covered_text="(none)", needed=3,
        total=3, market="Miami",
        creative_guidance={"narration_instructions": "Friendly and brief"},
    )
    assert "approximately 1 image(s)" in prompt
    assert "brand-new AI-generated images" in prompt
    assert "chose to zoom in" in prompt
    assert "naturally composed instead of pre-cropping" in prompt
    assert "Never replace, crop, overwrite, re-rank or modify existing media" in prompt
    assert "Vizcaya stonework" in prompt
    assert "Friendly and brief" in prompt
    assert "slides array length must be exactly the REQUESTED COUNT" in prompt


def test_single_slide_batch_uses_stable_per_creation_key(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    covered = "(none)"
    results = []
    for idx in range(90):
        title = f"Chicago Scene {idx}"
        key = f"Chicago|{title}|1|{covered}"
        prompt = build_themer_prompt(title=title, covered_text=covered,
                                     needed=1, total=1, market="Chicago")
        included = "NEW AI IMAGE FOCAL-DETAIL VARIETY" in prompt
        results.append(included)
        assert included == (closeup_target(1, creation_key=key) == 1)
    assert 15 <= sum(results) <= 45


def test_new_cover_prompt_one_third_not_every_cover(monkeypatch):
    monkeypatch.delenv(CLOSEUP_SHARE_ENV, raising=False)
    prompts = [build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": f"Chicago Feature {i}"}},
        {"fields": {"Market_Name": "Chicago"}},
        aspect_ratio="9:16",
    ) for i in range(90)]
    selected = [p for p in prompts if "NEW AI COVER FOCAL-DETAIL OPTION" in p]
    assert 15 <= len(selected) <= 45
    for prompt in selected:
        assert "could choose a close-up" in prompt.lower()
        assert "Do not crop or zoom the original" in prompt
        assert "Never substitute, recrop, regenerate or overwrite" in prompt
        assert "9:16 platform cover" in prompt


def test_existing_finished_cover_prompt_not_rewritten_for_new_style():
    existing = "Gold block lettering, FRAME: Exact portrait vertical 9:16 and original approved subject."
    old = {"fields": {"Thumbnail_Prompt": existing, "Market_Name": "Chicago"}}
    prompt = build_finished_thumbnail_prompt({}, old, aspect_ratio="9:16")
    assert prompt == existing


def test_existing_thumb_with_url_does_not_get_new_focal_direction_even_if_prompt_is_built(monkeypatch):
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "1")
    parent = {"fields": {
        "Market_Name": "Chicago", "Content_Title": "Wrigley Building Clock",
        "Thumbnail_URL": "https://media.chicagoshining.com/studio/previews/thumbnails/old-cover.png",
    }}
    result = build_finished_thumbnail_prompt({}, parent, aspect_ratio="9:16")
    assert "Create a ChicagoShining social thumbnail" in result
    assert "NEW AI COVER FOCAL-DETAIL OPTION" not in result


def test_creators_explicit_framing_and_landmark_accuracy_still_take_priority(monkeypatch):
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "1")
    cover = cover_closeup_guidance(market="LA", creation_key="new-cover")
    assert "honor any explicit creator framing" in cover
    assert "Never substitute, recrop, regenerate or overwrite" in cover
    slide = ai_slide_closeup_guidance(market="New York", requested_count=3, creation_key="new-slide")
    assert "Do not fabricate actual landmark details" in slide
    assert "creator-supplied" in slide
    assert "preserve" in slide.lower()


def test_profile_brand_from_verified_linked_market_not_generic_chicago(monkeypatch):
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "1")
    parent = {"fields": {"Content_Title": "Ocean Drive Neon", "Content_Profile": ["rec" + "M" * 14]}}
    profile = {"fields": {"Market_Name": "Miami", "Brand_Name": "Miami Shining"}}
    prompt = build_finished_thumbnail_prompt({}, parent, profile=profile)
    assert "Create a Miami Shining social thumbnail" in prompt
    assert "Ocean Drive Art Deco neon" in prompt
    assert "ChicagoShining" not in prompt
    assert "Wrigley Building" not in prompt


def test_missing_profile_neutral_brand_no_inferred_chicago():
    prompt = build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": "An Unknown Location"}},
        {"fields": {}},
    )
    assert "Create a Shining Cities social thumbnail" in prompt
    assert "ChicagoShining" not in prompt


def test_cover_runner_uses_linked_content_profile(monkeypatch):
    from studio_produce import thumbnail

    class FakeClient:
        def get_record(self, table, record_id):
            assert table == thumbnail.CONTENT_PROFILES_TABLE
            assert record_id == "rec" + "N" * 14
            return {"fields": {"Market_Name": "New York City", "Brand_Name": "New York Shining"}}

    received = {}
    monkeypatch.setenv(CLOSEUP_SHARE_ENV, "1")
    monkeypatch.setattr(thumbnail, "load_profile_creative_guidance", lambda *a: {})
    monkeypatch.setattr(thumbnail, "generate_thumbnail_png",
                        lambda prompt, aspect_ratio: received.update(prompt=prompt, ratio=aspect_ratio) or b"png")
    monkeypatch.setattr(thumbnail, "brand_watermark_bytes", lambda client: b"watermark")
    monkeypatch.setattr(thumbnail, "apply_watermark_bytes",
                        lambda raw, watermark, output_format: raw)
    result, prompt = thumbnail._generate_cover_bytes(
        FakeClient(), {"fields": {}},
        {"fields": {"Content_Title": "Grand Central Clock",
                    "Content_Profile": ["rec" + "N" * 14]}}, aspect_ratio="9:16",
    )
    assert result == b"png"
    assert "New York Shining" in prompt
    assert "Grand Central's clock" in prompt
    assert "Wrigley Building" not in prompt
    assert received["ratio"] == "9:16"


def test_existing_library_asset_order_remains_unchanged_even_for_macro_ideas():
    from i1.asset_sourcing import idea_sourcing_fields

    assets = [
        {"id": "rec" + "W" * 14, "key": "vizcaya", "shot_type": "Wide"},
        {"id": "rec" + "D" * 14, "key": "vizcaya", "shot_type": "Detail"},
        {"id": "rec" + "M" * 14, "key": "vizcaya", "shot_type": "Close-up"},
        {"id": "rec" + "F" * 14, "key": "centralpark", "shot_type": "Close-up"},
    ]
    ctx = {"mode": "existing", "available": True, "assets": assets}
    for requested_visual in ("Extreme close-up of stonework", "Wide garden and building overview"):
        fields = idea_sourcing_fields({
            "primary_location": "Vizcaya Museum and Gardens",
            "suggested_visuals": requested_visual,
        }, ctx)
        assert fields["Suggested_Library_Asset_IDs"] == [
            "rec" + "W" * 14, "rec" + "D" * 14, "rec" + "M" * 14,
        ]
        assert fields["Verified_Library_Asset_IDs"] == []


def test_no_automatic_media_crop_or_approval_in_new_direction_module():
    from pathlib import Path
    import studio_produce.closeup_direction as direction
    code = Path(direction.__file__).read_text(encoding="utf-8")
    assert "requests.post(" not in code
    assert "update_record(" not in code
    assert "idea_closeup_guidance(" not in code
    assert "only to brand-new ai-generated images" in code.lower()
