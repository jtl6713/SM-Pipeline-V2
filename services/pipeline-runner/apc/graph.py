from __future__ import annotations

from typing import Any

import requests

from apc.constants import DEFAULT_GRAPH_VERSION
from item4.settings import PipelineSettings
from publish.destinations import destination_value, resolve_publish_theme


class InstagramCarouselError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | str = "", payload: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload if isinstance(payload, dict) else {"raw": payload}


def load_instagram_settings(
    settings: PipelineSettings,
    output: dict[str, Any] | None = None,
    *,
    client=None,
) -> dict[str, str]:
    theme = resolve_publish_theme(output=output, client=client)
    ig_user_id = destination_value(settings, "INSTAGRAM_BUSINESS_ACCOUNT_ID", theme)
    token = destination_value(settings, "META_GRAPH_API_ACCESS_TOKEN", theme) or destination_value(
        settings, "FACEBOOK_PAGE_ACCESS_TOKEN", theme
    )
    version = (
        destination_value(settings, "FACEBOOK_GRAPH_API_VERSION", theme)
        or destination_value(settings, "META_GRAPH_API_VERSION", theme)
        or DEFAULT_GRAPH_VERSION
    )
    version = version.strip().strip("/")
    if not ig_user_id or not token:
        raise InstagramCarouselError("missing-instagram-settings")
    return {"ig_user_id": ig_user_id, "token": token, "version": version}


class InstagramCarouselClient:
    def __init__(self, *, ig_user_id: str, token: str, version: str = DEFAULT_GRAPH_VERSION) -> None:
        self.ig_user_id = ig_user_id
        self.version = version.strip().strip("/")
        self._token = token

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.version}/{path.lstrip('/')}"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def _parse(self, response: requests.Response) -> tuple[int, dict[str, Any]]:
        data = response.json() if response.content else {}
        if not isinstance(data, dict):
            data = {"raw": data}
        return response.status_code, data

    def create_child(self, image_url: str) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            self._url(f"{self.ig_user_id}/media"),
            headers=self._headers(),
            params={"image_url": image_url, "is_carousel_item": "true"},
            timeout=60,
        )
        return self._parse(response)

    def create_parent(self, *, children: list[str], caption: str) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            self._url(f"{self.ig_user_id}/media"),
            headers=self._headers(),
            params={"media_type": "CAROUSEL", "children": ",".join(children), "caption": caption},
            timeout=60,
        )
        return self._parse(response)

    def container_status(self, container_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            self._url(container_id),
            headers=self._headers(),
            params={"fields": "status_code,status"},
            timeout=60,
        )
        return self._parse(response)

    def publish(self, creation_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            self._url(f"{self.ig_user_id}/media_publish"),
            headers=self._headers(),
            params={"creation_id": creation_id},
            timeout=60,
        )
        return self._parse(response)

    def list_recent_media(self, *, limit: int = 25) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            self._url(f"{self.ig_user_id}/media"),
            headers=self._headers(),
            params={
                "fields": "id,caption,permalink,timestamp,media_type,media_product_type",
                "limit": str(limit),
            },
            timeout=60,
        )
        return self._parse(response)

    def media_meta(self, media_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            self._url(media_id),
            headers=self._headers(),
            params={"fields": "id,permalink,timestamp,media_type,media_product_type,caption"},
            timeout=60,
        )
        return self._parse(response)


def graph_id(payload: dict[str, Any]) -> str:
    return str(payload.get("id") or "").strip()


def http_ok(status_code: int) -> bool:
    return 200 <= int(status_code) <= 299


def error_message(payload: dict[str, Any], status_code: int) -> str:
    error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
    return str(error.get("message") or payload.get("status") or f"HTTP {status_code}")


def mapped_status(status_code: int, payload: dict[str, Any], *, child: bool = False) -> str:
    code = str(payload.get("status_code") or "").strip().upper()
    if not http_ok(status_code):
        return "ERROR" if child else "IN_PROGRESS"
    if code == "PUBLISHED":
        return "FINISHED"
    return code or "IN_PROGRESS"
