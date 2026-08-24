from __future__ import annotations

from urllib.parse import quote

import requests

from item4.constants import MEDIA_PUBLIC_BASE, STUDIO_MASTER_PREFIX

BRIDGE_BASE_SETTING = "STUDIO_MEDIA_BRIDGE_BASE_URL"
BRIDGE_TOKEN_SETTING = "STUDIO_MEDIA_BRIDGE_TOKEN"
BRIDGE_TOKEN_HEADER = "X-Studio-Bridge-Token"


def download_public_url(url: str) -> tuple[bytes, str]:
    response = requests.get(url, timeout=300)
    response.raise_for_status()
    mime = response.headers.get("Content-Type", "application/octet-stream").split(";")[0].strip()
    return response.content, mime


def download_via_media_bridge(r2_key: str, settings) -> tuple[bytes, str]:
    """Read studio/master-assets from STUDIO_MEDIA via the private media-bridge Worker.

    Make SMV1 Module 53 did the same GET. The public CDN host is the publish
    bucket, so HTTP GET of master-assets there 404s.
    """
    base = str(settings.get(BRIDGE_BASE_SETTING) or "").strip().rstrip("/")
    token = str(settings.get(BRIDGE_TOKEN_SETTING) or "").strip()
    if not base or not token:
        raise RuntimeError(
            "Pipeline Settings missing STUDIO_MEDIA_BRIDGE_BASE_URL or STUDIO_MEDIA_BRIDGE_TOKEN"
        )
    url = f"{base}/transfer?key={quote(r2_key, safe='/')}"
    response = requests.get(url, headers={BRIDGE_TOKEN_HEADER: token}, timeout=300)
    if response.status_code == 404:
        raise RuntimeError(f"Staged object not found via media bridge for key {r2_key}")
    if response.status_code in {401, 403}:
        raise RuntimeError("Studio media bridge rejected the Pipeline Settings token")
    response.raise_for_status()
    mime = response.headers.get("Content-Type", "application/octet-stream").split(";")[0].strip()
    return response.content, mime


def is_studio_master_key(r2_key: str) -> bool:
    return str(r2_key or "").strip().startswith(STUDIO_MASTER_PREFIX)


def resolve_master_source(fields: dict, settings=None) -> tuple[bytes, str]:
    r2_key = str(fields.get("Source_R2_Key") or "").strip()
    source_url = str(fields.get("Source_URL") or "").strip()
    if is_studio_master_key(r2_key):
        if settings is None:
            raise RuntimeError("Pipeline Settings are required to read studio/master-assets")
        return download_via_media_bridge(r2_key, settings)
    if not source_url and r2_key:
        source_url = f"{MEDIA_PUBLIC_BASE}/{r2_key.lstrip('/')}"
    if not source_url:
        raise RuntimeError("Master queue row is missing Source_URL / Source_R2_Key")
    return download_public_url(source_url)
