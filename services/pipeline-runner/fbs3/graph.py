from __future__ import annotations

from typing import Any

import requests

from item4.settings import PipelineSettings
from publish.destinations import destination_value, resolve_publish_theme


class FacebookReelError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | str = "",
        payload: Any = None,
        stage: str = "FBS3",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload if isinstance(payload, dict) else {"raw": payload}
        self.stage = stage


def load_facebook_reel_settings(
    settings: PipelineSettings,
    output: dict[str, Any] | None = None,
    *,
    client=None,
) -> dict[str, str]:
    theme = resolve_publish_theme(output=output, client=client)
    page_id = destination_value(settings, "FACEBOOK_PAGE_ID", theme)
    token = destination_value(settings, "FACEBOOK_PAGE_ACCESS_TOKEN", theme)
    version = (
        destination_value(settings, "FACEBOOK_GRAPH_API_VERSION", theme) or "v25.0"
    ).strip().strip("/")
    if not page_id or not token:
        raise FacebookReelError("missing-facebook-settings")
    return {"page_id": page_id, "token": token, "version": version}


class FacebookReelClient:
    def __init__(self, *, page_id: str, token: str, version: str = "v25.0") -> None:
        self.page_id = page_id
        self.version = version.strip().strip("/")
        self._token = token

    def _url(self, path: str) -> str:
        return f"https://graph.facebook.com/{self.version}/{path.lstrip('/')}"

    def start_session(self) -> dict[str, Any]:
        response = requests.post(
            self._url(f"{self.page_id}/video_reels"),
            params={"upload_phase": "start"},
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=60,
        )
        data = response.json() if response.content else {}
        if not response.ok or not data.get("video_id") or not data.get("upload_url"):
            raise FacebookReelError(
                data.get("error", {}).get("message") or f"start {response.status_code}",
                status_code=response.status_code,
                payload=data,
                stage="FBS3_INIT",
            )
        return data

    def download_mp4(self, url: str) -> bytes:
        response = requests.get(url, timeout=120)
        if not response.ok or not response.content:
            raise FacebookReelError(
                f"cdn {response.status_code}",
                status_code=response.status_code,
                payload={"error": {"message": f"Could not download staged MP4 ({response.status_code})"}},
                stage="FBS3_UPLOAD",
            )
        return response.content

    def upload_mp4(self, upload_url: str, payload: bytes) -> dict[str, Any]:
        response = requests.post(
            upload_url,
            data=payload,
            headers={
                "Authorization": f"OAuth {self._token}",
                "offset": "0",
                "file_size": str(len(payload)),
                "Content-Type": "application/octet-stream",
            },
            timeout=180,
        )
        data = response.json() if response.content else {}
        if not response.ok or data.get("success") is False:
            raise FacebookReelError(
                data.get("error", {}).get("message") or data.get("debug_info", {}).get("message") or f"upload {response.status_code}",
                status_code=response.status_code,
                payload=data,
                stage="FBS3_UPLOAD",
            )
        return data

    def finish(
        self,
        *,
        video_id: str,
        description: str,
        title: str,
        place: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "upload_phase": "finish",
            "video_id": video_id,
            "video_state": "PUBLISHED",
            "description": description,
            "title": title,
        }
        place_id = str(place or "").strip()
        if place_id.isdigit():
            params["place"] = place_id
        response = requests.post(
            self._url(f"{self.page_id}/video_reels"),
            params=params,
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=60,
        )
        data = response.json() if response.content else {}
        if not response.ok:
            raise FacebookReelError(
                data.get("error", {}).get("message") or f"finish {response.status_code}",
                status_code=response.status_code,
                payload=data,
                stage="FBS3_FINISH",
            )
        return data

    def video_status(self, video_id: str) -> tuple[int, dict[str, Any]]:
        response = requests.get(
            self._url(video_id),
            params={"fields": "id,status,permalink_url,created_time"},
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=60,
        )
        data = response.json() if response.content else {}
        return response.status_code, data

    def attach_thumbnail(self, video_id: str, thumbnail_url: str) -> dict[str, Any]:
        image = requests.get(str(thumbnail_url or "").strip(), timeout=60)
        if not image.ok or not image.content:
            raise FacebookReelError(
                f"cover download {image.status_code}",
                status_code=image.status_code,
                payload={"error": {"message": f"Could not download cover ({image.status_code})"}},
                stage="FBS3_THUMBNAIL",
            )
        mime = (image.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip() or "image/jpeg"
        body = image.content
        filename = "cover.jpg"
        if "png" in mime or str(thumbnail_url).lower().endswith(".png"):
            try:
                from ap0.public_cover import cover_as_jpeg

                body, mime = cover_as_jpeg(body)
            except Exception:
                filename = "cover.png"
                mime = mime if "png" in mime else "image/png"
        elif "jpeg" not in mime and "jpg" not in mime:
            filename = "cover.bin"
        response = requests.post(
            self._url(f"{video_id}/thumbnails"),
            params={"is_preferred": "true"},
            headers={"Authorization": f"Bearer {self._token}"},
            files={"source": (filename, body, mime)},
            timeout=60,
        )
        data = response.json() if response.content else {}
        if not response.ok or (isinstance(data, dict) and data.get("error")):
            message = ""
            if isinstance(data, dict) and isinstance(data.get("error"), dict):
                message = str(data["error"].get("message") or "")
            raise FacebookReelError(
                message or f"thumbnail attach {response.status_code}",
                status_code=response.status_code,
                payload=data,
                stage="FBS3_THUMBNAIL",
            )
        return data
