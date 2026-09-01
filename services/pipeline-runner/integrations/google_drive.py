from __future__ import annotations

import json
import re
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

    def list_files(
        self,
        *,
        query: str,
        page_size: int = 10,
        order_by: str = "createdTime desc",
        fields: str = "files(id,name,mimeType,size,fileExtension,webContentLink,webViewLink,createdTime,modifiedTime,parents)",
    ) -> list[dict[str, Any]]:
        token = self.access_token()
        response = requests.get(
            "https://www.googleapis.com/drive/v3/files",
            params={
                "q": query,
                "pageSize": page_size,
                "orderBy": order_by,
                "fields": fields,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        response.raise_for_status()
        return list(response.json().get("files") or [])

    def download_thumbnail(self, file_id: str, *, size: str = "w720") -> tuple[bytes, str] | None:
        meta = self.get_file(file_id, fields="id,mimeType,thumbnailLink,hasThumbnail")
        link = str(meta.get("thumbnailLink") or "").strip()
        if not link:
            return None
        if "sz=" in link:
            link = re.sub(r"sz=[^&]+", f"sz={size}", link)
        else:
            joiner = "&" if "?" in link else "?"
            link = f"{link}{joiner}sz={size}"
        token = self.access_token()
        response = requests.get(
            link,
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        if not response.ok:
            return None
        mime = response.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        if not mime.startswith("image/") or "svg" in mime:
            return None
        if len(response.content) < 80:
            return None
        return response.content, mime

    def get_file(self, file_id: str, *, fields: str = "id,name,mimeType,size,fileExtension,webContentLink,webViewLink,createdTime,modifiedTime,parents,trashed") -> dict[str, Any]:
        token = self.access_token()
        response = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"fields": fields, "supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()

    def move_file(self, file_id: str, dest_folder_id: str, *, remove_parent_id: str | None = None) -> dict[str, Any]:
        token = self.access_token()
        current_parent = remove_parent_id
        if not current_parent:
            meta = self.get_file(file_id, fields="id,parents")
            parents = meta.get("parents") or []
            current_parent = str(parents[0]) if parents else None
        params: dict[str, str] = {
            "addParents": dest_folder_id,
            "supportsAllDrives": "true",
            "fields": "id,name,mimeType,size,webContentLink,webViewLink,parents",
        }
        if current_parent:
            params["removeParents"] = current_parent
        response = requests.patch(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()

    def delete_file(self, file_id: str) -> None:
        token = self.access_token()
        response = requests.delete(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        response.raise_for_status()

    def trash_file(self, file_id: str) -> dict[str, Any]:
        token = self.access_token()
        response = requests.patch(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"supportsAllDrives": "true", "fields": "id,trashed"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"trashed": True},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()

    def search_trash_by_name(self, name: str) -> list[dict[str, Any]]:
        escaped = (name or "").replace("\\", "\\\\").replace("'", "\\'")
        return self.list_files(
            query=f"name = '{escaped}' and trashed = true",
            page_size=20,
            order_by="modifiedTime desc",
            fields="files(id,name,trashed,mimeType,size,modifiedTime)",
        )

    def share_anyone_reader(self, file_id: str) -> dict[str, Any]:
        token = self.access_token()
        permission_response = requests.post(
            f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions",
            params={"supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"type": "anyone", "role": "reader", "allowFileDiscovery": False},
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

    def update_media(self, file_id: str, content: bytes, mime_type: str) -> dict[str, Any]:
        token = self.access_token()
        response = requests.patch(
            f"https://www.googleapis.com/upload/drive/v3/files/{file_id}",
            params={
                "uploadType": "media",
                "supportsAllDrives": "true",
                "fields": "id,size,mimeType,webContentLink,webViewLink",
            },
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": mime_type or "application/octet-stream",
            },
            data=content or b"",
            timeout=300,
        )
        response.raise_for_status()
        return response.json()

    def update_metadata(
        self,
        file_id: str,
        *,
        name: str | None = None,
        mime_type: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if name:
            body["name"] = name
        if mime_type:
            body["mimeType"] = mime_type
        if not body:
            return {}
        token = self.access_token()
        response = requests.patch(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={
                "supportsAllDrives": "true",
                "fields": "id,name,mimeType,size,webContentLink,webViewLink",
            },
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
            timeout=60,
        )
        response.raise_for_status()
        return response.json()

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
