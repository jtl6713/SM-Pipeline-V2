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


def test_drain_until_idle_processes_a_second_batch(monkeypatch):
    from a2.processor import drain_until_idle

    listings = [
        [{"id": "a", "name": "A.jpg", "mimeType": "image/jpeg", "size": "10", "fileExtension": "jpg"}],
        [{"id": "b", "name": "B.jpg", "mimeType": "image/jpeg", "size": "20", "fileExtension": "jpg"}],
        [],
    ]
    drive = MagicMock()
    drive.list_files.side_effect = lambda **_kwargs: listings.pop(0) if listings else []
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/x"}
    drive.move_file.side_effect = lambda file_id, *_args, **_kwargs: {"id": file_id, "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.create_records.side_effect = [[{"id": "recA"}], [{"id": "recB"}]]
    gmail = MagicMock()
    started = []

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
    monkeypatch.setattr("a2.processor._start_oversize_compression", lambda: started.append("a1s") or {"started": True})
    monkeypatch.setattr("a2.processor._daisy_a2b", lambda **_kwargs: {"triggered": False})

    result = drain_until_idle(trigger_a2b=True, wait_for_next=True)
    assert result["intaken_count"] == 2
    assert result["intake_passes"] == 3
    assert result["intaken_ids"] == ["recA", "recB"]
    assert started == []


def test_drain_until_idle_starts_compression_then_continues(monkeypatch):
    from a2.processor import drain_until_idle

    listings = [
        [
            {"id": "big", "name": "Huge.mp4", "mimeType": "video/mp4", "size": "150000000", "fileExtension": "mp4"},
            {"id": "ok", "name": "Still.jpg", "mimeType": "image/jpeg", "size": "10", "fileExtension": "jpg"},
        ],
        [],
    ]
    drive = MagicMock()
    drive.list_files.side_effect = lambda **_kwargs: listings.pop(0) if listings else []
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/x"}
    drive.move_file.return_value = {"id": "ok", "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.create_records.return_value = [{"id": "recOK"}]
    gmail = MagicMock()
    started = []

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
    monkeypatch.setattr("a2.processor._start_oversize_compression", lambda: started.append("a1s") or {"started": True})
    monkeypatch.setattr("a2.processor._daisy_a2b", lambda **_kwargs: {"triggered": False})

    result = drain_until_idle(trigger_a2b=False)
    assert result["intaken_count"] == 1
    assert result["skipped_oversize_count"] == 1
    assert result["compression_started"] is True
    assert started == ["a1s"]


def test_drain_skips_when_intake_already_running():
    from a2.processor import _INTAKE_LOCK, process_request

    assert _INTAKE_LOCK.acquire(blocking=False)
    try:
        result = process_request(drain=True, trigger_a2b=False)
        assert result["processed"] is False
        assert result["reason"] == "intake_already_running"
    finally:
        _INTAKE_LOCK.release()


def test_process_request_converts_wav_audio(monkeypatch):
    from audio.wav_to_mp3 import WavConvertResult

    drive = MagicMock()
    drive.list_files.return_value = [
        {"id": "wav1", "name": "Sunset drone bed.wav", "mimeType": "audio/wav", "size": "200", "fileExtension": "wav"},
    ]
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/wav"}
    drive.move_file.return_value = {"id": "wav1", "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.create_records.return_value = [{"id": "recWAV"}]
    gmail = MagicMock()

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.GmailClient", lambda: gmail)
    monkeypatch.setattr("a2.processor.load_settings", lambda: {"a2_email_to": "test@example.com"})
    monkeypatch.setattr(
        "a2.processor.apply_drive_wav_to_mp3",
        lambda *args, **kwargs: WavConvertResult(True, "Sunset drone bed.mp3", b"ID3", "audio/mpeg", 12),
    )
    monkeypatch.setattr("a2.processor.apply_drive_leading_silence", lambda *args, **kwargs: MagicMock(
        airtable_fields=lambda: {},
        content=b"ID3",
    ))
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["intaken_count"] == 1
    updated = airtable.update_record.call_args.args[2]
    assert updated["Asset Name"] == "Sunset drone bed.mp3"
    assert updated["MIME_Type"] == "audio/mpeg"
    assert updated["File_Extension"] == "mp3"
