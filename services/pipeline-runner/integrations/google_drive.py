from __future__ import annotations

import json
import os
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

    def download_file(self, file_id: str, timeout: int = 300) -> tuple[bytes, str]:
        dest = ""
        try:
            import tempfile

            handle = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
            handle.close()
            dest = handle.name
            _path, mime = self.download_file_to_path(file_id, dest, timeout=timeout)
            with open(dest, "rb") as fh:
                return fh.read(), mime
        finally:
            if dest:
                try:
                    os.unlink(dest)
                except OSError:
                    pass

    def download_file_to_path(self, file_id: str, dest_path: str, timeout: int = 600) -> tuple[str, str]:
        token = self.access_token()
        with requests.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"alt": "media", "supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=max(5, int(timeout or 600)),
            stream=True,
        ) as response:
            response.raise_for_status()
            mime = response.headers.get("Content-Type", "application/octet-stream").split(";")[0].strip()
            with open(dest_path, "wb") as out:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        out.write(chunk)
        return dest_path, mime

    def generate_file_id(self) -> str:
        response = requests.get("https://www.googleapis.com/drive/v3/files/generateIds",
            params={"count":1,"space":"drive","type":"files"},
            headers={"Authorization":f"Bearer {self.access_token()}"}, timeout=30)
        response.raise_for_status()
        ids = response.json().get("ids") or []
        if len(ids)!=1 or not isinstance(ids[0],str) or not ids[0]:
            raise RuntimeError("Drive did not return an exact reserved file ID")
        return ids[0]

    def upload_file(
        self,
        folder_id: str,
        filename: str,
        content: bytes,
        mime_type: str,
        *,
        reserved_id: str | None = None,
    ) -> dict[str, Any]:
        # Google multipart upload is not reliable for 700+ MB iPhone MOVs:
        # requests buffers the entire file and times out on slow links. Use
        # chunked resumable Drive upload and preserve the original bytes.
        if len(content) > 20 * 1024 * 1024:
            if reserved_id:
                raise ValueError("reserved crop exceeds bounded multipart size")
            return self._upload_file_resumable(folder_id, filename, content, mime_type)
        token = self.access_token()
        metadata = {"name": filename, "parents": [folder_id]}
        if reserved_id:
            metadata["id"] = reserved_id
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

    def _upload_file_resumable(
        self, folder_id: str, filename: str, content: bytes, mime_type: str,
    ) -> dict[str, Any]:
        """Upload large files using bounded 8 MiB HTTP chunks, not multipart."""
        import time

        token = self.access_token()
        total = len(content)
        metadata = {"name": filename, "parents": [folder_id]}
        session = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "resumable", "supportsAllDrives": "true",
                    "fields": "id,webViewLink,webContentLink"},
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json; charset=UTF-8",
                     "X-Upload-Content-Type": mime_type,
                     "X-Upload-Content-Length": str(total)},
            data=json.dumps(metadata), timeout=60,
        )
        session.raise_for_status()
        location = str(session.headers.get("Location") or "")
        if not location.startswith("https://"):
            raise RuntimeError("Drive resumable session did not return HTTPS location")
        step = 8 * 1024 * 1024
        offset = 0
        while offset < total:
            end = min(total, offset + step)
            chunk = memoryview(content)[offset:end]
            response = None
            for retry in range(5):
                try:
                    response = requests.put(
                        location,
                        headers={"Content-Type": mime_type,
                                 "Content-Length": str(len(chunk)),
                                 "Content-Range": f"bytes {offset}-{end - 1}/{total}"},
                        data=chunk, timeout=180,
                    )
                except requests.RequestException:
                    response = None
                if response is not None and response.status_code in (200, 201):
                    break
                if response is not None and response.status_code == 308:
                    acknowledged = response.headers.get("Range", "")
                    confirmed = int(acknowledged.rsplit("-", 1)[-1]) + 1 if "-" in acknowledged else 0
                    if confirmed > offset:
                        break
                    # 308 with no Range acknowledges ZERO bytes. Never skip a chunk.
                    if retry == 4:
                        raise RuntimeError("Drive did not acknowledge any progress on upload chunk")
                    time.sleep(min(8, 2 ** retry))
                    continue
                # Query the acknowledged Drive offset before a retry: a timed
                # out response may have already committed the entire chunk.
                probe = requests.put(
                    location,
                    headers={"Content-Range": f"bytes */{total}",
                             "Content-Length": "0"}, timeout=60,
                )
                if probe.status_code in (200, 201):
                    return probe.json()
                if probe.status_code == 308:
                    acknowledged = probe.headers.get("Range", "")
                    committed = int(acknowledged.rsplit("-", 1)[-1]) + 1 if "-" in acknowledged else 0
                    if committed > offset:
                        offset = committed
                        break
                if retry == 4:
                    raise RuntimeError("Drive resumable upload retries exhausted")
                time.sleep(min(8, 2 ** retry))
            if response is not None and response.status_code in (200, 201):
                return response.json()
            if response is not None and response.status_code == 308:
                acknowledged = response.headers.get("Range", "")
                committed = int(acknowledged.rsplit("-", 1)[-1]) + 1 if "-" in acknowledged else end
                offset = max(offset, committed)
            else:
                offset = max(offset, end)
        raise RuntimeError("Drive resumable upload completed without a file receipt")

    def list_files(
        self,
        *,
        query: str,
        page_size: int = 10,
        order_by: str = "createdTime desc",
        fields: str = "files(id,name,mimeType,size,fileExtension,webContentLink,webViewLink,createdTime,modifiedTime,parents)",
    ) -> list[dict[str, Any]]:
        token = self.access_token()
        listed: list[dict[str, Any]] = []
        page_token = ""
        field_spec = fields if "nextPageToken" in fields else f"nextPageToken,{fields}"
        while True:
            params = {
                "q": query,
                "pageSize": page_size,
                "orderBy": order_by,
                "fields": field_spec,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            response = requests.get(
                "https://www.googleapis.com/drive/v3/files",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json() or {}
            listed.extend(payload.get("files") or [])
            page_token = str(payload.get("nextPageToken") or "")
            if not page_token:
                break
        return listed

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

    def list_file_permissions(self, file_id: str) -> list[dict[str, Any]]:
        """Read effective file permission entries; never grants or changes access.

        Used to deny public native-gallery staging files before creative review.
        A missing or overflowing permissions list fails closed.
        """
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", str(file_id or "")):
            raise ValueError("Invalid Drive permission lookup file ID")
        token = self.access_token()
        permissions: list[dict[str, Any]] = []
        page_token = ""
        for _ in range(3):
            params = {
                "supportsAllDrives": "true",
                "fields": "nextPageToken,permissions(id,type,role)",
                "pageSize": 100,
            }
            if page_token:
                params["pageToken"] = page_token
            reply = requests.get(
                f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions",
                params=params, headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
            reply.raise_for_status()
            body = reply.json()
            batch = body.get("permissions") if isinstance(body, dict) else None
            if not isinstance(batch, list):
                raise RuntimeError("Drive permission readback invalid")
            permissions.extend(batch)
            if len(permissions) > 200:
                raise RuntimeError("Drive permissions exceed verifier bound")
            page_token = str(body.get("nextPageToken") or "")
            if not page_token:
                return permissions
        raise RuntimeError("Drive permission readback incomplete")

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

    def remove_parent(self, file_id: str, parent_id: str) -> dict[str, Any]:
        token = self.access_token()
        parent = str(parent_id or "").strip()
        drive_id = str(file_id or "").strip()
        if not drive_id:
            raise ValueError("file_id is required")
        if not parent:
            raise ValueError("parent_id is required")
        response = requests.patch(
            f"https://www.googleapis.com/drive/v3/files/{drive_id}",
            params={
                "removeParents": parent,
                "supportsAllDrives": "true",
                "fields": "id,name,parents",
            },
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

    def rename_file(self, file_id: str, name: str) -> dict[str, Any]:
        filename = str(name or "").strip()
        drive_id = str(file_id or "").strip()
        if not drive_id:
            raise ValueError("file_id is required")
        if not filename:
            raise ValueError("name is required")
        return self.update_metadata(drive_id, name=filename)

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
