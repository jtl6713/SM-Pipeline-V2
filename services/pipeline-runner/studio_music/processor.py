"""Store Studio Music Library uploads in Drive Assets/Music. No R2."""

from __future__ import annotations

from typing import Any

from asset.constants import GDRIVE_MUSIC_FOLDER
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
    name = _normalize_mp3_name(filename)
    payload = content or b""
    if not payload:
        raise ValueError("Music file is empty")
    if len(payload) > MAX_FILE_BYTES:
        raise ValueError(f"Music file exceeds the {MAX_FILE_BYTES} byte limit")

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
    }
