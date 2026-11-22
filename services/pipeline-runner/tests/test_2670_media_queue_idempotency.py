"""Incident #2670: media queue write suppression and lifecycle preservation."""
from studio_produce import queue


class FakeClient:
    def __init__(self):
        self.rows = []
        self.created = []
        self.updated = []

    def list_records(self, *_args, **_kwargs):
        return list(self.rows)

    def create_records(self, _table, rows, **_kwargs):
        self.created.extend(rows)
        return [{"id": f"recNew{i}", "fields": fields} for i, fields in enumerate(rows)]

    def update_records(self, _table, rows, **_kwargs):
        self.updated.extend(rows)
        return rows

    def update_record(self, _table, record_id, fields, **_kwargs):
        self.updated.append({"id": record_id, "fields": fields})


def test_pending_variant_metadata_same_values_zero_mutations(monkeypatch):
    monkeypatch.setattr(queue, "pipeline_setting", lambda *_: "folder")
    assets = [{"id": "photo1", "name": "a.jpg", "google_drive_file_id": "drive1",
               "media_asset_record_id": "recMedia1", "order": 1}]
    client = FakeClient()
    assert queue.upsert_variant_queue(client, "recRequest", assets, ["9:16"]) == 1
    desired = dict(client.created[0])
    client.created.clear()
    client.rows = [{"id": "recExisting", "fields": desired}]
    assert queue.upsert_variant_queue(client, "recRequest", assets, ["9:16"]) == 0
    assert not client.updated and not client.created


def test_variant_completed_and_error_rows_cannot_be_reset(monkeypatch):
    monkeypatch.setattr(queue, "pipeline_setting", lambda *_: "folder")
    assets = [{"id": "photo1", "name": "a.jpg", "google_drive_file_id": "drive1",
               "media_asset_record_id": "recMedia1", "order": 1}]
    client = FakeClient()
    queue.upsert_variant_queue(client, "recRequest", assets, ["9:16"])
    desired = dict(client.created[0])
    client.created.clear()
    for status in ("Processing", "Drive Uploaded", "Ready", "Error"):
        client.rows = [{"id": "recExisting", "fields": {**desired, "Transfer_Status": status,
                        "Target_File_Name": "custom-name.jpg"}}]
        assert queue.upsert_variant_queue(client, "recRequest", assets, ["9:16"]) == 0
    assert not client.updated and not client.created


def test_pending_only_patch_excludes_lifecycle(monkeypatch):
    monkeypatch.setattr(queue, "pipeline_setting", lambda *_: "folder")
    assets = [{"id": "photo1", "name": "a.jpg", "google_drive_file_id": "drive1",
               "media_asset_record_id": "recMedia1", "order": 1}]
    client = FakeClient()
    queue.upsert_variant_queue(client, "recRequest", assets, ["9:16"])
    desired = dict(client.created[0])
    client.created.clear()
    client.rows = [{"id": "recExisting", "fields": {**desired, "Target_File_Name": "old.jpg",
                    "Preview_Status": "Ready"}}]
    assert queue.upsert_variant_queue(client, "recRequest", assets, ["9:16"]) == 1
    assert client.updated == [{"id": "recExisting", "fields": {"Target_File_Name": desired["Target_File_Name"]}}]


def test_pending_master_metadata_unchanged_zero_mutations(monkeypatch):
    monkeypatch.setattr(queue, "pipeline_setting", lambda *_: "master-folder")
    assets = [{"id": "photo1", "name": "a.jpg", "url": "https://example.test/a.jpg", "order": 1}]
    client = FakeClient()
    assert queue.upsert_master_queue(client, "recRequest", assets) == 1
    desired = dict(client.created[0])
    client.created.clear()
    client.rows = [{"id": "recExisting", "fields": desired}]
    assert queue.upsert_master_queue(client, "recRequest", assets) == 0
    assert not client.updated and not client.created


def test_obsolete_processing_variant_is_not_failed_by_replan(monkeypatch):
    monkeypatch.setattr(queue, "pipeline_setting", lambda *_: "folder")
    client = FakeClient()
    client.rows = [{"id": "recBusy", "fields": {
        "Transfer_ID": "ITEM4-VARIANT-fill-crop-v2-recRequest-removed-9x16",
        "Transfer_Status": "Processing", "Asset_Kind": "Platform Variant",
    }}]
    assert queue.upsert_variant_queue(client, "recRequest", [], ["9:16"]) == 0
    assert not client.updated
