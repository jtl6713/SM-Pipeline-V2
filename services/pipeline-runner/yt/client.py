from __future__ import annotations

from typing import Any

import requests

from config import load_settings
from item4.settings import PipelineSettings
from yt.constants import THUMBNAIL_MAX_BYTES, THUMBNAIL_QUALITY_FLOOR


class YouTubeUploaderError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 0, body: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def load_uploader_settings(settings: PipelineSettings) -> dict[str, str]:
    env = load_settings()
    url = (
        settings.get("YOUTUBE_UPLOAD_SERVICE_URL")
        or str(env.get("YOUTUBE_UPLOADER_URL") or "")
    ).strip().rstrip("/")
    secret = (
        settings.get("YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET")
        or str(env.get("YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET") or "")
    ).strip()
    if not url or not secret:
        raise YouTubeUploaderError("missing-youtube-uploader-settings")
    return {"url": url, "secret": secret}


class YouTubeUploaderClient:
    def __init__(self, *, base_url: str, secret: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._secret = secret

    def _headers(self, json_body: bool = False) -> dict[str, str]:
        headers = {"X-SM-Pipeline-Key": self._secret}
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

    def start_upload(self, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            f"{self.base_url}/youtube/upload",
            json=payload,
            headers=self._headers(True),
            timeout=120,
        )
        return response.status_code, _json_body(response)

    def job_status(self, job_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            f"{self.base_url}/youtube/jobs/{job_id}",
            headers=self._headers(),
            timeout=120,
        )
        return response.status_code, _json_body(response)

    def video_status(self, video_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            f"{self.base_url}/youtube/videos/{video_id}",
            headers=self._headers(),
            timeout=120,
        )
        return response.status_code, _json_body(response)

    def set_thumbnail(self, *, video_id: str, source_url: str, fallback_source_url: str = "") -> tuple[int, dict[str, Any]]:
        response = requests.post(
            f"{self.base_url}/youtube/thumbnail",
            json={
                "videoId": video_id,
                "sourceUrl": source_url,
                "fallbackSourceUrl": fallback_source_url,
                "preferredMimeType": "image/jpeg",
                "maxBytes": THUMBNAIL_MAX_BYTES,
                "maxFileSizeBytes": THUMBNAIL_MAX_BYTES,
                "compressionMode": "auto",
                "qualityFloor": THUMBNAIL_QUALITY_FLOOR,
            },
            headers=self._headers(True),
            timeout=120,
        )
        return response.status_code, _json_body(response)


def processing_status(payload: dict[str, Any]) -> str:
    items = payload.get("items") if isinstance(payload, dict) else None
    first = items[0] if isinstance(items, list) and items else payload
    if not isinstance(first, dict):
        return ""
    details = first.get("processingDetails") if isinstance(first.get("processingDetails"), dict) else {}
    return str(details.get("processingStatus") or "").strip()


def processing_failure_reason(payload: dict[str, Any]) -> tuple[str, str]:
    items = payload.get("items") if isinstance(payload, dict) else None
    first = items[0] if isinstance(items, list) and items else payload
    if not isinstance(first, dict):
        return "", ""
    details = first.get("processingDetails") if isinstance(first.get("processingDetails"), dict) else {}
    status = first.get("status") if isinstance(first.get("status"), dict) else {}
    return (
        str(details.get("processingFailureReason") or "").strip(),
        str(status.get("rejectionReason") or "").strip(),
    )


def _json_body(response: requests.Response) -> dict[str, Any]:
    if not response.content:
        return {}
    try:
        payload = response.json()
    except ValueError:
        return {"raw": response.text}
    return payload if isinstance(payload, dict) else {"data": payload}


def contains_invalid_grant(payload: Any) -> bool:
    return "invalid_grant" in str(payload or "").casefold()
