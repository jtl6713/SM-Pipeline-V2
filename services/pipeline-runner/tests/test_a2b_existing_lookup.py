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
    kwargs = client.list_records.call_args.kwargs
    assert kwargs["formula"] == (
        'OR({Google Drive File ID}="drive-known",{Google Drive File ID}="drive-new")'
    )
    assert "view" not in kwargs
    assert kwargs["max_records"] >= 100


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
    airtable.create_records.return_value = [{"id": "recNEW"}]

    monkeypatch.setattr("a2b.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2b.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2b.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a3=False)
    assert result["backfill_count"] == 1
    assert result["skipped_existing_count"] == 1
    assert result["skipped_existing_ids"] == ["drive-known"]
    assert result["created_ids"] == ["recNEW"]
    assert airtable.create_records.call_count == 1
    created_fields = airtable.create_records.call_args.args[1][0]
    assert created_fields["Google Drive File ID"] == "drive-new"
