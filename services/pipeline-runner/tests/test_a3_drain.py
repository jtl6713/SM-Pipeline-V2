from unittest.mock import MagicMock

from a3.processor import normalize_record_ids, process_request


def test_a3_drain_classifies_until_view_empty(monkeypatch):
    batches = [
        [{"id": "rec1", "fields": {"MIME_Type": "image/jpeg"}}],
        [{"id": "rec2", "fields": {"MIME_Type": "image/jpeg"}}],
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
    client.get_record.side_effect = lambda _table, rid: {"id": rid, "fields": {"MIME_Type": "image/jpeg"}}
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


def test_normalize_record_ids_accepts_string_and_list():
    assert normalize_record_ids("recOnly") == ["recOnly"]
    assert normalize_record_ids(["recA", "nope", "recA"]) == ["recA"]
    assert normalize_record_ids(None) == []
