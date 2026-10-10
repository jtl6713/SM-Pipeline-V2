from __future__ import annotations

from typing import Any

import requests


class TimingEngineClient:
    def __init__(self, base_url: str, timeout: int = 180) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.timeout = timeout

    def create_timeline(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.base_url:
            raise RuntimeError("TIMING_ENGINE_URL is not configured")
        response = requests.post(
            f"{self.base_url}/timeline",
            json=payload,
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            detail = response.text
            try:
                detail = response.json().get("detail") or detail
            except Exception:
                pass
            raise RuntimeError(f"Timing Engine {response.status_code}: {detail}")
        # Empty 200 bodies used to surface as bare JSONDecodeError
        # ("Expecting value: line 1 column 1") and park studio-produce as Blocked
        # (Chicago Walk with me / Content 454).
        if not (response.content or b"").strip():
            raise RuntimeError(
                f"Timing Engine returned empty body (HTTP {response.status_code})"
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError(
                f"Timing Engine returned non-JSON body (HTTP {response.status_code}): "
                f"{(response.text or '')[:200]}"
            ) from exc
        if not isinstance(data, dict):
            raise RuntimeError(
                f"Timing Engine returned unexpected JSON type {type(data).__name__}"
            )
        return data
