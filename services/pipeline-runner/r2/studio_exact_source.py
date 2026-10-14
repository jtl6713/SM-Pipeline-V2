"""Studio exact-source authority helpers for R2."""

from __future__ import annotations

import json
from typing import Any


def _field(record: dict[str, Any], name: str) -> str:
    return str(record.get("fields", {}).get(name) or "").strip()


def output_has_studio_exact_source(output: dict[str, Any]) -> bool:
    notes = _field(output, "Asset_Selection_Notes")
    selected_json = _field(output, "Selected_Assets_JSON")
    return (
        "Studio exact source authority" in notes
        or "studio_owner_uploaded_exact_source" in selected_json
    )


def content_item_studio_ready(content_item: dict[str, Any] | None) -> bool:
    if not content_item:
        return False
    return _field(content_item, "Studio_Source_Authority_Status") == "Ready"


def locked_visual_package(content_item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not content_item:
        return None
    raw = _field(content_item, "Studio_Source_Selected_Assets_JSON")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def locked_clips(package: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(package, dict):
        return []
    clips = package.get("selected_clips") or package.get("clips") or []
    if isinstance(clips, dict):
        keys = sorted(clips.keys(), key=lambda key: int(key) if str(key).isdigit() else str(key))
        return [clips[key] for key in keys if isinstance(clips.get(key), dict)]
    if isinstance(clips, list):
        return [clip for clip in clips if isinstance(clip, dict)]
    return []


def normalize_locked_clip(clip: dict[str, Any], index: int) -> dict[str, Any]:
    duration_frames = clip.get("durationFrames")
    if duration_frames is None:
        duration_frames = clip.get("duration_frames")
    start_frame = clip.get("startFrame")
    if start_frame is None:
        start_frame = clip.get("start_frame")
    if start_frame is None:
        start_frame = 0
    return {
        "media_asset_record_id": clip.get("media_asset_record_id") or clip.get("id"),
        "google_drive_url": clip.get("google_drive_url") or clip.get("url"),
        "google_drive_file_id": clip.get("google_drive_file_id") or clip.get("googleDriveFileId"),
        "durationFrames": duration_frames,
        "startFrame": start_frame,
        "order": clip.get("order", index),
        "source": clip.get("source") or "studio_owner_uploaded_exact_source",
    }


def pick_music_without_openai(
    music_candidates: list[dict[str, Any]],
    *,
    preferred_media_asset_id: str = "",
    required_seconds: float = 0.0,
) -> dict[str, Any] | None:
    preferred = str(preferred_media_asset_id or "").strip()
    rows = list(music_candidates or [])
    if preferred:
        for row in rows:
            if row.get("id") == preferred:
                return row
    if required_seconds > 0:
        for row in rows:
            try:
                duration = float(row.get("fields", {}).get("Duration_Seconds") or 0)
            except (TypeError, ValueError):
                duration = 0.0
            # R2 already orders the eligible rows by profile rotation priority.
            # Preserve that ordering instead of repeatedly choosing the longest track.
            if duration + 0.05 >= required_seconds:
                return row
    return rows[0] if rows else None


def music_selection_from_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    fields = row.get("fields") or {}
    return {
        "media_asset_record_id": row.get("id"),
        "google_drive_url": str(fields.get("Google Drive URL") or fields.get("Google_Drive_URL") or "").strip() or None,
        "google_drive_file_id": str(fields.get("Google Drive File ID") or fields.get("Google_Drive_File_ID") or "").strip() or None,
        "title": str(fields.get("Asset Name") or fields.get("Name") or "").strip() or None,
    }


def build_exact_source_selection(
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    music_candidates: list[dict[str, Any]] | None = None,
    required_music_seconds: float = 0.0,
) -> dict[str, Any] | None:
    """Build a canonical selection package from the locked Studio exact-source set."""
    if not (output_has_studio_exact_source(output) and content_item_studio_ready(content_item)):
        return None
    package = locked_visual_package(content_item)
    clips = locked_clips(package)
    if not clips:
        return None
    normalized = [normalize_locked_clip(clip, index) for index, clip in enumerate(clips, start=1)]
    preferred_music = _field(output, "Preferred_Music_Media_Asset_ID")
    music_row = pick_music_without_openai(
        music_candidates or [],
        preferred_media_asset_id=preferred_music,
        required_seconds=required_music_seconds,
    )
    music = music_selection_from_row(music_row)
    parsed = {
        "selection_status": "Selected",
        "validation_status": "passed",
        "selection_summary": "Studio exact-source package copied without OpenAI.",
        "missing_asset_notes": "",
        "selected_clips": normalized,
        "selected_music": music,
        "render_prep": {
            "music_url": (music or {}).get("google_drive_url"),
            "exact_source": True,
        },
        "authority": "studio_owner_uploaded_exact_source",
    }
    if isinstance(package, dict):
        for key in ("schema_version", "selected_assets_json"):
            if key in package:
                parsed[key] = package[key]
    return {
        "raw_text": json.dumps(parsed, ensure_ascii=True),
        "parsed": parsed,
        "selection_status": "Selected",
        "route": "exact_source_skip_openai",
    }


def requires_openai_for_output(output: dict[str, Any], content_item: dict[str, Any] | None) -> bool:
    """True when canonical GPT selection is still required."""
    if build_exact_source_selection(output=output, content_item=content_item) is not None:
        return False
    return True
