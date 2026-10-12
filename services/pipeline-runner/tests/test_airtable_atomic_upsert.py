"""A2B atomic Drive-ID upsert contract, with no live Airtable writes."""

import pytest
import requests

from airtable.client import AirtableClient


class Response:
    def __init__(self, data, *, status_code=200):
        self.data = data
        self.status_code = status_code
        self.ok = status_code < 400
        self.reason = "OK" if self.ok else "Unprocessable Entity"
        self.text = str(data)

    def json(self):
        return self.data


def test_atomic_upsert_creates_once_and_sends_merge_key(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        seen.append({"url": url, "headers": headers, "body": json, "timeout": timeout})
        return Response({
            "records": [{"id": "recNew", "fields": json["records"][0]["fields"]}],
            "createdRecords": ["recNew"],
            "updatedRecords": [],
        })

    monkeypatch.setattr(requests, "patch", fake_patch)
    client = AirtableClient(settings={"airtable_pat": "test", "airtable_base_id": "appTest123"})
    record, created = client.upsert_record(
        "Media Assets",
        {"Google Drive File ID": "drive-1", "Asset Name": "LA-Quick-Hits-1.mp4"},
        merge_field="Google Drive File ID",
    )
    assert created is True
    assert record["id"] == "recNew"
    assert len(seen) == 1
    assert seen[0]["body"]["performUpsert"] == {"fieldsToMergeOn": ["Google Drive File ID"]}
    assert seen[0]["body"]["records"][0]["fields"]["Google Drive File ID"] == "drive-1"
    assert seen[0]["body"]["typecast"] is True


def test_atomic_upsert_matches_existing_instead_of_inserting(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response({
        "records": [{"id": "recExisting"}],
        "createdRecords": [],
        "updatedRecords": ["recExisting"],
    }))
    client = AirtableClient(settings={"airtable_pat": "test", "airtable_base_id": "appTest123"})
    record, created = client.upsert_record(
        "Media Assets", {"Google Drive File ID": "drive-1"}, merge_field="Google Drive File ID"
    )
    assert record["id"] == "recExisting"
    assert created is False


def test_atomic_upsert_fails_closed_when_response_is_ambiguous(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response({
        "records": [{"id": "recUnknown"}],
    }))
    client = AirtableClient(settings={"airtable_pat": "test", "airtable_base_id": "appTest123"})
    with pytest.raises(RuntimeError, match="did not confirm"):
        client.upsert_record(
            "Media Assets", {"Google Drive File ID": "drive-1"}, merge_field="Google Drive File ID"
        )


def test_atomic_upsert_fails_closed_when_existing_duplicates_make_merge_ambiguous(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response(
        {"error": {"type": "INVALID_VALUE_FOR_COLUMN", "message": "multiple matches"}},
        status_code=422,
    ))
    client = AirtableClient(settings={"airtable_pat": "test", "airtable_base_id": "appTest123"})
    with pytest.raises(requests.HTTPError):
        client.upsert_record(
            "Media Assets", {"Google Drive File ID": "drive-1"}, merge_field="Google Drive File ID"
        )


def test_atomic_upsert_requires_nonempty_drive_id(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: pytest.fail("No HTTP writes expected"))
    client = AirtableClient(settings={"airtable_pat": "test", "airtable_base_id": "appTest123"})
    with pytest.raises(ValueError, match="must be set"):
        client.upsert_record(
            "Media Assets", {"Google Drive File ID": ""}, merge_field="Google Drive File ID"
        )
