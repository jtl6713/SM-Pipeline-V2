from __future__ import annotations

from typing import Any

import requests

from config import load_settings
from item4.constants import MEDIA_PUBLIC_BASE
from item4.settings import PipelineSettings


class R2UploadClient:
    def __init__(self, settings: PipelineSettings | None = None) -> None:
        self._runtime = load_settings()
        self._settings = settings

    def _upload_url(self) -> str:
        env_url = str(self._runtime.get("r2_upload_worker_url") or "").rstrip("/")
        if env_url:
            return env_url
        if self._settings:
            return self._settings.get("R2_UPLOAD_WORKER_URL").rstrip("/")
        raise RuntimeError("R2_UPLOAD_WORKER_URL is not configured")

    def _secret(self) -> str:
        env_secret = str(self._runtime.get("r2_upload_worker_secret") or "").strip()
        if env_secret:
            return env_secret
        if self._settings:
            return self._settings.get("R2_UPLOAD_WORKER_SECRET")
        raise RuntimeError("R2_UPLOAD_WORKER_SECRET is not configured")

    def _preview_prefix(self) -> str:
        env_prefix = str(self._runtime.get("studio_preview_r2_prefix") or "").strip().strip("/")
        if env_prefix:
            return env_prefix
        if self._settings:
            return self._settings.get("STUDIO_PREVIEW_R2_PREFIX").strip("/")
        raise RuntimeError("STUDIO_PREVIEW_R2_PREFIX is not configured")

    def preview_key(self, production_request_id: str, transfer_id: str, suffix: str) -> str:
        prefix = self._preview_prefix()
        return f"{prefix}/item4/{production_request_id}/{transfer_id}{suffix}"

    def preview_url(self, key: str) -> str:
        return f"{MEDIA_PUBLIC_BASE}/{key.lstrip('/')}"

    def put_object(self, key: str, content: bytes, content_type: str) -> dict[str, Any]:
        response = requests.put(
            self._upload_url(),
            params={"key": key},
            data=content,
            headers={
                "x-pipeline-secret": self._secret(),
                "Content-Type": content_type,
            },
            timeout=300,
        )
        if not response.ok:
            raise RuntimeError(f"R2 upload failed ({response.status_code}): {response.text[:300]}")
        try:
            return response.json()
        except Exception:
            return {"ok": True}
