import pytest
from audio.leading_silence import LeadingSilenceResult, STATUS_NOT_NEEDED
from audio.wav_to_mp3 import WavConvertResult
from studio_music.processor import drive_music_url, ingest_studio_music


class _FakeDrive:
    def upload_and_share(self, folder_id, filename, content, mime_type):
        assert folder_id == "1mzNHcVmeXb6I2WybJD5iOTrJUDRQJIN3"
        assert filename.endswith(".mp3")
        assert mime_type == "audio/mpeg"
        assert content == b"ID3fake"
        return {"id": "driveMusic1", "webViewLink": "https://drive.google.com/file/d/driveMusic1/view"}


def test_drive_music_url():
    assert drive_music_url("abc") == "https://drive.google.com/uc?export=download&id=abc"


def test_ingest_studio_music_uploads_shared_file(monkeypatch):
    monkeypatch.setattr(
        "studio_music.processor.cap_leading_silence",
        lambda content, filename: LeadingSilenceResult(STATUS_NOT_NEEDED, 0.1, 0.0, content, False),
    )
    monkeypatch.setattr("studio_music.processor.probe_audio_duration_bytes", lambda data: 64.25 if data == b"ID3fake" else 0)
    monkeypatch.setattr("studio_music.processor.GoogleDriveClient", lambda: _FakeDrive())
    result = ingest_studio_music(content=b"ID3fake", filename="Sunset drone bed")
    assert result["google_drive_file_id"] == "driveMusic1"
    assert result["google_drive_url"].endswith("id=driveMusic1")
    assert result["filename"] == "Sunset drone bed.mp3"
    assert result["duration_seconds"] == 64.25


def test_ingest_studio_music_converts_wav_before_drive(monkeypatch):
    class _WavDrive:
        def upload_and_share(self, folder_id, filename, content, mime_type):
            assert filename == "Sunset drone bed.mp3"
            assert mime_type == "audio/mpeg"
            assert content == b"ID3fromwav"
            return {"id": "driveMusic2", "webViewLink": "https://drive.google.com/file/d/driveMusic2/view"}

    monkeypatch.setattr(
        "studio_music.processor.convert_wav_if_needed",
        lambda content, filename: WavConvertResult(True, "Sunset drone bed.mp3", b"ID3fromwav", "audio/mpeg", 10),
    )
    monkeypatch.setattr(
        "studio_music.processor.cap_leading_silence",
        lambda content, filename: LeadingSilenceResult(STATUS_NOT_NEEDED, 0.0, 0.0, content, False),
    )
    monkeypatch.setattr("studio_music.processor.probe_audio_duration_bytes", lambda data: 31.5 if data == b"ID3fromwav" else 0)
    monkeypatch.setattr("studio_music.processor.GoogleDriveClient", lambda: _WavDrive())
    result = ingest_studio_music(content=b"RIFFwav", filename="Sunset drone bed.wav")
    assert result["google_drive_file_id"] == "driveMusic2"
    assert result["filename"] == "Sunset drone bed.mp3"

    assert result["duration_seconds"] == 31.5

def test_ingest_rejects_unmeasured_audio_before_drive_write(monkeypatch):
    monkeypatch.setattr("studio_music.processor.cap_leading_silence",
        lambda content, filename: LeadingSilenceResult(STATUS_NOT_NEEDED, 0, 0, content, False))
    monkeypatch.setattr("studio_music.processor.probe_audio_duration_bytes", lambda data: 0)
    def no_drive():
        pytest.fail("Unverified audio must not be uploaded")
    monkeypatch.setattr("studio_music.processor.GoogleDriveClient", no_drive)
    with pytest.raises(ValueError, match="duration"):
        ingest_studio_music(content=b"ID3fake", filename="track.mp3")


def test_legacy_music_duration_repair_preserves_identity_and_unrelated_metadata(monkeypatch):
    from contextlib import nullcontext
    from copy import deepcopy
    from studio_music.processor import verify_catalog_music_duration
    from studio_produce import workload_governor as governor
    import supabase_pipeline
    record_id="rec12345678901234"
    drive_id="drive-id-1234567890"
    row={"id":"canonical-id","airtable_record_id":record_id,"asset_role":"Music",
         "media_class":"Audio","asset_status":"Available","active":True,"do_not_use":False,
         "google_drive_file_id":drive_id,"file_size_bytes":1234,
         "metadata":{"rights_status":"Licensed","custom":"preserve"},
         "updated_at":"2026-11-25T03:00:00Z"}
    writes=[]
    monkeypatch.setattr(supabase_pipeline,"supabase_configured",lambda _:True)
    monkeypatch.setattr(supabase_pipeline,"studio_write_source",lambda _:"supabase")
    monkeypatch.setattr(governor,"enabled",lambda:True)
    monkeypatch.setattr(governor,"recovery_read_only_active",lambda:False)
    monkeypatch.setattr(governor,"circuit_open",lambda:False)
    monkeypatch.setattr(governor,"resource_slot",lambda *a,**k:nullcontext())
    class Drive:
        def download_file(self, file_id):
            assert file_id==drive_id
            return b"verified-audio","audio/mpeg"
    monkeypatch.setattr("studio_music.processor.GoogleDriveClient",Drive)
    monkeypatch.setattr("studio_music.processor.probe_audio_duration_bytes",lambda data:64.25)
    def rest(settings,path,method,body=None,**kwargs):
        if method=="PATCH":
            assert "updated_at=eq." in path and "google_drive_file_id=eq." in path
            assert list(body)==["metadata"]
            writes.append(deepcopy(body))
            row["metadata"]=deepcopy(body["metadata"])
        return [deepcopy(row)]
    monkeypatch.setattr(supabase_pipeline,"_rest",rest)
    proof=verify_catalog_music_duration(record_id,drive_id,settings={})
    assert proof["duration_seconds"]==64.25
    assert len(writes)==1 and row["metadata"]["rights_status"]=="Licensed"
    assert row["metadata"]["custom"]=="preserve"
    assert verify_catalog_music_duration(record_id,drive_id,settings={})["duration_seconds"]==64.25
    assert len(writes)==1
    with pytest.raises(ValueError,match="not eligible"):
        verify_catalog_music_duration(record_id,"different-drive-id",settings={})
    row["do_not_use"]=True
    with pytest.raises(ValueError,match="not eligible"):
        verify_catalog_music_duration(record_id,drive_id,settings={})
    assert len(writes)==1


def test_catalog_duration_projection_rejects_stale_source_and_invalid_metadata():
    from airtable.constants import MEDIA_ASSETS_TABLE
    from supabase_pipeline import media_duration_seconds
    from supabase_reads import _record_from_row

    row = {
        "airtable_record_id": "rec12345678901234",
        "google_drive_file_id": "drive-original",
        "metadata": {"duration_seconds": 84.625, "music_duration_probe_v1": {
            "drive_file_id": "drive-original", "duration_seconds": 84.625,
        }},
    }
    assert media_duration_seconds(row) == 84.625
    assert _record_from_row(row, MEDIA_ASSETS_TABLE)["fields"]["Duration_Seconds"] == 84.625
    row["google_drive_file_id"] = "drive-replacement"
    assert media_duration_seconds(row) is None
    assert "Duration_Seconds" not in _record_from_row(row, MEDIA_ASSETS_TABLE)["fields"]
    row["metadata"] = {"duration_seconds": "invalid"}
    assert media_duration_seconds(row) is None
    row["metadata"] = {"duration_seconds": 84.625}
    assert media_duration_seconds(row) == 84.625
