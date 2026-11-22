"""Incident #2670: queue list/get parity under the Supabase-only runner."""
import requests
import pytest

from airtable.client import AirtableClient
from airtable.constants import MEDIA_TRANSFER_QUEUE_TABLE
from supabase_reads import SupabaseRecordMiss, try_get_supabase_record
from tests.test_supabase_pipeline_writes import _settings


SETTINGS = _settings(studio_write_source="supabase", studio_phase6_write_source="supabase")


def _transfer_row():
    return {
        "airtable_record_id": "recKHCbDgWQe3iPWp",
        "status": "Pending",
        "attempt_count": 0,
        "payload": {
            "transfer_id": "ITEM4-VARIANT-fill-crop-v2-recR4EQcshFZ4fNL0-4x5",
            "production_request_record_id": "recR4EQcshFZ4fNL0",
            "asset_kind": "Platform Variant",
            "source_name": "Bethesda Terrace and Fountain 2",
            "source_drive_file_id": "drive123",
            "source_media_asset_id": "recYaIgo6Q8JHgyWH",
            "target_drive_folder_id": "folder123",
            "target_file_name": "Bethesda-4x5.jpg",
            "aspect_ratio": "4:5",
            "width": 1080,
            "height": 1350,
            "preview_status": "Pending",
            "target_production_request_output_ids": ["recOutputA", "recOutputB"],
        },
    }


def test_exact_queue_get_reads_supabase_and_densifies_crop_fields(monkeypatch):
    seen = []

    def fake_rest(settings, path, method):
        seen.append((path, method))
        assert method == "GET"
        assert path.startswith("studio_media_transfer_queue?")
        assert "airtable_record_id=eq.recKHCbDgWQe3iPWp" in path
        assert "limit=1" in path
        return [_transfer_row()]

    monkeypatch.setattr("supabase_reads._rest", fake_rest)
    row = try_get_supabase_record(SETTINGS, MEDIA_TRANSFER_QUEUE_TABLE, "recKHCbDgWQe3iPWp")
    assert row["id"] == "recKHCbDgWQe3iPWp"
    fields = row["fields"]
    assert fields["Transfer_Status"] == "Pending"
    assert fields["Asset_Kind"] == "Platform Variant"
    assert fields["Source_Media_Asset"] == ["recYaIgo6Q8JHgyWH"]
    assert fields["Target_Production_Request_Outputs"] == ["recOutputA", "recOutputB"]
    assert fields["Target_Drive_Folder_ID"] == "folder123"
    assert fields["Target_File_Name"] == "Bethesda-4x5.jpg"
    assert fields["Aspect_Ratio"] == "4:5"
    assert fields["Width"] == 1080 and fields["Height"] == 1350
    assert seen and len(seen) == 1


def test_queue_get_empty_supabase_never_probes_airtable(monkeypatch):
    monkeypatch.setattr("supabase_reads._rest", lambda *_a, **_k: [])
    with pytest.raises(SupabaseRecordMiss):
        try_get_supabase_record(SETTINGS, MEDIA_TRANSFER_QUEUE_TABLE, "recMissingQueue123")


def test_queue_get_client_uses_same_supabase_projection(monkeypatch):
    monkeypatch.setattr("supabase_reads._rest", lambda *_a, **_k: [_transfer_row()])
    monkeypatch.setattr(requests, "get", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable request")))
    client = AirtableClient(settings=SETTINGS)
    row = client.get_record(MEDIA_TRANSFER_QUEUE_TABLE, "recKHCbDgWQe3iPWp")
    assert row["fields"]["Transfer_ID"].startswith("ITEM4-VARIANT")
    assert row["fields"]["Source_Media_Asset"] == ["recYaIgo6Q8JHgyWH"]
