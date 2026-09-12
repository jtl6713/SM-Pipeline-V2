from unittest.mock import MagicMock

from a2.processor import existing_intake_record, process_request, _intake_fields
from asset.constants import GDRIVE_INGESTION_FOLDER, GDRIVE_PHOTOS_FOLDER


def test_existing_intake_record_matches_drive_id_first():
    client = MagicMock()
    client.list_records.side_effect = [[{"id": "recOLD"}], []]
    found = existing_intake_record(client, file_id="abc123", name="x.jpg", size=10)
    assert found["id"] == "recOLD"
    assert client.list_records.call_args_list[0].kwargs["formula"] == '{Google Drive File ID}="abc123"'


def test_process_request_skips_and_trashes_existing_files(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "dup1",
            "name": "River Fog 1.jpg",
            "mimeType": "image/jpeg",
            "size": "100",
            "fileExtension": "jpg",
            "parents": [GDRIVE_INGESTION_FOLDER],
        },
        {"id": "new1", "name": "Navy Pier 2.jpg", "mimeType": "image/jpeg", "size": "200", "fileExtension": "jpg"},
    ]
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/new"}
    drive.move_file.return_value = {"id": "new1", "webContentLink": "https://drive.example/moved"}
    drive.get_file.return_value = {"id": "lib1", "parents": [GDRIVE_PHOTOS_FOLDER]}
    airtable = MagicMock()
    airtable.list_records.side_effect = [
        [],
        [{"id": "recDUP", "fields": {"Google Drive File ID": "lib1"}}],
        [],
        [],
    ]
    airtable.create_records.return_value = [{"id": "recNEW"}]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
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
    drive.remove_parent.assert_not_called()
    assert airtable.create_records.call_count == 1


def test_process_request_removes_ingestion_parent_for_same_drive_id(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "same1",
            "name": "River Fog 1.jpg",
            "mimeType": "image/jpeg",
            "size": "100",
            "fileExtension": "jpg",
            "parents": [GDRIVE_INGESTION_FOLDER, GDRIVE_PHOTOS_FOLDER],
        },
    ]
    drive.get_file.return_value = {"id": "same1", "parents": [GDRIVE_INGESTION_FOLDER, GDRIVE_PHOTOS_FOLDER]}
    airtable = MagicMock()
    airtable.list_records.return_value = [{"id": "recDUP", "fields": {"Google Drive File ID": "same1"}}]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "image")
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["skipped_existing_count"] == 1
    drive.remove_parent.assert_called_once_with("same1", GDRIVE_INGESTION_FOLDER)
    drive.trash_file.assert_not_called()
    airtable.create_records.assert_not_called()


def test_process_request_retries_move_when_processed_file_never_left_ingestion(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "only1",
            "name": "River Fog 1.jpg",
            "mimeType": "image/jpeg",
            "size": "100",
            "fileExtension": "jpg",
            "parents": [GDRIVE_INGESTION_FOLDER],
        },
    ]
    drive.get_file.return_value = {"id": "only1", "parents": [GDRIVE_INGESTION_FOLDER]}
    drive.move_file.return_value = {"id": "only1", "parents": [GDRIVE_PHOTOS_FOLDER]}
    airtable = MagicMock()
    airtable.list_records.return_value = [{"id": "recDUP", "fields": {"Google Drive File ID": "only1"}}]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "image")
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["skipped_existing_count"] == 1
    drive.move_file.assert_called_once()
    drive.trash_file.assert_not_called()


def test_process_request_logs_residue_heal_failure(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "dup1",
            "name": "River Fog 1.jpg",
            "mimeType": "image/jpeg",
            "size": "100",
            "fileExtension": "jpg",
            "parents": [GDRIVE_INGESTION_FOLDER],
        },
    ]
    drive.get_file.return_value = {"id": "lib1", "parents": [GDRIVE_PHOTOS_FOLDER]}
    drive.trash_file.side_effect = RuntimeError("Drive trash 403")
    airtable = MagicMock()
    airtable.list_records.side_effect = [
        [],
        [{"id": "recDUP", "fields": {"Google Drive File ID": "lib1"}}],
    ]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "image")
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["skipped_existing_count"] == 1
    assert result["skipped_error_count"] == 1
    assert result["skipped_error_ids"] == ["dup1"]


def test_process_request_dry_run_annotates_duplicates(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {
            "id": "dup1",
            "name": "River Fog 1.jpg",
            "mimeType": "image/jpeg",
            "size": "100",
            "fileExtension": "jpg",
            "parents": [GDRIVE_INGESTION_FOLDER, GDRIVE_PHOTOS_FOLDER],
        },
    ]
    drive.get_file.return_value = {"id": "dup1", "parents": [GDRIVE_INGESTION_FOLDER, GDRIVE_PHOTOS_FOLDER]}
    airtable = MagicMock()
    airtable.list_records.return_value = [{"id": "recDUP", "fields": {"Google Drive File ID": "dup1"}}]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)

    result = process_request(dry_run=True)
    assert result["dry_run"] is True
    route = result["routes"][0]
    assert route["existing_media_asset_id"] == "recDUP"
    assert route["duplicate_reason"] == "drive_id"
    assert GDRIVE_INGESTION_FOLDER in route["parents"]
    drive.trash_file.assert_not_called()
    drive.remove_parent.assert_not_called()


def test_process_request_continues_after_one_file_fails(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {"id": "bad1", "name": "Broken.MOV", "mimeType": "video/quicktime", "size": "100", "fileExtension": "MOV"},
        {"id": "ok1", "name": "Fine.MOV", "mimeType": "video/quicktime", "size": "200", "fileExtension": "MOV"},
    ]
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/ok"}
    drive.move_file.return_value = {"id": "ok1", "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.create_records.side_effect = [RuntimeError("unknown field"), [{"id": "recOK"}]]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "video")
    monkeypatch.setattr("a2.processor.a2_route_fields", lambda *args, **kwargs: {
        "Media_Class": "Video",
        "Asset_Role": "Raw Footage",
        "Raw_Source_Eligibility": "Eligible",
    })
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["intaken_count"] == 1
    assert result["skipped_error_count"] == 1
    assert result["skipped_error_ids"] == ["bad1"]
    assert result["intaken_ids"] == ["recOK"]
    drive.move_file.assert_called_once()


def test_process_request_intakes_without_sending_email(monkeypatch):
    drive = MagicMock()
    drive.list_files.return_value = [
        {"id": "ok1", "name": "Fine.jpg", "mimeType": "image/jpeg", "size": "200", "fileExtension": "jpg"},
    ]
    drive.share_anyone_reader.return_value = {"webContentLink": "https://drive.example/ok"}
    drive.move_file.return_value = {"id": "ok1", "webContentLink": "https://drive.example/moved"}
    airtable = MagicMock()
    airtable.list_records.return_value = []
    airtable.create_records.return_value = [{"id": "recOK"}]

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.classify_intake_file", lambda name, mime: "image")
    monkeypatch.setattr("a2.processor.a2_route_fields", lambda *args, **kwargs: {
        "Media_Class": "Photo",
        "Asset_Role": "Raw Photo",
        "Raw_Source_Eligibility": "Eligible",
    })
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})

    result = process_request(dry_run=False, trigger_a2b=False)
    assert result["intaken_count"] == 1
    assert result["intaken_ids"] == ["recOK"]
    drive.move_file.assert_called_once()
    airtable.create_records.assert_called_once()


def test_create_intake_records_drops_unknown_duration_field():
    from a2.processor import create_intake_records

    client = MagicMock()

    def create(table, records, **_kwargs):
        fields = records[0]
        if "Duration_Seconds" in fields:
            response = MagicMock(text='UNKNOWN_FIELD_NAME: Unknown field name: "Duration_Seconds"', status_code=422)
            exc = RuntimeError("422 Client Error")
            exc.response = response
            raise exc
        return [{"id": "recOK"}]

    client.create_records.side_effect = create
    created = create_intake_records(client, {"Asset Name": "clip.mov", "Duration_Seconds": 12})
    assert created[0]["id"] == "recOK"
    assert "Duration_Seconds" not in client.create_records.call_args_list[-1].args[1][0]


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
    started = []

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
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


def test_drain_until_idle_retries_failed_processed_residue(monkeypatch):
    from a2.processor import drain_until_idle

    leftover = {
        "id": "dup1",
        "name": "River Fog 1.jpg",
        "mimeType": "image/jpeg",
        "size": "100",
        "fileExtension": "jpg",
        "parents": [GDRIVE_INGESTION_FOLDER],
    }
    listings = [
        [leftover],
        [leftover],
        [],
    ]
    drive = MagicMock()
    drive.list_files.side_effect = lambda **_kwargs: listings.pop(0) if listings else []
    drive.get_file.return_value = {"id": "lib1", "parents": [GDRIVE_PHOTOS_FOLDER]}
    drive.trash_file.side_effect = [RuntimeError("Drive trash 403"), None]
    airtable = MagicMock()

    def list_records(*_args, **kwargs):
        formula = str(kwargs.get("formula") or "")
        if "Google Drive File ID" in formula and "dup1" in formula:
            return []
        if "Asset Name" in formula:
            return [{"id": "recDUP", "fields": {"Google Drive File ID": "lib1"}}]
        return []

    airtable.list_records.side_effect = list_records

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
    monkeypatch.setattr("a2.processor.trigger_next", lambda *args, **kwargs: {"triggered": False})
    monkeypatch.setattr("a2.processor._daisy_a2b", lambda **_kwargs: {"triggered": False})

    result = drain_until_idle(trigger_a2b=False)
    assert result["skipped_existing_count"] >= 1
    assert result["skipped_error_count"] >= 1
    assert result["intake_passes"] >= 2
    assert drive.trash_file.call_count >= 2


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
    started = []

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
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

    monkeypatch.setattr("a2.processor.GoogleDriveClient", lambda: drive)
    monkeypatch.setattr("a2.processor.AirtableClient", lambda: airtable)
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


def test_intake_fields_write_clip_duration_from_drive_metadata():
    fields = _intake_fields(
        {
            "name": "riverwalk.mp4",
            "id": "clip1",
            "mimeType": "video/mp4",
            "size": "1000",
            "fileExtension": "mp4",
            "videoMediaMetadata": {"durationMillis": "42100"},
        },
        share_url="https://drive.example/clip",
        batch_id="batch-1",
    )
    assert fields["Duration_Seconds"] == 42
    photo = _intake_fields(
        {"name": "still.jpg", "id": "img1", "mimeType": "image/jpeg", "size": "10", "fileExtension": "jpg"},
        share_url="https://drive.example/still",
        batch_id="batch-1",
    )
    assert "Duration_Seconds" not in photo
