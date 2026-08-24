from __future__ import annotations

from typing import Any

from asset.helpers import parse_bytes


def eligibility_reason(
    file: dict[str, Any],
    *,
    threshold_bytes: int,
    has_active_job: bool = False,
    check_job: bool = True,
) -> str | None:
    mime = str(file.get("mimeType") or "")
    name = str(file.get("name") or "")
    size = parse_bytes(file.get("size"))
    if not mime.startswith("video"):
        return "not_video"
    if size <= threshold_bytes:
        return "not_oversize"
    if "_compressed" in name:
        return "already_compressed"
    if check_job and has_active_job:
        return "active_job"
    return None
