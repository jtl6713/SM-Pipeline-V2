"""Store Studio Asset Manager uploads in Drive Studio Intake / video folders. No R2."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from airtable.client import AirtableClient
from asset.constants import GDRIVE_STUDIO_INTAKE_FOLDER, GDRIVE_VIDEO_FOLDER
from asset.helpers import drive_video_duration_seconds
from branding.watermark import brand_watermark_bytes, profile_requires_watermark, watermark_media_bytes
from integrations.google_drive import GoogleDriveClient

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_VIDEO_BYTES = 200 * 1024 * 1024
DRIVE_DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={file_id}"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}


def drive_asset_url(file_id: str) -> str:
    return DRIVE_DOWNLOAD_URL.format(file_id=file_id)


def _filename_with_extension(filename: str, extension: str) -> str:
    source = Path(str(filename or "asset"))
    stem = source.stem or "asset"
    ext = str(extension or "").strip().lstrip(".")
    return f"{stem}.{ext}" if ext else source.name


def _source_filename(filename: str) -> str:
    source = Path(str(filename or "asset"))
    stem = source.stem or "asset"
    return f"{stem}__source{source.suffix}"


def _watermark_payload(
    *,
    content: bytes,
    filename: str,
    mime_type: str,
    profile_name: str,
) -> dict[str, Any]:
    if not profile_requires_watermark(profile_name):
        return {
            "bytes": content,
            "filename": filename,
            "mime_type": mime_type,
            "watermarked": False,
        }
    mark = brand_watermark_bytes(AirtableClient())
    branded = watermark_media_bytes(
        content,
        mark,
        filename=filename,
        mime_type=mime_type,
    )
    return {
        **branded,
        "filename": _filename_with_extension(filename, str(branded.get("extension") or "")),
    }


def classify_library_file(*, filename: str, mime_type: str = "") -> dict[str, Any]:
    name = str(filename or "asset").strip() or "asset"
    mime = str(mime_type or "").strip().lower()
    lower = name.lower()
    ext = ""
    if "." in lower:
        ext = f".{lower.rsplit('.', 1)[-1]}"
    if mime.startswith("video/") or ext in VIDEO_EXTENSIONS:
        return {
            "kind": "video",
            "media_class": "Video",
            "asset_role": "Raw Footage",
            "folder_id": GDRIVE_VIDEO_FOLDER,
            "max_bytes": MAX_VIDEO_BYTES,
            "mime_type": mime or "video/mp4",
        }
    if mime.startswith("image/") or ext in IMAGE_EXTENSIONS:
        return {
            "kind": "image",
            "media_class": "Image",
            "asset_role": "Other",
            "folder_id": GDRIVE_STUDIO_INTAKE_FOLDER,
            "max_bytes": MAX_IMAGE_BYTES,
            "mime_type": mime or "image/jpeg",
        }
    raise ValueError(f"{name} is not a supported photo or video clip")


def probe_library_video_duration(content: bytes, filename: str) -> int | None:
    if not content:
        return None
    suffix = Path(str(filename or "clip.mp4")).suffix.lower() or ".mp4"
    if suffix not in VIDEO_EXTENSIONS:
        suffix = ".mp4"
    try:
        from audio.leading_silence import _probe_duration
    except Exception:
        return None
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(content)
            path = Path(handle.name)
        seconds = float(_probe_duration(path) or 0)
        if seconds > 0:
            return max(1, int(round(seconds)))
    except Exception:
        return None
    finally:
        if path is not None:
            path.unlink(missing_ok=True)
    return None


def ingest_studio_library_asset(
    *,
    content: bytes,
    filename: str,
    mime_type: str = "",
    profile_name: str = "",
) -> dict[str, Any]:
    payload = content or b""
    if not payload:
        raise ValueError("File is empty")
    spec = classify_library_file(filename=filename, mime_type=mime_type)
    if len(payload) > spec["max_bytes"]:
        raise ValueError(f"{filename or 'File'} exceeds the upload limit")

    duration = probe_library_video_duration(payload, filename) if spec["kind"] == "video" else None
    drive = GoogleDriveClient()
    source_file_id = ""
    source_web_view_link = ""
    branded = _watermark_payload(
        content=payload,
        filename=filename or "asset",
        mime_type=spec["mime_type"],
        profile_name=profile_name,
    )
    if branded.get("watermarked"):
        source_uploaded = drive.upload_file(
            GDRIVE_STUDIO_INTAKE_FOLDER,
            _source_filename(filename or "asset"),
            payload,
            spec["mime_type"],
        )
        source_file_id = str(source_uploaded.get("id") or "").strip()
        source_web_view_link = str(source_uploaded.get("webViewLink") or "").strip()
        if not source_file_id:
            raise RuntimeError("Google Drive source-master upload did not return a file id")

    output_bytes = bytes(branded.get("bytes") or payload)
    output_filename = str(branded.get("filename") or filename or "asset")
    output_mime = str(branded.get("mime_type") or spec["mime_type"])
    uploaded = drive.upload_and_share(spec["folder_id"], output_filename, output_bytes, output_mime)
    file_id = str(uploaded.get("id") or "").strip()
    if not file_id:
        raise RuntimeError("Google Drive upload did not return a file id")
    if spec["kind"] == "video" and not duration:
        try:
            meta = drive.get_file(file_id, fields="id,videoMediaMetadata")
            duration = drive_video_duration_seconds(meta)
        except Exception:
            duration = None
    return {
        "ok": True,
        "kind": spec["kind"],
        "media_class": spec["media_class"],
        "asset_role": spec["asset_role"],
        "google_drive_file_id": file_id,
        "google_drive_url": drive_asset_url(file_id),
        "web_view_link": uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view",
        "folder_id": spec["folder_id"],
        "filename": output_filename,
        "mime_type": output_mime,
        "file_size_bytes": len(output_bytes),
        "duration_seconds": duration,
        "watermarked": bool(branded.get("watermarked")),
        "watermark_profile": profile_name if branded.get("watermarked") else None,
        "source_google_drive_file_id": source_file_id or None,
        "source_google_drive_url": (
            drive_asset_url(source_file_id) if source_file_id else None
        ),
        "source_web_view_link": source_web_view_link or None,
        "source_filename": filename or "asset",
        "source_file_size_bytes": len(payload),
    }


def watermark_existing_drive_asset(
    *,
    file_id: str,
    filename: str,
    mime_type: str = "",
    profile_name: str = "",
) -> dict[str, Any]:
    drive_id = str(file_id or "").strip()
    if not drive_id:
        raise ValueError("google_drive_file_id is required")
    if not profile_requires_watermark(profile_name):
        return {
            "ok": True,
            "skipped": True,
            "watermarked": False,
            "google_drive_file_id": drive_id,
        }
    content, detected_mime = GoogleDriveClient().download_file(drive_id)
    effective_mime = str(mime_type or detected_mime or "application/octet-stream")
    spec = classify_library_file(filename=filename or "asset", mime_type=effective_mime)
    branded = _watermark_payload(
        content=content,
        filename=filename or "asset",
        mime_type=effective_mime,
        profile_name=profile_name,
    )
    output_bytes = bytes(branded.get("bytes") or b"")
    output_filename = str(branded.get("filename") or filename or "asset")
    output_mime = str(branded.get("mime_type") or effective_mime)
    uploaded = GoogleDriveClient().upload_and_share(
        spec["folder_id"],
        output_filename,
        output_bytes,
        output_mime,
    )
    output_id = str(uploaded.get("id") or "").strip()
    if not output_id:
        raise RuntimeError("Google Drive watermarked derivative upload did not return a file id")
    return {
        "ok": True,
        "watermarked": True,
        "watermark_profile": profile_name,
        "google_drive_file_id": output_id,
        "google_drive_url": drive_asset_url(output_id),
        "web_view_link": uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{output_id}/view",
        "filename": output_filename,
        "mime_type": output_mime,
        "file_size_bytes": len(output_bytes),
        "source_google_drive_file_id": drive_id,
    }


def trash_studio_library_asset(*, file_id: str) -> dict[str, Any]:
    drive_id = str(file_id or "").strip()
    if not drive_id:
        raise ValueError("google_drive_file_id is required")
    drive = GoogleDriveClient()
    try:
        result = drive.trash_file(drive_id)
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", 0)
        message = str(exc).lower()
        if status in (404, 410) or "404" in message or "not found" in message:
            return {
                "ok": True,
                "google_drive_file_id": drive_id,
                "trashed": True,
                "already_gone": True,
            }
        raise
    return {
        "ok": True,
        "google_drive_file_id": drive_id,
        "trashed": bool(result.get("trashed")),
    }


def rename_studio_library_asset(*, file_id: str, filename: str) -> dict[str, Any]:
    drive_id = str(file_id or "").strip()
    name = str(filename or "").strip()
    if not drive_id:
        raise ValueError("google_drive_file_id is required")
    if not name:
        raise ValueError("filename is required")
    drive = GoogleDriveClient()
    result = drive.rename_file(drive_id, name)
    return {
        "ok": True,
        "google_drive_file_id": drive_id,
        "filename": str(result.get("name") or name),
    }
