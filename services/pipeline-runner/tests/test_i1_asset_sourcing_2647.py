"""#2647: deterministic asset sourcing, strict canonical identity and user capture gate."""
from __future__ import annotations

import pytest

from i1 import asset_sourcing as sourcing
from i1 import processor
from i1 import durable_jobs as durable


MIAMI = "rec" + "M" * 14
NYC = "rec" + "N" * 14
VIZ = {
    "airtable_record_id": "rec" + "V" * 14,
    "asset_name": "Vizcaya-gardens-original.jpg",
    "asset_role": "Raw Photo",
    "media_class": "Image",
    "asset_status": "Available",
    "active": True,
    "do_not_use": False,
    "google_drive_file_id": "drive-viz",
    "metadata": {
        "location": "Vizcaya Museum and Gardens, Miami",
        "content_profile_airtable_id": MIAMI,
        "rights_status": "Owned",
        "classification_status": "Classified",
    },
}
HAVANA = {
    **VIZ,
    "airtable_record_id": "rec" + "H" * 14,
    "asset_name": "Little-Havana-Calle-Ocho-original.jpg",
    "google_drive_file_id": "drive-havana",
    "metadata": {**VIZ["metadata"], "location": "Little Havana, Miami"},
}
NYC_ONLY = {
    **VIZ,
    "airtable_record_id": "rec" + "Y" * 14,
    "metadata": {**VIZ["metadata"], "content_profile_airtable_id": NYC,
                 "location": "Central Park, New York City"},
}


def fake_rest_factory(profile_id=MIAMI, *, media=None, titles=None):
    media = list(media if media is not None else [VIZ, HAVANA, NYC_ONLY])
    titles = list(titles or [])
    paths = []

    def fake_rest(_settings, path, method):
        assert method == "GET"
        paths.append(path)
        if path.startswith("content_profiles?"):
            assert f"airtable_record_id=eq.{profile_id}" in path
            return [{"id": "00000000-0000-4000-a000-000000000001",
                     "airtable_record_id": profile_id}]
        if path.startswith("media_assets?"):
            assert f"metadata->>content_profile_airtable_id=eq.{profile_id}" in path
            assert "asset_status=eq.Available" in path
            assert "do_not_use=eq.false" in path
            wanted = "Raw Photo" if "Raw%20Photo" in path else "Raw Footage"
            return [
                row for row in media
                if row.get("asset_role") == wanted
                and row.get("metadata", {}).get("content_profile_airtable_id") == profile_id
            ]
        if path.startswith("idea_candidates?"):
            assert "content_profile_id=eq.00000000-0000-4000-a000-000000000001" in path
            return titles
        if path.startswith("content_items?"):
            assert "content_profile_id=eq.00000000-0000-4000-a000-000000000001" in path
            return []
        pytest.fail("Unexpected canonical query: " + path)
    return fake_rest, paths


def test_defaults_and_strict_validation():
    assert sourcing.sourcing_mode(None) == "balanced"
    assert sourcing.sourcing_mode("EXPLORE") == "explore"
    for bad in ("legacy", "auto", "all", "balanced,explore"):
        with pytest.raises(ValueError, match="asset_sourcing_mode"):
            sourcing.sourcing_mode(bad)


def test_raw_owned_sources_only_no_cross_profile_and_no_variants(monkeypatch):
    bad = [
        {**HAVANA, "airtable_record_id": "rec" + "B" * 14, "do_not_use": True},
        {**HAVANA, "airtable_record_id": "rec" + "C" * 14, "asset_role": "Other"},
        {**HAVANA, "airtable_record_id": "rec" + "D" * 14,
         "metadata": {**HAVANA["metadata"], "rights_status": "Unknown"}},
        {**HAVANA, "airtable_record_id": "rec" + "E" * 14,
         "metadata": {**HAVANA["metadata"], "classification_status": "Processing"}},
    ]
    fake, paths = fake_rest_factory(media=[*bad, HAVANA, VIZ, NYC_ONLY])
    monkeypatch.setattr(sourcing, "_rest", fake)
    context = sourcing.load_sourcing_context({"url": "mock"}, MIAMI, "existing")
    assert context["available"]
    assert sorted(a["id"] for a in context["assets"]) == sorted([VIZ["airtable_record_id"], HAVANA["airtable_record_id"]])
    assert NYC_ONLY["airtable_record_id"] not in str(context)
    assert any("asset_role=eq.Raw%20Photo" in path for path in paths)


def test_vizcaya_history_is_overused_but_havana_is_not(monkeypatch):
    rows = [{"candidate_title": f"Vizcaya View {n}",
             "payload": {"Primary_Location": "Vizcaya Museum and Gardens"}}
            for n in range(8)]
    fake, _ = fake_rest_factory(media=[VIZ, HAVANA], titles=rows)
    monkeypatch.setattr(sourcing, "_rest", fake)
    context = sourcing.load_sourcing_context({"url": "mock"}, MIAMI, "balanced")
    assert any("Vizcaya" in place for place in context["overused"])
    assert sourcing.overused_topic({
        "candidate_title": "Vizcaya Hidden Details",
        "primary_location": "Vizcaya Museum and Gardens",
    }, context)
    assert not sourcing.overused_topic({
        "candidate_title": "Calle Ocho's Music",
        "primary_location": "Little Havana",
    }, context)
    text = sourcing.sourcing_prompt(context)
    assert "half underused" in text
    assert "Vizcaya" in text
    assert sourcing.overused_topic({"candidate_title": "Vizcaya Detail"}, {
        **context, "mode": "existing",
    }) is False


def test_source_suggestions_never_claim_production_ready(monkeypatch):
    fake, _ = fake_rest_factory(media=[
        HAVANA,
        {**HAVANA, "airtable_record_id": "rec" + "Q" * 14},
        {**HAVANA, "airtable_record_id": "rec" + "R" * 14},
    ])
    monkeypatch.setattr(sourcing, "_rest", fake)
    context = sourcing.load_sourcing_context({"url": "mock"}, MIAMI, "existing")
    idea = {
        "candidate_title": "Little Havana Music",
        "primary_location": "Little Havana",
        "required_assets": "Evening street scene, storefront, ambient music",
        "suggested_format": ["Carousel"],
    }
    fields = processor._candidate_fields(
        idea, profile_id=MIAMI, batch_id=None, test_run_id=None,
        sourcing_context=context,
    )
    assert fields["Asset_Readiness"] == "Library candidates"
    assert len(fields["Suggested_Library_Asset_IDs"]) == 3
    assert fields["Verified_Library_Asset_IDs"] == []
    assert fields["Required_Asset_Checklist"] == [
        "Evening street scene", "storefront", "ambient music",
    ]
    assert fields["Studio_Photo_Wait_Status"] == "Waiting"


def test_explore_without_library_creates_user_media_task_not_auto_listen():
    idea = {
        "candidate_title": "Miami River Night Walk",
        "primary_location": "Miami River",
        "suggested_format": ["Photo Set"],
        "required_assets": "Night establishing shot, boat traffic",
    }
    ctx = {"mode": "explore", "available": True, "assets": [], "overused": []}
    fields = processor._candidate_fields(
        idea, profile_id=MIAMI, batch_id=None, test_run_id=None,
        sourcing_context=ctx,
    )
    assert fields["Asset_Sourcing_Mode"] == "explore"
    assert fields["Asset_Readiness"] == "Needs new media"
    assert fields["Studio_Photo_Wait_Status"] == "Needs new media"
    assert fields["Required_Asset_Checklist"] == [
        "Night establishing shot", "boat traffic",
    ]
    assert fields["Verified_Library_Asset_IDs"] == []


def test_no_inventory_no_phantom_asset_ids():
    ctx = sourcing.load_sourcing_context({}, MIAMI, "balanced")
    assert not ctx["available"]
    values = sourcing.idea_sourcing_fields({
        "candidate_title": "Untested New York Stop",
        "primary_location": "Central Park",
    }, ctx)
    assert values["Asset_Readiness"] == "Needs new media"
    assert values["Suggested_Library_Asset_IDs"] == []


def test_durable_mode_is_immutable_and_survives_shortfall(monkeypatch, tmp_path):
    monkeypatch.setenv("I1_DURABLE_ENABLED", "1")
    monkeypatch.setenv("I1_JOB_DB_PATH", str(tmp_path / "i1.sqlite3"))
    monkeypatch.setattr(durable, "start_consumer", lambda: None)
    durable._WAKE.clear()
    batch, profile = "rec" + "B" * 14, "rec" + "P" * 14
    first = durable.enqueue(batch, profile, 10, "Highest Quality", "explore")
    assert first["accepted"] and not first["already_exists"]
    assert durable.enqueue(batch, profile, 10, "Highest Quality", "explore")["already_exists"]
    with durable._db() as db:
        row = dict(db.execute("SELECT * FROM jobs WHERE batch_id=?", (batch,)).fetchone())
    assert row["asset_sourcing_mode"] == "explore"
    with pytest.raises(ValueError, match="immutable"):
        durable.enqueue(batch, profile, 10, "Highest Quality", "existing")


def test_same_user_mode_is_included_in_dry_run_prompt(monkeypatch):
    class FakeClient:
        def get_record(self, _table, record_id):
            return {"id": record_id, "fields": {"Daily_Idea_Limit": 10}}
    monkeypatch.setattr(processor, "AirtableClient", FakeClient)
    monkeypatch.setattr(processor, "load_profile_creative_guidance",
                        lambda *a, **kw: {})
    result = processor.process_request(
        profile_record_id=MIAMI,
        requested_count=10, quality="Highest Quality",
        asset_sourcing_mode="explore", dry_run=True,
    )
    assert result["asset_sourcing_mode"] == "explore"
    assert "ASSET SOURCING STRATEGY V1" in result["prompt"]
    assert "Explore" not in result["prompt"] or "explore" in result["prompt"]

def test_published_history_counts_without_double_counting_one_idea(monkeypatch):
    fake, _ = fake_rest_factory(media=[VIZ])
    def source(settings, path, method):
        if path.startswith("content_items?"):
            return [
                {"content_title": "Vizcaya Architecture", "primary_location": "Vizcaya",
                 "content_status": "Published"}
                for _ in range(6)
            ]
        if path.startswith("idea_candidates?"):
            return [
                {"candidate_title": "Vizcaya Ideas " + str(n),
                 "payload": {"Primary_Location": "Vizcaya"}}
                for n in range(6)
            ]
        return fake(settings, path, method)
    monkeypatch.setattr(sourcing, "_rest", source)
    context = sourcing.load_sourcing_context({"url": "mock"}, MIAMI, "balanced")
    assert context["location_counts"]["vizcaya"] == 6
    assert any("Vizcaya" in name for name in context["overused"])

