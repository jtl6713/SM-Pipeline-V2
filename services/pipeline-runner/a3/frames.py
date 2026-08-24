"""A3 frame extractor HTTP — Make 5569035 modules 10–12 and 20."""

from __future__ import annotations

import time
from typing import Any

import requests

from asset.helpers import parse_int, uc_download_url
from item4.settings import pipeline_settings
from render.fields import field, field_str


def _base_url() -> str:
    return pipeline_settings().get("Frame_Extractor_URL").rstrip("/")


def _setting_int(name: str, default: int) -> int:
    return parse_int(pipeline_settings().get(name), default) or default


def health_ok() -> bool:
    url = _base_url()
    if not url:
        return False
    response = requests.get(f"{url}/health", timeout=30)
    response.raise_for_status()
    return True


def extract_frames(record: dict[str, Any]) -> dict[str, Any]:
    url = _base_url()
    file_id = field_str(record, "Google Drive File ID")
    body = {
        "record_id": record.get("id"),
        "asset_name": field_str(record, "Asset Name"),
        "google_drive_file_id": file_id,
        "frame_selection_mode": "hybrid",
        "download_url": uc_download_url(file_id),
        "mime_type": field_str(record, "MIME_Type"),
        "file_size_mb": field(record, "File_Size_MB"),
        "frame_count": _setting_int("A3_Frame_Extraction_Count", 5),
        "frame_quality": _setting_int("A3_Frame_Quality", 72),
        "max_width": _setting_int("Default_Frame_Width", 1280),
        "slot_count": _setting_int("A3_Frame_Slot_Count", 8),
    }
    health_ok()
    time.sleep(2)
    response = requests.post(f"{url}/extract", json=body, timeout=300)
    payload = response.json() if response.content else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    return data if isinstance(data, dict) else {"raw": payload, "frames_analyzed_count": 0}


def image_metadata(record: dict[str, Any]) -> dict[str, Any]:
    url = _base_url()
    file_id = field_str(record, "Google Drive File ID")
    body = {
        "record_id": record.get("id"),
        "asset_name": field_str(record, "Asset Name"),
        "google_drive_file_id": file_id,
        "download_url": uc_download_url(file_id),
        "mime_type": field_str(record, "MIME_Type"),
        "file_size_mb": field(record, "File_Size_MB"),
    }
    response = requests.post(f"{url}/image-metadata", json=body, timeout=120)
    payload = response.json() if response.content else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    return data if isinstance(data, dict) else {"raw": payload}
