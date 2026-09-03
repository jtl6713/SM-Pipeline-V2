from unittest.mock import MagicMock

from a2.processor import process_request


def test_process_request_skips_oversize_videos_without_airtable_row(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "big1",
            "name": "Huge clip.mp4",
            "mimeType": "video/mp4",
            "size": str(100_000_001),
            "fileExtension": "mp4",
        },
    ]
    airtable = MagicMock()
    airtable.list_records.return_value = []

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)

    assert result["intaken_count"] == 0
    assert result["skipped_oversize_count"] == 1
    assert result["skipped_oversize_ids"] == ["big1"]
    airtable.create_records.assert_not_called()
    drive.move_file.assert_not_called()


def test_process_request_intakes_video_at_exactly_100mb(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "edge1",
            "name": "Edge clip.mp4",
            "mimeType": "video/mp4",
            "size": str(100_000_000),
            "fileExtension": "mp4",
        },
    ]
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/edge"}
    drive.move_file.return_value = {"id": "edge1", "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.create_records.return_value = [{"id": "recEDGE"}]
    gmail = MagicMock()

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.GmailClient", lambda: gmail)
    monkeypatch.setattr("a2.processor.load_settings", lambda: {"a2_email_to": "test@example.com"})
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "video")
    monkeypatch.setattr("a2.processor.a2_route_fields", lambda *args, **kwargs: {
        "Media_Class": "Video",
        "Asset_Role": "Raw Video",
        "Raw_Source_Eligibility": "Eligible",
    })
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)

    assert result["intaken_count"] == 1
    assert result["skipped_oversize_count"] == 0
    airtable.create_records.assert_called_once()
