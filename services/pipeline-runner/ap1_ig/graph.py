from __future__ import annotations

from typing import Any

import requests

from item4.settings import PipelineSettings


class InstagramGraphError(RuntimeError):
    def __init__(self, message: str, *, status_code: str = "", status: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.status = status


def load_instagram_graph_settings(settings: PipelineSettings) -> dict[str, str]:
    ig_user_id = settings.get("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    token = settings.get("FACEBOOK_PAGE_ACCESS_TOKEN")
    version = (settings.get("FACEBOOK_GRAPH_API_VERSION") or "v25.0").strip().strip("/")
    if not ig_user_id or not token:
        raise InstagramGraphError("missing-instagram-settings")
    return {"ig_user_id": ig_user_id, "token": token, "version": version}


class InstagramReelClient:
    def __init__(self, *, ig_user_id: str, token: str, version: str = "v25.0") -> None:
        self.ig_user_id = ig_user_id
        self.version = version.strip().strip("/")
        self._token = token

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.version}/{path.lstrip('/')}"

    def create_reel(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = {**body, "access_token": self._token}
        response = requests.post(self._url(f"{self.ig_user_id}/media"), data=payload, timeout=60)
        created = response.json() if response.content else {}
        creation_id = str(created.get("id") or "").strip()
        status_code = str(created.get("status_code") or "")
        status = str(created.get("status") or created.get("error", {}).get("message") or "")
        if not response.ok or not creation_id or "ERROR" in status_code.upper() or "error" in status.lower():
            raise InstagramGraphError(
                created.get("error", {}).get("message") or status or f"create {response.status_code}",
                status_code=status_code or "unknown",
                status=status or "No status returned",
            )
        return created

    def container_status(self, creation_id: str) -> dict[str, Any]:
        response = requests.get(
            self._url(creation_id),
            params={"fields": "status_code,status", "access_token": self._token},
            timeout=30,
        )
        return response.json() if response.content else {}

    def wait_for_container(self, creation_id: str, *, attempts: int = 20, delay_s: float = 3.0) -> dict[str, Any]:
        import time

        last: dict[str, Any] = {}
        for _ in range(attempts):
            last = self.container_status(creation_id)
            code = str(last.get("status_code") or "").upper()
            if code == "ERROR":
                raise InstagramGraphError(
                    str(last.get("status") or "container error"),
                    status_code=code,
                    status=str(last.get("status") or "container error"),
                )
            if not code or code == "FINISHED":
                return last
            time.sleep(delay_s)
        raise InstagramGraphError(
            str(last.get("status") or "container still in progress"),
            status_code=str(last.get("status_code") or "IN_PROGRESS"),
            status=str(last.get("status") or "container still in progress"),
        )

    def publish(self, creation_id: str) -> dict[str, Any]:
        response = requests.post(
            self._url(f"{self.ig_user_id}/media_publish"),
            data={"creation_id": creation_id, "access_token": self._token},
            timeout=60,
        )
        published = response.json() if response.content else {}
        media_id = str(published.get("id") or "").strip()
        if not response.ok or not media_id:
            raise InstagramGraphError(
                published.get("error", {}).get("message") or f"publish {response.status_code}",
                status_code=str(published.get("status_code") or response.status_code),
                status=published.get("error", {}).get("message") or "No status returned",
            )
        return published

    def media_meta(self, media_id: str) -> dict[str, Any]:
        response = requests.get(
            self._url(media_id),
            params={"fields": "permalink,shortcode,media_type,media_product_type,timestamp", "access_token": self._token},
            timeout=30,
        )
        return response.json() if response.content else {}
