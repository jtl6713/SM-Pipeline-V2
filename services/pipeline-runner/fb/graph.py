from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from fb.constants import DEFAULT_GRAPH_VERSION
from item4.settings import PipelineSettings


class FacebookPhotoError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | str = "",
        payload: Any = None,
        stage: str = "FB2",
        ambiguous: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload if isinstance(payload, dict) else {"raw": payload}
        self.stage = stage
        self.ambiguous = ambiguous


def load_facebook_page_settings(settings: PipelineSettings) -> dict[str, str]:
    page_id = settings.get("FACEBOOK_PAGE_ID")
    token = settings.get("FACEBOOK_PAGE_ACCESS_TOKEN")
    version = (settings.get("FACEBOOK_GRAPH_API_VERSION") or DEFAULT_GRAPH_VERSION).strip().strip("/")
    if not page_id or not token:
        raise FacebookPhotoError("missing-facebook-settings", stage="FB1")
    return {"page_id": page_id, "token": token, "version": version}


class FacebookPhotoClient:
    def __init__(self, *, page_id: str, token: str, version: str = DEFAULT_GRAPH_VERSION) -> None:
        self.page_id = page_id
        self.version = version.strip().strip("/")
        self._token = token

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.version}/{path.lstrip('/')}"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def create_unpublished_photo(self, image_url: str) -> tuple[int, dict[str, Any]]:
        response = requests.post(
            self._url(f"{self.page_id}/photos"),
            # Unpublished Page photos for /feed attached_media. Do not send
            # temporary=true — those objects are for ads and Graph often
            # returns OAuthException code 1 when a Page post attaches them.
            params={"url": image_url, "published": "false"},
            headers=self._headers(),
            timeout=60,
        )
        data = response.json() if response.content else {}
        return response.status_code, data if isinstance(data, dict) else {"raw": data}

    def download_image(self, url: str) -> tuple[bytes, str]:
        response = requests.get(url, timeout=120)
        if not response.ok or not response.content:
            raise FacebookPhotoError(
                f"cdn {response.status_code}",
                status_code=response.status_code,
                payload={"error": {"message": f"Could not download photo ({response.status_code})"}},
                stage="FB2_PUBLISH",
            )
        name = url.rsplit("/", 1)[-1].split("?")[0] or "facebook-photo.jpg"
        return response.content, name

    def publish_single_photo(
        self,
        *,
        image: bytes,
        filename: str,
        caption: str,
        place: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        form: dict[str, Any] = {"caption": caption, "published": "true"}
        place_id = str(place or "").strip()
        if place_id.isdigit():
            form["place"] = place_id
        try:
            response = requests.post(
                self._url(f"{self.page_id}/photos"),
                headers=self._headers(),
                data=form,
                files={"source": (filename, image, "image/jpeg")},
                timeout=120,
            )
        except requests.RequestException as exc:
            raise FacebookPhotoError(
                f"FB2 runtime/transport error after the Facebook publish request may have been sent. {exc}",
                stage="FB2_AMBIGUOUS",
                ambiguous=True,
            ) from exc
        data = response.json() if response.content else {}
        return response.status_code, data if isinstance(data, dict) else {"raw": data}

    def publish_attached_media(
        self,
        *,
        message: str,
        photo_ids: list[str],
        place: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        del place  # City Page IDs are not Graph places; tagging them returns code 1.
        attached = [{"media_fbid": photo_id} for photo_id in photo_ids]
        params: dict[str, Any] = {
            "message": message,
            "attached_media": json.dumps(attached, separators=(",", ":")),
            "published": "true",
        }
        try:
            response = requests.post(
                self._url(f"{self.page_id}/feed"),
                params=params,
                headers=self._headers(),
                timeout=60,
            )
        except requests.RequestException as exc:
            raise FacebookPhotoError(
                f"FB2 runtime/transport error after the Facebook publish request may have been sent. {exc}",
                stage="FB2_AMBIGUOUS",
                ambiguous=True,
            ) from exc
        data = response.json() if response.content else {}
        return response.status_code, data if isinstance(data, dict) else {"raw": data}

    def recent_feed(self, *, since: datetime | None, limit: int = 25) -> tuple[int, dict[str, Any]]:
        start = since or datetime.now(timezone.utc)
        params = {
            "fields": "id,message,created_time,permalink_url,attachments",
            "limit": str(limit),
            "since": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        response = requests.get(self._url(f"{self.page_id}/feed"), params=params, headers=self._headers(), timeout=60)
        data = response.json() if response.content else {}
        return response.status_code, data if isinstance(data, dict) else {"raw": data}

    def post_permalink(self, post_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            self._url(post_id),
            params={"fields": "id,permalink_url,created_time"},
            headers=self._headers(),
            timeout=60,
        )
        data = response.json() if response.content else {}
        if not isinstance(data, dict):
            data = {"raw": data}
        if 200 <= response.status_code <= 299:
            page = {}
            try:
                page_resp = requests.get(
                    self._url(self.page_id),
                    params={"fields": "id,username"},
                    headers=self._headers(),
                    timeout=30,
                )
                page = page_resp.json() if page_resp.content else {}
            except requests.RequestException:
                page = {}
            public = public_feed_url(
                page_id=self.page_id,
                page_username=str((page or {}).get("username") or ""),
                post_id=str(data.get("id") or post_id),
                permalink_url=str(data.get("permalink_url") or ""),
            )
            if public:
                data["permalink_url"] = public
        return response.status_code, data


def public_feed_url(
    *,
    page_id: str,
    page_username: str = "",
    post_id: str,
    permalink_url: str = "",
) -> str:
    """Prefer facebook.com/{vanity}/posts/{story} over New Pages profile IDs.

    Graph permalink_url often uses the 122… Page-profile id. That path only
    resolves when the viewer is logged in as a Page admin.
    """
    story = str(post_id or "").strip()
    if "_" in story:
        story = story.split("_", 1)[1]
    handle = str(page_username or page_id or "").strip().lstrip("@/")
    if handle and story and story.isdigit():
        return f"https://www.facebook.com/{handle}/posts/{story}"
    return str(permalink_url or "").strip()


def feed_since(started_at: str | None) -> datetime:
    text = str(started_at or "").strip()
    now = datetime.now(timezone.utc)
    if not text:
        return now - timedelta(minutes=10)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return now - timedelta(minutes=10)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc) - timedelta(minutes=10)
