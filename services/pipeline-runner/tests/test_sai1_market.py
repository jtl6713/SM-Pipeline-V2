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
