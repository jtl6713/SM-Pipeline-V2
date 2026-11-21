"""Issue #2532 regression: owner-global creative instructions are Supabase only."""
from unittest.mock import patch

from studio_produce.creative_guidance import (
    creative_prompt_suffix,
    load_profile_creative_guidance,
)


PROFILE = "rec12345678901234"
BRAND = "rec12345678901235"
OWNER = "rec12345678901236"


class FakeClient:
    def __init__(self, *, source="supabase"):
        self._settings = {
            "studio_write_source": source,
            "supabase_url": "https://example.supabase.co",
            "supabase_service_role_key": "test-only",
        }
        self.read_names = []

    def list_records(self, table_id, *, formula=None, max_records=1):
        self.read_names.append(formula)
        if 'Studio_Profile_Creative_' in (formula or ""):
            return [{"fields": {"Setting_Value": '{"shared_direction":"Local detail"}'}}]
        if 'Studio_Owner_Generation_' in (formula or ""):
            assert OWNER in formula
            return [{"fields": {"Setting_Value": '{"prompt":"Consistent quality across cities"}'}}]
        raise AssertionError("unexpected settings lookup")


def _records():
    return {"fields": {"Content_Profile": [PROFILE]}}


def test_supabase_owner_global_inherited_before_profile_direction():
    client = FakeClient()
    requests = []

    def fake_rest(settings, path, method):
        assert method == "GET"
        requests.append(path)
        if path.startswith("content_profiles?"):
            return [{"platform_setup": {"Brand": [BRAND]}}]
        if path.startswith("brands?"):
            return [{"organization_id": "11111111-2222-3333-4444-555555555555"}]
        if path.startswith("organizations?"):
            return [{"airtable_record_id": OWNER}]
        raise AssertionError(path)

    with patch("supabase_pipeline._rest", fake_rest):
        guidance = load_profile_creative_guidance(client, _records())
    assert guidance["owner_global_direction"] == "Consistent quality across cities"
    text = creative_prompt_suffix(guidance, mode="thumbnail")
    assert text.index("Consistent quality") < text.index("Local detail")
    assert len(requests) == 3


def test_ambiguous_owner_never_inherits_different_organization_prompt():
    client = FakeClient()

    def fake_rest(settings, path, method):
        if path.startswith("content_profiles?"):
            return [{"brand_name": "Ambiguous Brand", "platform_setup": {}}]
        if path.startswith("brands?"):
            return [
                {"organization_id": "11111111-2222-3333-4444-555555555555"},
                {"organization_id": "99999999-2222-3333-4444-555555555555"},
            ]
        raise AssertionError("owner lookup should stop on ambiguous brand")

    with patch("supabase_pipeline._rest", fake_rest):
        guidance = load_profile_creative_guidance(client, _records())
    assert guidance["owner_global_direction"] == ""
    assert guidance["shared_direction"] == "Local detail"
    assert not any("Studio_Owner_Generation_" in name for name in client.read_names)


def test_no_authoritative_supabase_never_reads_legacy_airtable():
    client = FakeClient(source="airtable")
    client.list_records = lambda *args, **kwargs: (_ for _ in ()).throw(
        AssertionError("legacy Airtable must not be queried")
    )
    guidance = load_profile_creative_guidance(client, _records())
    assert guidance["shared_direction"] == ""
