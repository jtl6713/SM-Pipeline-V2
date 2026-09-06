"""Copy a finished-video master onto the public preview host.

`studio/master-assets/` lives on the private STUDIO_MEDIA bucket.
media.chicagoshining.com is the publish bucket, so those keys 404 in Preview
until a studio/previews/ copy exists.
"""

from __future__ import annotations

import json
from typing import Any

from ap0.public_mp4 import (
    download_master_video_bytes,
    existing_finished_preview_url,
    finished_video_preview_key,
    stage_finished_video_preview,
)
from studio_produce.constants import PRODUCTION_REQUESTS_TABLE
from studio_produce.context import master_assets
from studio_produce.job import utc_now


def _looks_like_video(master: dict[str, Any]) -> bool:
    mime = str(master.get("mime_type") or "").lower()
    name = str(master.get("name") or "").lower()
    return mime.startswith("video/") or name.endswith((".mp4", ".mov", ".m4v", ".webm"))


def ensure_finished_preview_masters(client, request: dict[str, Any]) -> dict[str, Any]:
    request_id = str(request.get("id") or "").strip()
    masters = master_assets(request)
    video = next((item for item in masters if _looks_like_video(item)), masters[0] if masters else None)
    if not request_id or not video:
        return request
    existing = existing_finished_preview_url(video)
    if existing:
        if str(video.get("url") or "") == existing and str(video.get("preview_public_url") or "") == existing:
            return request
        preview_key = str(video.get("preview_r2_key") or "").strip() or finished_video_preview_key(
            request_id, str(video.get("id") or "file")
        )
        return _persist(client, request_id, masters, video, existing, preview_key)

    content = download_master_video_bytes(video, client)
    url = stage_finished_video_preview(request_id, str(video.get("id") or "file"), content)
    preview_key = finished_video_preview_key(request_id, str(video.get("id") or "file"))
    return _persist(client, request_id, masters, video, url, preview_key)


def _persist(
    client,
    request_id: str,
    masters: list[dict[str, Any]],
    video: dict[str, Any],
    url: str,
    preview_key: str,
) -> dict[str, Any]:
    next_masters = []
    for asset in masters:
        if str(asset.get("id") or "") != str(video.get("id") or ""):
            next_masters.append(asset)
            continue
        row = dict(asset)
        row["preview_r2_key"] = preview_key
        row["preview_public_url"] = url
        row["url"] = url
        next_masters.append(row)
    return client.update_record(
        PRODUCTION_REQUESTS_TABLE,
        request_id,
        {
            "Studio_Master_Assets_JSON": json.dumps(next_masters),
            "Updated_At": utc_now(),
        },
        typecast=True,
    )
