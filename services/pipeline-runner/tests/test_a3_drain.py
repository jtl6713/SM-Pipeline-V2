from unittest.mock import MagicMock

from a3.processor import normalize_record_ids, process_request
from a3.prompt import metadata_block


def test_a3_drain_classifies_until_view_empty(monkeypatch):
    batches = [
        [{"id": "rec1", "fields": {"MIME_Type": "image/jpeg", "Content_Profile": ["recPROFILE"]}}],
        [{"id": "rec2", "fields": {"MIME_Type": "image/jpeg", "Content_Profile": ["recPROFILE"]}}],
        [],
    ]
    client = MagicMock()
    client.list_records.side_effect = lambda *_args, **_kwargs: batches.pop(0) if batches else []
    monkeypatch.setattr("a3.processor.AirtableClient", lambda: client)
    monkeypatch.setattr(
        "a3.processor._classify_one",
        lambda _client, row: {"id": row["id"], "status": "classified"},
    )

    result = process_request(drain=True, trigger_a4=False)

    assert result["classified_count"] == 2
    assert result["classified"][0]["id"] == "rec1"
    assert result["classified"][1]["id"] == "rec2"


def test_a3_record_ids_skip_the_classify_view(monkeypatch):
    client = MagicMock()
    client.get_record.side_effect = lambda _table, rid: {
        "id": rid,
        "fields": {"MIME_Type": "image/jpeg", "Content_Profile": ["recPROFILE"]},
    }
    monkeypatch.setattr("a3.processor.AirtableClient", lambda: client)
    monkeypatch.setattr(
        "a3.processor._classify_one",
        lambda _client, row: {"id": row["id"], "status": "classified"},
    )

    result = process_request(record_ids=["recNamed1", "recNamed1", "recNamed2"], trigger_a4=False)

    assert result["processed"] is True
    assert result["classified_count"] == 2
    assert result["requested_ids"] == ["recNamed1", "recNamed2"]
    assert result["a4"] is None
    client.list_records.assert_not_called()
    assert client.get_record.call_count == 2


def test_a3_missing_record_ids_are_not_processed(monkeypatch):
    client = MagicMock()
    client.get_record.side_effect = RuntimeError("404")
    monkeypatch.setattr("a3.processor.AirtableClient", lambda: client)
    monkeypatch.setattr(
        "a3.processor._classify_one",
        lambda _client, row: {"id": row["id"], "status": "classified"},
    )

    result = process_request(record_ids=["recMissing"], trigger_a4=False)

    assert result["processed"] is False
    assert result["reason"] == "record_not_found"
    assert result["classified"][0]["status"] == "missing"


def test_a3_drain_skips_rows_without_profile(monkeypatch):
    client = MagicMock()
    client.list_records.return_value = [{"id": "recBare", "fields": {"MIME_Type": "image/jpeg"}}]
    monkeypatch.setattr("a3.processor.AirtableClient", lambda: client)

    def fail_classify(_client, _row):
        raise AssertionError("unprofiled rows must not classify")

    monkeypatch.setattr("a3.processor._classify_one", fail_classify)

    result = process_request(drain=True, trigger_a4=False)

    assert result["processed"] is True
    assert result["classified_count"] == 0
    assert result["classified"] == []


def test_a3_targeted_skips_without_profile(monkeypatch):
    client = MagicMock()
    client.get_record.side_effect = lambda _table, rid: {"id": rid, "fields": {"MIME_Type": "image/jpeg"}}
    monkeypatch.setattr("a3.processor.AirtableClient", lambda: client)

    result = process_request(record_ids=["recBare"], trigger_a4=False)

    assert result["processed"] is False
    assert result["reason"] == "content_profile_required"
    assert result["classified"][0]["status"] == "skipped_no_profile"


def test_normalize_record_ids_accepts_string_and_list():
    assert normalize_record_ids("recOnly") == ["recOnly"]
    assert normalize_record_ids(["recA", "nope", "recA"]) == ["recA"]
    assert normalize_record_ids(None) == []


def test_metadata_block_includes_assigned_profile():
    text = metadata_block(
        {
            "id": "recAsset",
            "fields": {"Asset Name": "Pier"},
            "_content_profile": {
                "id": "recP",
                "fields": {
                    "Profile_Name": "Los Angeles",
                    "Market_Name": "Los Angeles",
                    "Asset_Filter_Tag": "la",
                },
            },
        }
    )
    assert "Assigned Content Profile" in text
    assert "Los Angeles" in text
    assert "la" in text


def test_a3_background_runs_once_and_reports_already_running(monkeypatch):
    import threading

    import stages.a3 as stage
    from config import StageRequest

    release = threading.Event()
    calls = []

    def fake_process(**kwargs):
        calls.append(kwargs)
        release.wait(timeout=5)
        return {"processed": True, "classified_count": len(kwargs.get("record_ids") or []), "classify_passes": 1}

    monkeypatch.setattr(stage, "process_request", fake_process)
    monkeypatch.setattr(stage, "_BACKGROUND_THREAD", None)

    request = StageRequest.from_dict({
        "extra": {"record_ids": ["recA", "recB"], "background": True, "trigger_a4": False, "wait_for_next": False},
    })
    first = stage.run(request)
    assert first.status == "ok"
    assert first.details["background"] is True
    assert first.details["requested_count"] == 2

    second = stage.run(request)
    assert second.status == "skipped"
    assert second.details["already_running"] is True

    release.set()
    stage._BACKGROUND_THREAD.join(timeout=5)
    assert len(calls) == 1
    assert calls[0]["record_ids"] == ["recA", "recB"]
    assert calls[0]["trigger_a4"] is False

    third = stage.run(request)
    assert third.status == "ok"
    stage._BACKGROUND_THREAD.join(timeout=5)
    assert len(calls) == 2
