"""Retired Airtable transport and atomic-upsert safety contract.

The Supabase equivalent must have a verified unique index or transactional RPC
before an upsert can be enabled. No ambiguous replacement with find + create.
"""

import pytest

from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE


@pytest.fixture
def client():
    return AirtableClient(settings={
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "test-only-key",
        "studio_write_source": "supabase",
        "studio_phase6_write_source": "supabase",
    })


def test_airtable_transport_is_permanently_blocked(client, monkeypatch):
    import requests
    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: pytest.fail("No Airtable network calls allowed"))
    monkeypatch.setattr(requests, "patch", lambda *args, **kwargs: pytest.fail("No Airtable network calls allowed"))
    with pytest.raises(RuntimeError, match="Airtable HTTP access retired"):
        client._request("PATCH", "https://example.invalid", table_id=MEDIA_ASSETS_TABLE)


def test_atomic_upsert_fails_closed_without_supabase_unique_contract(client, monkeypatch):
    import requests
    monkeypatch.setattr(requests, "patch", lambda *args, **kwargs: pytest.fail("No Airtable network calls allowed"))
    with pytest.raises(RuntimeError, match="Atomic Supabase upsert not implemented"):
        client.upsert_record(
            MEDIA_ASSETS_TABLE,
            {"Google Drive File ID": "drive-1", "Asset Name": "LA-Quick-Hits-1.mp4"},
            merge_field="Google Drive File ID",
        )


def test_native_gallery_transfer_upsert_fails_closed(client):
    with pytest.raises(RuntimeError, match="Atomic Supabase upsert not implemented"):
        client.upsert_record(
            MEDIA_ASSETS_TABLE,
            {"Studio_Transfer_ID": "ng/one"},
            merge_field="Studio_Transfer_ID",
        )


def test_empty_merge_key_is_rejected_before_any_write(client):
    with pytest.raises(ValueError, match="must be set"):
        client.upsert_record(
            MEDIA_ASSETS_TABLE, {"Google Drive File ID": ""}, merge_field="Google Drive File ID"
        )
