from __future__ import annotations

from typing import Any

import requests

from config import load_settings
from item4.settings import PipelineSettings
from publish.destinations import destination_value, resolve_publish_theme
from ttd.constants import DEFAULT_WORKER_BASE_URL


class TikTokDraftError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 0, body: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def load_tiktok_settings(
    settings: PipelineSettings,
    output: dict[str, Any] | None = None,
    *,
    client=None,
) -> dict[str, str]:
    env = load_settings()
    theme = resolve_publish_theme(output=output, client=client)
    url = (
        destination_value(settings, "TIKTOK_WORKER_BASE_URL", theme)
        or (
            ""
            if theme != "chicago"
            else str(env.get("tiktok_worker_base_url") or DEFAULT_WORKER_BASE_URL)
        )
    ).strip().rstrip("/")
    secret = (
        destination_value(settings, "TIKTOK_PIPELINE_SECRET", theme)
        or str(env.get("tiktok_pipeline_secret") or "")
        or str(env.get("pipeline_runner_shared_secret") or "")
    ).strip()
    if not url or not secret:
        raise TikTokDraftError("missing-tiktok-worker-settings")
    return {"url": url, "secret": secret}


class TikTokDraftClient:
    def __init__(self, *, base_url: str, secret: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._secret = secret

    def _headers(self) -> dict[str, str]:
        return {
            "X-Pipeline-Secret": self._secret,
            "Content-Type": "application/json",
        }

    def init_photo(self, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            f"{self.base_url}/tiktok/draft/photo/init",
            json=payload,
            headers=self._headers(),
            timeout=60,
        )
        return response.status_code, _json_body(response)

    def init_video(self, *, source_url: str) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            f"{self.base_url}/tiktok/draft/video/init",
            json={"source_url": source_url},
            headers=self._headers(),
            timeout=60,
        )
        return response.status_code, _json_body(response)

    def draft_status(self, publish_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            f"{self.base_url}/tiktok/draft/status",
            json={"publish_id": publish_id},
            headers=self._headers(),
            timeout=60,
        )
        return response.status_code, _json_body(response)


def _json_body(response: requests.Response) -> dict[str, Any]:
    if not response.content:
        return {}
    try:
        payload = response.json()
    except ValueError:
        return {"raw": response.text}
    return payload if isinstance(payload, dict) else {"data": payload}


def nested_value(payload: dict[str, Any], key: str) -> Any:
    if not isinstance(payload, dict):
        return None
    if payload.get(key) not in (None, ""):
        return payload.get(key)
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    if data.get(key) not in (None, ""):
        return data.get(key)
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    return body.get(key)


def publish_id_from(payload: dict[str, Any]) -> str:
    return str(nested_value(payload, "publish_id") or "").strip()


def draft_status_from(payload: dict[str, Any]) -> str:
    return str(nested_value(payload, "status") or "").strip()


def fail_reason_from(payload: dict[str, Any]) -> str:
    return str(nested_value(payload, "fail_reason") or "").strip()


def public_post_ids_from(payload: dict[str, Any]) -> list[str]:
    value = nested_value(payload, "publicly_available_post_ids")
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def is_capacity_error(payload: Any) -> bool:
    return "pending" in str(payload or "").casefold()
