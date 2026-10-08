from sai1.prompt import build_themer_prompt


def test_sai1_prompt_uses_requested_market():
    prompt = build_themer_prompt(
        title="Miami vs Miami Beach myths",
        covered_text="(none)",
        needed=5,
        total=5,
        market="Miami",
    )
    assert "TARGET MARKET\nMiami" in prompt
    assert "in the TARGET MARKET" in prompt
    assert "Each slide must name ONE specific, real, well-known thing" in prompt


def test_sai1_prompt_defaults_to_chicago_for_legacy_calls():
    prompt = build_themer_prompt(
        title="Chicago river ideas",
        covered_text="(none)",
        needed=1,
        total=1,
    )
    assert "TARGET MARKET\nChicago" in prompt


def test_sai1_prompt_forbids_asset_names_and_featuring_inventory_in_post_caption():
    prompt = build_themer_prompt(
        title="Roosevelt Island Tram Plan",
        covered_text="1. Roosevelt Island Tram 1\n2. Roosevelt Island Tram 5",
        needed=0,
        total=2,
        market="New York",
    )
    assert 'Never write a "Featuring:" line' in prompt
    assert "Never copy, quote, enumerate, paraphrase" in prompt
    assert "use those names in the Featuring line" not in prompt


def test_sai1_normalizer_strips_asset_inventory_featuring_line():
    from sai1.processor import _normalize_themes

    result = _normalize_themes({
        "post_caption": "Featuring: Pérez Art Museum Miami 9, Pérez Art Museum Miami 10, Pérez Art Museum Miami 7\nSave this for your next stormy day in the 305.",
        "slides": [],
        "slide_voiceovers": [],
        "hashtags": "#Miami",
    }, needed=0)
    assert "Pérez Art Museum Miami 9" not in result["post_caption"]
    assert "Featuring:" not in result["post_caption"]
    assert result["post_caption"] == "Save this for your next stormy day in the 305."


def test_sai1_normalizer_strips_chicago_italian_beef_asset_names():
    from sai1.processor import _normalize_themes

    result = _normalize_themes({
        "post_caption": (
            "Italian Beef Dip Closeup 🍖\n"
            "Featuring: Chicago Italian Beef 6, Chicago Italian Beef 8, Chicago Italian Beef 1, "
            "Chicago Italian Beef 4, Chicago Italian Beef 3, Chicago Italian Beef 5, Chicago Italian Beef 7.\n"
            "Save this for your next beef run or tag a friend who’d demolish one."
        ),
        "slides": [],
        "slide_voiceovers": [],
        "hashtags": "#Chicago #ItalianBeef",
    }, needed=0)

    assert "Chicago Italian Beef 6" not in result["post_caption"]
    assert "Featuring:" not in result["post_caption"]
    assert result["post_caption"] == (
        "Italian Beef Dip Closeup 🍖\n"
        "Save this for your next beef run or tag a friend who’d demolish one."
    )
