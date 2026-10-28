"""Fail-closed TikTok public-MP4 check against the immutable Drive final.

TikTok's PULL_FROM_URL handoff is asynchronous: a successful HEAD request or
single-byte range GET does not prove the fetched video contains every scene.
"""

from __future__ import annotations

import hashlib
import os
import tempfile

import requests

from integrations.google_drive import GoogleDriveClient
from ap0.public_mp4 import is_public_publish_url

CHUNK_BYTES = 1024 * 1024
# The TikTok Content Posting API documents a 4 GB maximum video size.
MAX_VIDEO_BYTES = 4 * 1000 * 1000 * 1000


def _file_digest(path: str) -> tuple[int, str]:
    size = 0
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        while chunk := stream.read(CHUNK_BYTES):
            size += len(chunk)
            if size > MAX_VIDEO_BYTES:
                raise ValueError("TikTok video exceeds the 4 GB API limit")
            digest.update(chunk)
    if size < 1024:
        raise ValueError("The authoritative Drive MP4 is empty or implausibly small")
    return size, digest.hexdigest()


def verify_public_video_matches_drive(source_url: str, drive_file_id: str) -> dict[str, str | int]:
    """Read *all* CDN bytes, rejecting redirects, truncation, and stale previews.

    Does not mutate source media or initiate a TikTok draft. Once verified, the
    caller may hand this exact output-specific URL to TikTok's PULL_FROM_URL API.
    """
    if not is_public_publish_url(source_url):
        raise ValueError("TikTok video URL must use the owned public media host")
    if not str(drive_file_id or "").strip():
        raise ValueError("No authoritative Drive final file to verify against")

    handle = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    handle.close()
    try:
        GoogleDriveClient().download_file_to_path(drive_file_id, handle.name)
        expected_bytes, expected_sha = _file_digest(handle.name)
    finally:
        os.unlink(handle.name)

    with requests.get(source_url, stream=True, allow_redirects=False, timeout=(15, 180)) as response:
        if response.status_code != 200:
            raise RuntimeError(f"TikTok public MP4 must return HTTP 200 without redirect; received {response.status_code}")
        announced_length = response.headers.get("Content-Length", "").strip()
        if announced_length:
            try:
                announced_bytes = int(announced_length)
            except (TypeError, ValueError) as exc:
                raise RuntimeError("TikTok public MP4 has invalid Content-Length") from exc
            if announced_bytes != expected_bytes:
                raise RuntimeError(
                    f"TikTok public MP4 length mismatch: CDN {announced_bytes}, Drive {expected_bytes} bytes"
                )

        actual_bytes = 0
        digest = hashlib.sha256()
        for chunk in response.iter_content(chunk_size=CHUNK_BYTES):
            if not chunk:
                continue
            actual_bytes += len(chunk)
            if actual_bytes > expected_bytes:
                raise RuntimeError("TikTok public MP4 exceeds authoritative Drive size")
            digest.update(chunk)

    if actual_bytes != expected_bytes:
        raise RuntimeError(
            f"TikTok public MP4 is incomplete: CDN {actual_bytes}, Drive {expected_bytes} bytes"
        )
    if digest.hexdigest() != expected_sha:
        raise RuntimeError("TikTok public MP4 differs from authoritative Drive final (SHA-256 mismatch)")
    return {"bytes": actual_bytes, "sha256": expected_sha}
