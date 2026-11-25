"""#3094: typed mode capture is insert-only and independent of production dispatch."""
import pytest
import supabase_pipeline as pipeline


SETTINGS = {"supabase_url": "https://example.supabase.co", "supabase_service_role_key": "fake"}
RECORD_ID = "rec12345678901234"


def record(mode="automatic"):
    return {"id": RECORD_ID, "fields": {
        "Candidate_Title": "Chicago at night",
        "Studio_Production_Mode": mode,
        "Studio_Production_Source": "idea",
    }}


def test_i1_capture_same_insert_and_receipt(monkeypatch):
    monkeypatch.setenv("STUDIO_PRODUCTION_MODE_CAPTURE", "true")
    calls = []

    def rest(settings, path, method, body=None, *, prefer=None):
        calls.append((path, method, body, prefer))
        if method == "GET":
            return []
        return [{"airtable_record_id": RECORD_ID,
                 "production_mode": "automatic", "production_source": "idea"}]

    monkeypatch.setattr(pipeline, "_rest", rest)
    receipt = pipeline.commit_idea_candidates(SETTINGS, [record()], creating=True)
    assert receipt["ok"]
    writes = [call for call in calls if call[1] == "POST"]
    assert len(writes) == 1
    path, _, body, prefer = writes[0]
    assert "on_conflict" not in path
    assert prefer == "return=representation"
    assert body[0]["production_mode"] == "automatic"
    assert body[0]["production_source"] == "idea"
    assert "Studio_Production_Mode" not in body[0]["payload"]


def test_patch_and_disabled_capture_do_not_write_mode(monkeypatch):
    calls = []

    def rest(settings, path, method, body=None, *, prefer=None):
        calls.append((path, method, body))
        return [{"payload": {"Candidate_Title": "Original"}}] if method == "GET" else []

    monkeypatch.setattr(pipeline, "_rest", rest)
    monkeypatch.setenv("STUDIO_PRODUCTION_MODE_CAPTURE", "true")
    assert pipeline.commit_idea_candidates(SETTINGS, [record("manual")])["ok"]
    monkeypatch.delenv("STUDIO_PRODUCTION_MODE_CAPTURE")
    assert pipeline.commit_idea_candidates(SETTINGS, [record()], creating=True)["ok"]
    for _, _, body in [call for call in calls if call[1] == "POST"]:
        assert "production_mode" not in body[0]
        assert "Studio_Production_Mode" not in body[0]["payload"]


@pytest.mark.parametrize("existing", [[{"payload": {}}], None])
def test_capture_collision_or_unverified_lookup_never_inserts(monkeypatch, existing):
    monkeypatch.setenv("STUDIO_PRODUCTION_MODE_CAPTURE", "true")

    def rest(settings, path, method, body=None, *, prefer=None):
        assert method == "GET"
        return existing

    monkeypatch.setattr(pipeline, "_rest", rest)
    with pytest.raises(RuntimeError, match="new Idea identity"):
        pipeline.commit_idea_candidates(SETTINGS, [record()], creating=True)


def test_manual_mode_is_not_yet_enabled(monkeypatch):
    monkeypatch.setenv("STUDIO_PRODUCTION_MODE_CAPTURE", "true")
    monkeypatch.setattr(pipeline, "_rest", lambda *a, **k: pytest.fail("Unexpected write"))
    with pytest.raises(RuntimeError, match="Invalid I1"):
        pipeline.commit_idea_candidates(SETTINGS, [record("manual")], creating=True)
