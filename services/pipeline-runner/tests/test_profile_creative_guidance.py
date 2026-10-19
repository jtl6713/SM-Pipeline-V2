from studio_produce.creative_guidance import (
    profile_id_from_records, parse_creative_guidance, load_profile_creative_guidance,
    creative_prompt_suffix,
)


class FakeClient:
    def __init__(self, value):
        self.value = value
        self.calls = []

    def list_records(self, table, **options):
        self.calls.append((table, options))
        return [{"fields": {"Setting_Value": self.value}}]


def test_scoped_guidance_uses_explicit_content_profile_only():
    chicago = "rec12345678901234"
    client = FakeClient('{"shared_direction":"local guide","thumbnail_instructions":"gold","narration_instructions":"warm"}')
    assert profile_id_from_records({"fields": {"Content_Profile": [chicago]}}) == chicago
    creative = load_profile_creative_guidance(client, {"fields": {"Content_Profile": [chicago]}})
    assert creative["narration_instructions"] == "warm"
    assert chicago in client.calls[0][1]["formula"]
    assert "gold" in creative_prompt_suffix(creative, mode="thumbnail")
    assert "warm" in creative_prompt_suffix(creative, mode="narration")
    assert "warm" not in creative_prompt_suffix(creative, mode="thumbnail")
    assert "gold" not in creative_prompt_suffix(creative, mode="narration")


def test_no_profile_does_not_guess_by_city_or_query_other_profiles():
    client = FakeClient("{}")
    assert profile_id_from_records({"fields": {"Market_Name": "Miami"}}) == ""
    assert load_profile_creative_guidance(client, {"fields": {"Market_Name": "Miami"}})["shared_direction"] == ""
    assert client.calls == []


def test_defaults_and_malformed_settings_are_safe():
    assert parse_creative_guidance("bad json")["thumbnail_instructions"] == ""
    assert creative_prompt_suffix({}, mode="narration") == ""
