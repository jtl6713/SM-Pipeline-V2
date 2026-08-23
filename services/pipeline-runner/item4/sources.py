from __future__ import annotations

import requests

from config import load_settings
from item4.constants import MEDIA_PUBLIC_BASE


def download_public_url(url: str) -> tuple[bytes, str]:
    response = requests.get(url, timeout=300)
    response.raise_for_status()
    mime = response.headers.get("Content-Type", "application/octet-stream").split(";")[0].strip()
    return response.content, mime


def resolve_master_source(fields: dict) -> tuple[bytes, str]:
    source_url = str(fields.get("Source_URL") or "").strip()
    r2_key = str(fields.get("Source_R2_Key") or "").strip()
    if not source_url and r2_key:
        source_url = f"{MEDIA_PUBLIC_BASE}/{r2_key.lstrip('/')}"
    if not source_url:
        raise RuntimeError("Master queue row is missing Source_URL / Source_R2_Key")
    return download_public_url(source_url)
