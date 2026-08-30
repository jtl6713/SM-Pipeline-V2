from unittest.mock import MagicMock

from a2.processor import existing_intake_record, process_request


def test_existing_intake_record_matches_drive_id_first():
    client = MagicMock()
    client.list_records.side_effect = [[{"id": "recOLD"}], []]
    found = existing_intake_record(client, file_id="abc123", name="x.jpg", size=10)
    assert found["id"] == "recOLD"
    assert client.list_records.call_args_list[0].kwargs["formula"] == '{Google Drive File ID}="abc123"'


def test_process_request_skips_and_trashes_existing_files(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {"id": "dup1", "name": "River Fog 1.jpg", "mimeType": "image/jpeg", "size": "100", "fileExtension": "jpg"},
        {"id": "new1", "name": "Navy Pier 2.jpg", "mimeType": "image/jpeg", "size": "200", "fileExtension": "jpg"},
    ]
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/new"}
    drive.move_file.return_value = {"id": "new1", "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.side_effect = [[{"id": "recDUP"}], [], []]
    airtable.create_records.return_value = [{"id": "recNEW"}]
    gmail = MagicMock()

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.GmailClient", lambda: gmail)
    monkeypatch.setattr("a2.processor.load_settings", lambda: {"a2_email_to": "test@example.com"})
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "image")
    monkeypatch.setattr("a2.processor.a2_route_fields", lambda *args, **kwargs: {
        "Media_Class": "Photo",
        "Asset_Role": "Raw Photo",
        "Raw_Source_Eligibility": "Eligible",
    })
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["intaken_count"] == 1
    assert result["skipped_existing_count"] == 1
    assert result["skipped_existing_ids"] == ["dup1"]
    drive.trash_file.assert_called_once_with("dup1")
    assert airtable.create_records.call_count == 1
