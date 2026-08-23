from __future__ import annotations

import json
from typing import Any

import requests

from config import load_settings


class GoogleDriveClient:
    def __init__(self) -> None:
        settings = load_settings()
        self._client_id = settings.get("google_client_id", "")
        self._client_secret = settings.get("google_client_secret", "")
        self._refresh_token = settings.get("google_refresh_token", "")
        self._access_token: str | None = None

    def _ensure_configured(self) -> None:
        if not all([self._client_id, self._client_secret, self._refresh_token]):
            raise RuntimeError(
                "Google Drive credentials missing — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
                "and GOOGLE_REFRESH_TOKEN with Drive scope in .env"
            )

    def access_token(self) -> str:
        self._ensure_configured()
        if self._access_token:
            return self._access_token
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "refresh_token": self._refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        token = str(payload.get("access_token") or "")
        if not token:
            raise RuntimeError("Google OAuth token response missing access_token")
        self._access_token = token
        return token

    def download_file(self, file_id: str) -> tuple[bytes, str]:
        token = self.access_token()
        response = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"alt": "media", "supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=300,
        )
        response.raise_for_status()
        mime = response.headers.get("Content-Type", "application/octet-stream").split(";")[0].strip()
        return response.content, mime

    def upload_file(
        self,
        folder_id: str,
        filename: str,
        content: bytes,
        mime_type: str,
    ) -> dict[str, Any]:
        token = self.access_token()
        metadata = {"name": filename, "parents": [folder_id]}
        files = {
            "metadata": ("metadata", json.dumps(metadata), "application/json; charset=UTF-8"),
            "file": (filename, content, mime_type),
        }
        response = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={
                "uploadType": "multipart",
                "supportsAllDrives": "true",
                "fields": "id,webViewLink,webContentLink",
            },
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            timeout=300,
        )
        response.raise_for_status()
        return response.json()

    def share_anyone_reader(self, file_id: str) -> dict[str, Any]:
        token = self.access_token()
        permission_response = requests.post(
            f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions",
            params={"supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"type": "anyone", "role": "reader"},
            timeout=60,
        )
        permission_response.raise_for_status()
        metadata_response = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"fields": "id,webContentLink,webViewLink", "supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        metadata_response.raise_for_status()
        return metadata_response.json()

    def upload_and_share(
        self,
        folder_id: str,
        filename: str,
        content: bytes,
        mime_type: str,
    ) -> dict[str, Any]:
        uploaded = self.upload_file(folder_id, filename, content, mime_type)
        file_id = str(uploaded.get("id") or "")
        if not file_id:
            raise RuntimeError("Google Drive upload did not return a file id")
        shared = self.share_anyone_reader(file_id)
        link = str(shared.get("webContentLink") or shared.get("webViewLink") or uploaded.get("webViewLink") or "")
        return {"id": file_id, "webContentLink": link, "webViewLink": shared.get("webViewLink") or link}
