from __future__ import annotations

from typing import Any

import requests


class RemotionClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")

    def post_render(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{self._base_url}/render",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=300,
        )
        data = response.json() if response.content else {}
        if not response.ok:
            raise RuntimeError(f"Remotion /render failed ({response.status_code}): {data}")
        if not data.get("statusUrl") or not data.get("jobId"):
            raise RuntimeError(f"Remotion /render did not return jobId/statusUrl: {data}")
        return data

    def get_status(self, status_url: str) -> dict[str, Any]:
        response = requests.get(status_url, timeout=300)
        data = response.json() if response.content else {}
        if not response.ok:
            raise RuntimeError(f"Remotion status failed ({response.status_code}): {data}")
        return data

    def download_render(self, render_url: str) -> bytes:
        response = requests.get(render_url, timeout=600)
        if response.status_code == 404 and "render.chicagoshining.com" in render_url:
            local = render_url.replace("https://render.chicagoshining.com", "http://127.0.0.1:3333")
            response = requests.get(local, timeout=600)
        response.raise_for_status()
        return response.content

    def cleanup_job(self, job_id: str, *, filename: str | None = None) -> None:
        url = f"{self._base_url}/cleanup/{job_id}"
        body = {"filename": filename} if filename else {}
        try:
            requests.post(url, json=body, timeout=120)
        except requests.RequestException:
            # Cleanup is best-effort; Make also tolerates failures here.
            return
