from __future__ import annotations

import os
import time
from typing import Any, BinaryIO

import requests

from config import load_settings
from item4.constants import MEDIA_PUBLIC_BASE
from item4.settings import PipelineSettings

DIRECT_PUT_MAX_BYTES = 95 * 1024 * 1024
MPU_PART_BYTES = 16 * 1024 * 1024
PUT_ATTEMPTS = 3


class R2UploadClient:
    def __init__(self, settings: PipelineSettings | None = None) -> None:
        self._runtime = load_settings()
        self._settings = settings

    def _upload_url(self) -> str:
        env_url = str(self._runtime.get("r2_upload_worker_url") or "").rstrip("/")
        if env_url:
            return env_url
        if self._settings:
            return self._settings.get("R2_UPLOAD_WORKER_URL").rstrip("/")
        raise RuntimeError("R2_UPLOAD_WORKER_URL is not configured")

    def _secret(self) -> str:
        env_secret = str(self._runtime.get("r2_upload_worker_secret") or "").strip()
        if env_secret:
            return env_secret
        if self._settings:
            return self._settings.get("R2_UPLOAD_WORKER_SECRET")
        raise RuntimeError("R2_UPLOAD_WORKER_SECRET is not configured")

    def _preview_prefix(self) -> str:
        env_prefix = str(self._runtime.get("studio_preview_r2_prefix") or "").strip().strip("/")
        if env_prefix:
            return env_prefix
        if self._settings:
            return self._settings.get("STUDIO_PREVIEW_R2_PREFIX").strip("/")
        raise RuntimeError("STUDIO_PREVIEW_R2_PREFIX is not configured")

    def preview_key(self, production_request_id: str, transfer_id: str, suffix: str) -> str:
        prefix = self._preview_prefix()
        return f"{prefix}/item4/{production_request_id}/{transfer_id}{suffix}"

    def preview_url(self, key: str) -> str:
        return f"{MEDIA_PUBLIC_BASE}/{key.lstrip('/')}"

    def _headers(self, content_type: str = "", extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "x-pipeline-secret": self._secret(),
            "User-Agent": "chicagoshining-studio-api/publish-dispatch",
        }
        if content_type:
            headers["Content-Type"] = content_type
        if extra:
            headers.update(extra)
        return headers

    def put_object(self, key: str, content: bytes, content_type: str) -> dict[str, Any]:
        data = content if isinstance(content, (bytes, bytearray)) else bytes(content)
        if len(data) > DIRECT_PUT_MAX_BYTES:
            import tempfile

            tmp = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
            try:
                tmp.write(data)
                tmp.close()
                return self.put_file(key, tmp.name, content_type)
            finally:
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass
        return self._put_direct(key, data, content_type)

    def put_file(self, key: str, path: str, content_type: str) -> dict[str, Any]:
        size = os.path.getsize(path)
        with open(path, "rb") as handle:
            if size <= DIRECT_PUT_MAX_BYTES:
                return self._put_stream(key, handle, content_type, size)
            return self._put_multipart(key, handle, content_type, size)

    def _put_direct(self, key: str, content: bytes, content_type: str) -> dict[str, Any]:
        return self._put_with_retries(
            lambda: requests.put(
                self._upload_url(),
                params={"key": key},
                data=content,
                headers=self._headers(content_type, extra={"Content-Length": str(len(content))}),
                timeout=300,
            )
        )

    def _put_stream(self, key: str, handle: BinaryIO, content_type: str, size: int) -> dict[str, Any]:
        def attempt() -> requests.Response:
            handle.seek(0)
            return requests.put(
                self._upload_url(),
                params={"key": key},
                data=handle,
                headers=self._headers(content_type, extra={"Content-Length": str(size)}),
                timeout=300,
            )

        return self._put_with_retries(attempt)

    def _put_multipart(self, key: str, handle: BinaryIO, content_type: str, size: int) -> dict[str, Any]:
        created = requests.post(
            self._upload_url(),
            params={"key": key, "action": "mpu-create"},
            headers=self._headers(content_type),
            timeout=60,
        )
        created_payload = self._json(created)
        upload_id = str(created_payload.get("uploadId") or "").strip()
        if not created.ok or created_payload.get("ok") is False or not upload_id:
            raise RuntimeError(f"R2 multipart create failed ({created.status_code}): {created.text[:300]}")
        parts: list[dict[str, Any]] = []
        part_number = 1
        try:
            while True:
                chunk = handle.read(MPU_PART_BYTES)
                if not chunk:
                    break
                uploaded = self._put_with_retries(
                    lambda data=chunk, number=part_number: requests.put(
                        self._upload_url(),
                        params={
                            "key": key,
                            "action": "mpu-part",
                            "uploadId": upload_id,
                            "partNumber": str(number),
                        },
                        data=data,
                        headers=self._headers(
                            "application/octet-stream",
                            extra={"Content-Length": str(len(data))},
                        ),
                        timeout=300,
                    )
                )
                etag = str(uploaded.get("etag") or "").strip()
                if not etag:
                    raise RuntimeError(f"R2 multipart part {part_number} missing etag")
                parts.append({"partNumber": part_number, "etag": etag})
                part_number += 1
            completed = requests.post(
                self._upload_url(),
                params={"key": key, "action": "mpu-complete", "uploadId": upload_id},
                headers=self._headers("application/json"),
                json={"parts": parts},
                timeout=120,
            )
            payload = self._json(completed)
            if not completed.ok or payload.get("ok") is False:
                raise RuntimeError(f"R2 multipart complete failed ({completed.status_code}): {completed.text[:300]}")
            payload.setdefault("public_url", f"{MEDIA_PUBLIC_BASE}/{key.lstrip('/')}")
            payload["parts"] = len(parts)
            payload["size"] = size
            return payload
        except Exception:
            try:
                requests.post(
                    self._upload_url(),
                    params={"key": key, "action": "mpu-abort", "uploadId": upload_id},
                    headers=self._headers(),
                    timeout=30,
                )
            except Exception:
                pass
            raise

    def _put_with_retries(self, send) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(PUT_ATTEMPTS):
            try:
                response = send()
                if not response.ok:
                    raise RuntimeError(f"R2 upload failed ({response.status_code}): {response.text[:300]}")
                return self._json(response)
            except (requests.ConnectionError, ConnectionError, OSError, requests.Timeout) as error:
                last_error = error
                if attempt + 1 >= PUT_ATTEMPTS:
                    break
                time.sleep(2 ** attempt)
        if last_error:
            raise last_error
        return {"ok": True}

    def _json(self, response: requests.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception:
            return {"ok": True} if response.ok else {"ok": False}
        return payload if isinstance(payload, dict) else {"ok": True, "data": payload}
