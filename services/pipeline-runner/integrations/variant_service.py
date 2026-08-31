from __future__ import annotations

import io
from typing import Any

import requests
from PIL import Image

from config import load_settings
from item4.constants import VARIANT_RECIPE_VERSION
from item4.settings import PipelineSettings

# Cloudflare Images on the variant Worker dies on 20MB+ phone JPEGs
# ("Worker exceeded resource limits" / "Network connection lost").
MAX_VARIANT_SOURCE_BYTES = 3_500_000
MAX_VARIANT_SOURCE_EDGE = 2560


def prepare_variant_source(
    image_bytes: bytes,
    *,
    max_bytes: int = MAX_VARIANT_SOURCE_BYTES,
    max_edge: int = MAX_VARIANT_SOURCE_EDGE,
) -> bytes:
    if len(image_bytes) <= max_bytes:
        return image_bytes
    image = Image.open(io.BytesIO(image_bytes))
    image = image.convert("RGB")
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=90, optimize=True)
    prepared = out.getvalue()
    return prepared if prepared else image_bytes


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
        payload = prepare_variant_source(image_bytes)
        params = {
            "ratio": ratio,
            "recipe": VARIANT_RECIPE_VERSION,
            "g": gravity or "center",
        }
        response = requests.post(
            f"{base}/render",
            params=params,
            data=payload,
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
