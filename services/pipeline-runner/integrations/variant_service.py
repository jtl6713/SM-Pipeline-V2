from __future__ import annotations

from typing import Any

import requests

from config import load_settings
from item4.constants import VARIANT_RECIPE_VERSION
from item4.settings import PipelineSettings


class VariantServiceClient:
    def __init__(self, settings: PipelineSettings | None = None) -> None:
        self._runtime = load_settings()
        self._settings = settings

    def _base_url(self) -> str:
        env_url = str(self._runtime.get("variant_service_url") or "").rstrip("/")
        if env_url:
            return env_url
        if self._settings:
            return self._settings.get("STUDIO_VARIANT_SERVICE_BASE_URL").rstrip("/")
        raise RuntimeError("STUDIO_VARIANT_SERVICE_BASE_URL is not configured")

    def _token(self) -> str:
        env_token = str(self._runtime.get("variant_service_token") or "").strip()
        if env_token:
            return env_token
        if self._settings:
            return self._settings.get("STUDIO_VARIANT_SERVICE_TOKEN")
        raise RuntimeError("STUDIO_VARIANT_SERVICE_TOKEN is not configured")

    def render(self, image_bytes: bytes, ratio: str, gravity: str = "center") -> bytes:
        base = self._base_url()
        token = self._token()
        params = {
            "ratio": ratio,
            "recipe": VARIANT_RECIPE_VERSION,
            "g": gravity or "center",
        }
        response = requests.post(
            f"{base}/render",
            params=params,
            data=image_bytes,
            headers={
                "X-Studio-Variant-Token": token,
                "Content-Type": "application/octet-stream",
            },
            timeout=300,
        )
        if not response.ok:
            detail = response.text[:500]
            raise RuntimeError(f"Variant service failed ({response.status_code}): {detail}")
        return response.content

    def health(self) -> dict[str, Any]:
        base = self._base_url()
        response = requests.get(f"{base}/health", timeout=30)
        response.raise_for_status()
        return response.json()
