from unittest.mock import MagicMock

from a2b.processor import _existing_drive_ids, existing_drive_id_formula, process_request
from asset.constants import GDRIVE_VIDEO_FOLDER


def test_existing_drive_id_formula_quotes_and_ors():
    assert existing_drive_id_formula([]) is None
    assert existing_drive_id_formula(["abc123"]) == '{Google Drive File ID}="abc123"'
    assert existing_drive_id_formula(["a", "b", "a", ""]) == (
        'OR({Google Drive File ID}="a",{Google Drive File ID}="b")'
    )
    assert existing_drive_id_formula(['say "hi"']) == '{Google Drive File ID}="say \\"hi\\""'


def test_existing_drive_ids_queries_candidates_not_oldest_view():
    client = MagicMock()
    client.list_records.return_value = [
        {"id": "rec1", "fields": {"Google Drive File ID": "drive-known"}},
        {"id": "rec2", "fields": {"Google Drive File ID": "drive-known"}},
    ]
    found = _existing_drive_ids(client, ["drive-known", "drive-new", "drive-known"])
    assert found == {"drive-known"}
    assert client.list_records.call_count == 2
    formulas = [call.kwargs["formula"] for call in client.list_records.call_args_list]
    assert formulas == [
        '{Google Drive File ID}="drive-known"',
        '{Google Drive File ID}="drive-new"',
    ]
    # Each independent one-ID query cannot be saturated by another ID's
    # duplicates, even when the catalog contains 10,000+ legacy rows.
    for call in client.list_records.call_args_list:
        assert call.kwargs["max_records"] == 1
        assert call.kwargs["fields"] == ["Google Drive File ID"]
        assert "view" not in call.kwargs


def test_process_request_skips_drive_ids_already_in_media_assets(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "drive-known",
            "name": "LA-Quick-Hits-1.mp4",
            "mimeType": "video/mp4",
            "size": "1000",
            "fileExtension": "mp4",
            "parents": [GDRIVE_VIDEO_FOLDER],
        },
        {
            "id": "drive-new",
            "name": "dji-clip.mp4",
            "mimeType": "video/mp4",
            "size": "2000",
            "fileExtension": "mp4",
            "parents": [GDRIVE_VIDEO_FOLDER],
        },
    ]
    drive.get_file.side_effect = lambda file_id: {
        "id": file_id,
        "name": "LA-Quick-Hits-1.mp4" if file_id == "drive-known" else "dji-clip.mp4",
        "mimeType": "video/mp4",
        "size": "1000" if file_id == "drive-known" else "2000",
        "fileExtension": "mp4",
        "parents": [GDRIVE_VIDEO_FOLDER],
    }
    airtable = MagicMock()
    airtable.list_records.return_value = [
        {"id": "recDUP", "fields": {"Google Drive File ID": "drive-known"}},
    ]
    airtable.upsert_record.return_value = ({"id": "recNEW"}, True)

    monkeypatch.setattr("a2b.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2b.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2b.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a3=False)
    assert result["backfill_count"] == 1
    assert result["skipped_existing_count"] == 1
    assert result["skipped_existing_ids"] == ["drive-known"]
    assert result["created_ids"] == ["recNEW"]
    assert airtable.create_records.call_count == 0
    assert airtable.upsert_record.call_count == 1
    assert airtable.upsert_record.call_args.kwargs["merge_field"] == "Google Drive File ID"
    created_fields = airtable.upsert_record.call_args.args[1]
    assert created_fields["Google Drive File ID"] == "drive-new"

def test_existing_ids_do_not_disappear_under_duplicate_row_saturation():
    """Legacy 10,621-copy backfill incident: OR maxRecords masked later IDs."""
    client = MagicMock()
    requested = []

    def find_one(_table, *, formula, **_kwargs):
        requested.append(formula)
        if formula == '{Google Drive File ID}="hit-16"':
            return [{"id": "rec16", "fields": {"Google Drive File ID": "hit-16"}}]
        if formula == '{Google Drive File ID}="hit-1"':
            return [{"id": "rec1", "fields": {"Google Drive File ID": "hit-1"}}]
        return []

    client.list_records.side_effect = find_one
    found = _existing_drive_ids(client, ["hit-1", *[f"missing-{i}" for i in range(14)], "hit-16"])
    assert found == {"hit-1", "hit-16"}
    assert len(requested) == 16
    assert client.list_records.call_count == 16


def test_process_request_wont_duplicate_repeated_drive_id_in_same_page(monkeypatch):
    drive = MagicMock()
    item = {"id": "same-drive-id", "name": "LA-Quick-Hits-1.mp4",
            "mimeType": "video/mp4", "size": "1000", "fileExtension": "mp4"}
    drive.list_files.return_value = [item, dict(item)]
    drive.get_file.return_value = item
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.upsert_record.return_value = ({"id": "recFresh"}, True)
    monkeypatch.setattr("a2b.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2b.processor.AirtableClient", lambda: airtable)
    result = process_request()
    assert result["backfill_count"] == 1
    assert result["skipped_existing_count"] == 1
    assert airtable.upsert_record.call_count == 1


def test_process_request_atomic_upsert_detects_racing_worker(monkeypatch):
    drive = MagicMock()
    item = {"id": "drive-race", "name": "LA-Quick-Hits-9.mp4",
            "mimeType": "video/mp4", "size": "1000", "fileExtension": "mp4"}
    drive.list_files.return_value = [item]
    drive.get_file.return_value = item
    airtable = MagicMock()
    airtable.list_records.return_value = []  # Both preflight reads miss the concurrent insert.
    airtable.upsert_record.return_value = ({"id": "recOtherWorker"}, False)
    monkeypatch.setattr("a2b.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2b.processor.AirtableClient", lambda: airtable)
    result = process_request()
    assert result["backfill_count"] == 0
    assert result["skipped_existing_ids"] == ["drive-race"]
    assert not result["created_ids"]
    assert airtable.create_records.call_count == 0


def test_process_request_skips_if_record_arrived_between_lookup_and_create(monkeypatch):
    drive = MagicMock()
    item = {"id": "drive-between", "name": "LA-Quick-Hits-2.mp4",
            "mimeType": "video/mp4", "size": "1000", "fileExtension": "mp4"}
    drive.list_files.return_value = [item]
    drive.get_file.return_value = item
    airtable = MagicMock()
    call_count = 0

    def lookup(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        return [] if call_count == 1 else [
            {"id": "recAdded", "fields": {"Google Drive File ID": "drive-between"}}
        ]

    airtable.list_records.side_effect = lookup
    monkeypatch.setattr("a2b.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2b.processor.AirtableClient", lambda: airtable)
    result = process_request()
    assert result["backfill_count"] == 0
    assert result["skipped_existing_ids"] == ["drive-between"]
    airtable.upsert_record.assert_not_called()
    drive.share_anyone_reader.assert_not_called()

