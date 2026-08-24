"""Voiceover normalizer HTTP client — Make modules 4–5 port."""

from __future__ import annotations

from typing import Any

import requests

from config import load_settings
from p2.constants import (
    NORMALIZER_OUTPUT_BITRATE_KBPS,
    NORMALIZER_TARGET_LRA,
    NORMALIZER_TARGET_LUFS,
    NORMALIZER_TRUE_PEAK_DBTP,
)


def normalize_voiceover(
    audio_bytes: bytes,
    *,
    filename: str,
    normalizer_base_url: str | None = None,
) -> tuple[dict[str, Any], bytes]:
    settings = load_settings()
    base = (normalizer_base_url or settings.get("voiceover_normalizer_url") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("Voiceover normalizer URL is not configured")
    response = requests.post(
        f"{base}/normalize-audio",
        data=audio_bytes,
        headers={
            "Content-Type": "audio/mpeg",
            "X-Filename": filename,
            "X-Target-LUFS": NORMALIZER_TARGET_LUFS,
            "X-True-Peak-dBTP": NORMALIZER_TRUE_PEAK_DBTP,
            "X-Target-LRA": NORMALIZER_TARGET_LRA,
            "X-Output-Bitrate-Kbps": NORMALIZER_OUTPUT_BITRATE_KBPS,
        },
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("normalized"):
        raise RuntimeError(f"Voiceover normalizer rejected input: {payload.get('error') or payload}")
    download_url = str(payload.get("download_url") or "").strip()
    if not download_url:
        raise RuntimeError("Voiceover normalizer did not return download_url")
    metrics = payload.get("metrics") or {}
    if metrics.get("output_integrated_lufs") is None or metrics.get("output_true_peak_dbtp") is None:
        raise RuntimeError("Voiceover normalizer metrics missing output_integrated_lufs or output_true_peak_dbtp")
    download = requests.get(download_url, timeout=300)
    download.raise_for_status()
    normalized_bytes = download.content
    if not normalized_bytes:
        raise RuntimeError("Voiceover normalizer download returned empty body")
    return payload, normalized_bytes


def normalization_details(payload: dict[str, Any]) -> str:
    target = payload.get("target") or {}
    metrics = payload.get("metrics") or {}
    service_version = payload.get("service_version") or "unknown"
    return (
        f"Service v{service_version} | Target {target.get('integrated_lufs')} LUFS, "
        f"{target.get('true_peak_dbtp')} dBTP, LRA {target.get('loudness_range_lu')} | "
        f"Input {metrics.get('input_integrated_lufs')} LUFS / {metrics.get('input_true_peak_dbtp')} dBTP | "
        f"Output {metrics.get('output_integrated_lufs')} LUFS / {metrics.get('output_true_peak_dbtp')} dBTP | "
        f"Estimated gain {metrics.get('estimated_gain_db')} dB"
    )
