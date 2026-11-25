"""Store Studio Music Manager uploads in Drive Assets/Music. No R2."""

from __future__ import annotations

from typing import Any
import math
from audio.voiceover_duration import probe_audio_duration_bytes

from asset.constants import GDRIVE_MUSIC_FOLDER
from audio.leading_silence import LeadingSilenceResult, STATUS_NOT_NEEDED, cap_leading_silence, is_voiceover_audio
from audio.wav_to_mp3 import convert_wav_if_needed
from integrations.google_drive import GoogleDriveClient

MAX_FILE_BYTES = 40 * 1024 * 1024
DRIVE_DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={file_id}"


def drive_music_url(file_id: str) -> str:
    return DRIVE_DOWNLOAD_URL.format(file_id=file_id)


def _normalize_mp3_name(filename: str) -> str:
    name = str(filename or "").strip() or "track.mp3"
    if not name.lower().endswith(".mp3"):
        name = f"{name}.mp3"
    return name


def ingest_studio_music(*, content: bytes, filename: str) -> dict[str, Any]:
    payload = content or b""
    if not payload:
        raise ValueError("Music file is empty")
    if len(payload) > MAX_FILE_BYTES:
        raise ValueError(f"Music file exceeds the {MAX_FILE_BYTES} byte limit")

    converted = convert_wav_if_needed(payload, filename or "track.mp3")
    payload = converted.content
    name = _normalize_mp3_name(converted.filename)
    if not payload:
        raise ValueError("Music file is empty after WAV conversion")

    trimmed = (
        LeadingSilenceResult(STATUS_NOT_NEEDED, 0.0, 0.0, payload, False, "voiceover skipped")
        if is_voiceover_audio(filename=name)
        else cap_leading_silence(payload, name)
    )
    payload = trimmed.content
    if not payload:
        raise ValueError("Music file is empty after leading-silence processing")

    # Probe the final bytes after conversion and trimming, before creating a Drive file.
    duration = probe_audio_duration_bytes(payload)
    if not math.isfinite(duration) or duration <= 0 or duration > 12 * 60 * 60:
        raise ValueError("Music duration could not be verified")
    drive = GoogleDriveClient()
    uploaded = drive.upload_and_share(GDRIVE_MUSIC_FOLDER, name, payload, "audio/mpeg")
    file_id = str(uploaded.get("id") or "").strip()
    if not file_id:
        raise RuntimeError("Google Drive upload did not return a file id")
    return {
        "ok": True,
        "google_drive_file_id": file_id,
        "google_drive_url": drive_music_url(file_id),
        "web_view_link": uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view",
        "folder_id": GDRIVE_MUSIC_FOLDER,
        "filename": name,
        "duration_seconds": duration,
        "file_size_bytes": len(payload),
        **trimmed.public_dict(),
        **trimmed.airtable_fields(),
    }


def trash_studio_music(*, file_id: str) -> dict[str, Any]:
    drive_id = str(file_id or "").strip()
    if not drive_id:
        raise ValueError("google_drive_file_id is required")
    drive = GoogleDriveClient()
    result = drive.trash_file(drive_id)
    return {
        "ok": True,
        "google_drive_file_id": drive_id,
        "trashed": bool(result.get("trashed")),
    }


def verify_catalog_music_duration(record_id: str, expected_drive_id: str, *, settings: dict) -> dict[str, Any]:
    """Bounded repair of legacy missing duration using exact catalog identity.
    Never accept a caller URL or update rights, media, or any production state.
    """
    import hashlib
    import re
    from urllib.parse import quote
    from supabase_pipeline import _rest, supabase_configured, studio_write_source
    from studio_produce import workload_governor as governor

    if not re.fullmatch(r"rec[A-Za-z0-9]{14}", record_id or "") or not re.fullmatch(r"[A-Za-z0-9_-]{10,128}", expected_drive_id or ""):
        raise ValueError("Invalid catalog identity")
    if not supabase_configured(settings) or studio_write_source(settings) != "supabase" or not governor.enabled() or governor.recovery_read_only_active() or governor.circuit_open():
        raise governor.AdmissionDeferred("music duration verification unavailable")
    scope = "media_assets?airtable_record_id=eq." + quote(record_id, safe="")
    read_path = scope + "&select=id,airtable_record_id,asset_role,media_class,asset_status,active,do_not_use,google_drive_file_id,file_size_bytes,metadata,updated_at&limit=2"
    def read():
        rows = _rest(settings, read_path, "GET")
        if not isinstance(rows, list) or len(rows) != 1:
            raise ValueError("Catalog music identity not found")
        row = rows[0]
        meta = row.get("metadata") or {}
        if (row.get("google_drive_file_id") != expected_drive_id
            or row.get("asset_role") != "Music" or row.get("media_class") != "Audio"
            or row.get("asset_status") != "Available" or row.get("active") is not True
            or row.get("do_not_use") is not False
            or meta.get("rights_status") not in ("Owned", "Licensed", "Public Domain")
            or meta.get("exclusion_reasons")):
            raise ValueError("Catalog music is not eligible")
        return row
    with governor.resource_slot("music_duration_probe", limit=1, wait_seconds=0):
        row = read()
        meta = row.get("metadata") or {}
        duration = float(meta.get("duration_seconds") or 0)
        if not (math.isfinite(duration) and duration > 0):
            declared_size = int(row.get("file_size_bytes") or 0)
            if declared_size > MAX_FILE_BYTES:
                raise ValueError("Catalog music exceeds verification size limit")
            payload, mime = GoogleDriveClient().download_file(expected_drive_id)
            if not str(mime).startswith("audio/") or not 0 < len(payload) <= MAX_FILE_BYTES:
                raise ValueError("Catalog music bytes invalid")
            duration = probe_audio_duration_bytes(payload)
            if not math.isfinite(duration) or not 0 < duration <= 12 * 60 * 60:
                raise ValueError("Catalog music duration invalid")
            if read() != row or governor.circuit_open():
                raise governor.AdmissionDeferred("Catalog music revision or capacity changed")
            if not row.get("updated_at"):
                raise ValueError("Catalog music revision unavailable")
            patch = {**meta, "duration_seconds": duration,
                     "music_duration_probe_v1": {"method":"ffprobe","duration_seconds":duration,
                         "sha256":hashlib.sha256(payload).hexdigest(),"drive_file_id":expected_drive_id}}
            # CAS on exact row and identity, preserving unrelated metadata.
            updated = _rest(settings, scope + "&updated_at=eq." + quote(row["updated_at"],safe="")
                            + "&google_drive_file_id=eq." + quote(expected_drive_id,safe=""),
                            "PATCH", {"metadata":patch}, prefer="return=representation")
            if not isinstance(updated,list) or len(updated)!=1:
                raise governor.AdmissionDeferred("Catalog music revision changed")
            fresh = read()
            if abs(float(fresh["metadata"]["duration_seconds"])-duration)>0.05:
                raise RuntimeError("Catalog duration receipt mismatch")
        return {"ok":True,"record_id":record_id,"google_drive_file_id":expected_drive_id,"duration_seconds":duration}
