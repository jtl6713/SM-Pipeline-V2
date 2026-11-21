"""Supabase media atomic-upsert contract: dedupe, native identity and readback."""

import pytest

from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE


@pytest.fixture
def client():
    return AirtableClient({
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "test-only-key",
        "studio_write_source": "supabase",
        "studio_phase6_write_source": "supabase",
    })


def claim(monkeypatch, client, fields, merge_field, created=True, record_id="rec00000000000001"):
    import supabase_pipeline

    calls = []
    key = fields[merge_field]

    def mock_rest(settings, path, method, body=None, *, prefer=None):
        calls.append((path, method, body, prefer))
        return {
            "id": record_id,
            "created": created,
            "google_drive_file_id": fields.get("Google Drive File ID"),
            "studio_transfer_id": fields.get("Studio_Transfer_ID"),
        }

    monkeypatch.setattr(supabase_pipeline, "_rest", mock_rest)
    monkeypatch.setattr(
        client,
        "get_record",
        lambda table, id: {"id": id, "fields": dict(fields)},
    )
    stored, inserted = client.upsert_record(MEDIA_ASSETS_TABLE, fields, merge_field=merge_field)
    assert inserted is created
    assert stored["id"] == record_id
    assert len(calls) == 1
    path, method, body, prefer = calls[0]
    assert (path, method, prefer) == ("rpc/sm_pipeline_upsert_media_asset", "POST", "return=representation")
    assert body["p_merge_field"] == merge_field
    assert body["p_merge_value"] == key
    assert body["p_asset"]["asset_name"] == fields["Asset Name"]
    assert body["p_record_id"].startswith("rec") and len(body["p_record_id"]) == 17
    return body


def test_drive_file_atomic_claim_creates_then_matches(monkeypatch, client):
    fields = {"Google Drive File ID": "drive-file-1", "Asset Name": "Sample.mp4"}
    body = claim(monkeypatch, client, fields, "Google Drive File ID", created=True)
    assert body["p_asset"]["google_drive_file_id"] == "drive-file-1"
    claim(monkeypatch, client, fields, "Google Drive File ID", created=False)


def test_native_gallery_atomic_claim_created_and_existing(monkeypatch, client):
    fields = {
        "Studio_Transfer_ID": "ngv2_deadbeef0123456789",
        "Google Drive File ID": "native-drive-unique",
        "Asset Name": "Native Gallery V2",
        "Media_Class": "Image",
        "Active": False,
        "Do_Not_Use": True,
        "Rights_Status": "Owned",
    }
    body = claim(monkeypatch, client, fields, "Studio_Transfer_ID", created=True)
    assert body["p_asset"]["metadata"]["studio_transfer_id"] == fields["Studio_Transfer_ID"]
    assert body["p_asset"]["metadata"]["rights_status"] == "Owned"
    assert body["p_asset"]["active"] is False
    claim(monkeypatch, client, fields, "Studio_Transfer_ID", created=False)


@pytest.mark.parametrize("merge_field,fields", [
    ("Google Drive File ID", {"Google Drive File ID": "", "Asset Name": "x"}),
    ("Studio_Transfer_ID", {"Studio_Transfer_ID": "legacy-duplicate", "Asset Name": "x"}),
    ("Studio_Transfer_ID", {"Studio_Transfer_ID": "ngv2_1", "Asset Name": ""}),
])
def test_invalid_identity_rejected_before_network(client, monkeypatch, merge_field, fields):
    import supabase_pipeline

    monkeypatch.setattr(
        supabase_pipeline, "_rest",
        lambda *args, **kwargs: pytest.fail("No database write for invalid identity"),
    )
    with pytest.raises((ValueError, RuntimeError)):
        client.upsert_record(MEDIA_ASSETS_TABLE, fields, merge_field=merge_field)


def test_upsert_unsupported_table_does_not_fall_back(client):
    with pytest.raises(RuntimeError, match="No Supabase atomic upsert"):
        client.upsert_record(
            "Pipeline Settings",
            {"Google Drive File ID": "x", "Asset Name": "x"},
            merge_field="Google Drive File ID",
        )


@pytest.mark.parametrize("response", [
    None,
    {},
    {"id": "bad", "created": True},
    {"id": "rec00000000000001", "created": "true"},
    {"id": "rec00000000000001", "created": True, "google_drive_file_id": "wrong"},
])
def test_ambiguous_or_mismatched_response_fails_closed(client, monkeypatch, response):
    import supabase_pipeline

    monkeypatch.setattr(supabase_pipeline, "_rest", lambda *args, **kwargs: response)
    with pytest.raises(RuntimeError):
        client.upsert_record(
            MEDIA_ASSETS_TABLE,
            {"Google Drive File ID": "test", "Asset Name": "test"},
            merge_field="Google Drive File ID",
        )


def test_readback_mismatch_requires_reconciliation(client, monkeypatch):
    import supabase_pipeline

    monkeypatch.setattr(
        supabase_pipeline,
        "_rest",
        lambda *args, **kwargs: {
            "id": "rec00000000000001",
            "created": True,
            "google_drive_file_id": "drive-file-1",
        },
    )
    monkeypatch.setattr(
        client,
        "get_record",
        lambda *args: {"id": "rec00000000000001", "fields": {"Google Drive File ID": "other"}},
    )
    with pytest.raises(RuntimeError, match="readback failed"):
        client.upsert_record(
            MEDIA_ASSETS_TABLE,
            {"Google Drive File ID": "drive-file-1", "Asset Name": "x"},
            merge_field="Google Drive File ID",
        )
