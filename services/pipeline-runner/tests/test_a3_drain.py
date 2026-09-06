from unittest.mock import MagicMock

from a3.processor import process_request


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
