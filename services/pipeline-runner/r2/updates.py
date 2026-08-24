"""Airtable write helpers for R2 claim / selection paths."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _field(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


def _clip_count_default(output: dict[str, Any]) -> int:
    mode = str(_field(output, "Requested_Video_Clip_Count_Mode") or "AI decides").strip()
    if mode == "Exact":
        return int(_field(output, "Requested_Video_Clip_Count_Exact") or 3)
    if mode == "Target range":
        return int(_field(output, "Requested_Video_Clip_Count_Min") or 3)
    target_length = int(_field(output, "Target_Final_Length") or 30)
    return 7 if target_length >= 30 else 3


def mark_selecting(client: AirtableClient, output: dict[str, Any]) -> None:
    fields = output.get("fields", {})
    mode = str(fields.get("Requested_Video_Clip_Count_Mode") or "AI decides")
    exact = fields.get("Requested_Video_Clip_Count_Exact")
    min_count = fields.get("Requested_Video_Clip_Count_Min")
    max_count = fields.get("Requested_Video_Clip_Count_Max")
    preferred_music = fields.get("Preferred_Music_Media_Asset_ID")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    notes = (
        f"R2 started asset selection at {stamp}. "
        f"Clip count mode: {mode}. Exact: {exact}. "
        f"Range: {min_count}-{max_count}. Preferred music ID: {preferred_music}."
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Asset_Selection_Retry_Eligible": None,
            "Asset_Selection_Status": "Selecting",
            "Asset_Selection_Notes": notes,
        },
    )


def fail_fast_zero_candidates(client: AirtableClient, output: dict[str, Any]) -> None:
    fields = output.get("fields", {})
    mode = str(fields.get("Requested_Video_Clip_Count_Mode") or "AI decides")
    exact = fields.get("Requested_Video_Clip_Count_Exact")
    min_count = fields.get("Requested_Video_Clip_Count_Min")
    max_count = fields.get("Requested_Video_Clip_Count_Max")
    preferred_music = fields.get("Preferred_Music_Media_Asset_ID")
    preferred_url = fields.get("Preferred_Music_URL")
    min_needed = _clip_count_default(output)
    attempts = int(fields.get("Asset_Selection_Attempt_Count") or 0) + 1
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    notes = (
        f"R2 zero-candidate FAIL FAST completed at {stamp}.\n"
        "No eligible classified video candidates were available after the Airtable view "
        "+ Python eligibility gate.\n"
        "OpenAI canonical selection was SKIPPED.\n"
        "Eligible video candidate count: 0.\n"
        f"Minimum assets needed: {min_needed}\n"
        "The selection attempt is terminal as Partial Match; no selection/render-prep "
        "progression occurred.\n"
        "P4 may now handle the missing-asset request. Retry remains eligible after new "
        "media becomes available.\n\n"
        f"Production Request directives:\nClip count mode: {mode}\n"
        f"Exact: {exact}\nRange: {min_count}-{max_count}\n"
        f"Preferred music ID: {preferred_music}\nPreferred music URL: {preferred_url}"
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Requested_Video_Clip_Count": min_needed,
            "Asset_Selection_Summary": (
                "Zero eligible classified video assets. OpenAI was skipped and the attempt "
                "terminated as Partial Match."
            ),
            "Asset_Selection_Status": "Partial Match",
            "Asset_Selection_Attempt_Count": attempts,
            "Asset_Selection_Last_Attempt_At": _now_iso(),
            "Asset_Selection_Notes": notes,
            "Asset_Selection_Failure_Reason": (
                "R2 fail-fast: zero eligible classified video candidates were available "
                "after the Airtable view + Python eligibility gate. OpenAI selection was skipped."
            ),
            "Asset_Selection_Retry_Eligible": True,
            "Selected_Clip_Count": 0,
            "Eligible_Video_Candidate_Count": 0,
            "Asset_Need_Status": "Partially Fulfilled",
            "Remotion_Props_JSON": "{}",
            "Music_Volume": "0",
        },
    )


def _clip_list(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    clips = parsed.get("selected_clips") or []
    if isinstance(clips, dict):
        keys = sorted(clips.keys(), key=lambda key: int(key) if str(key).isdigit() else str(key))
        return [clips[key] for key in keys]
    if isinstance(clips, list):
        return clips
    return []


def apply_selection(
    client: AirtableClient,
    output: dict[str, Any],
    *,
    raw_text: str,
    parsed: dict[str, Any],
    video_candidate_count: int,
) -> None:
    fields = output.get("fields", {})
    attempts = int(fields.get("Asset_Selection_Attempt_Count") or 0) + 1
    status = str(parsed.get("selection_status") or "Partial Match")
    clips = _clip_list(parsed)
    music = parsed.get("selected_music") if isinstance(parsed.get("selected_music"), dict) else {}
    render_prep = parsed.get("render_prep") if isinstance(parsed.get("render_prep"), dict) else {}
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    patch: dict[str, Any] = {
        "Requested_Video_Clip_Count": _clip_count_default(output),
        "Asset_Selection_Status": status,
        "Asset_Selection_Attempt_Count": attempts,
        "Asset_Selection_Last_Attempt_At": _now_iso(),
        "Selected_Assets_JSON": raw_text,
        "Selected_Clip_Count": len(clips),
        "Eligible_Video_Candidate_Count": video_candidate_count,
        "Asset_Selection_Summary": str(parsed.get("selection_summary") or "")[:10000],
        "Asset_Selection_Notes": (
            f"R2 Python asset selection completed at {stamp}.\n"
            f"Status: {status}\n"
            f"Validation: {parsed.get('validation_status')}\n"
            f"Selected clip count: {len(clips)}\n"
            f"Summary: {parsed.get('selection_summary') or ''}\n"
            f"Missing notes: {parsed.get('missing_asset_notes') or ''}"
        )[:10000],
        "Asset_Selection_Failure_Reason": (
            None
            if status == "Selected"
            else str(
                render_prep.get("validation_errors_text")
                or parsed.get("missing_asset_notes")
                or "R2 returned a non-selected result"
            )[:10000]
        ),
        "Asset_Selection_Retry_Eligible": status != "Selected",
        "Selected_Music_URL": music.get("google_drive_url") or render_prep.get("music_url"),
        "Selected_Music_Media_Asset_ID": music.get("media_asset_record_id"),
        "Remotion_Props_JSON": "{}",
        "Music_Volume": "0",
    }

    clip_urls = []
    for index, clip in enumerate(clips[:3], start=1):
        url = str(clip.get("google_drive_url") or "").strip()
        patch[f"Clip_{index}_URL"] = url or None
        patch[f"Clip_{index}_Media_Asset_Record_ID"] = clip.get("media_asset_record_id")
        patch[f"Clip_{index}_Duration_Frames"] = clip.get("durationFrames") or clip.get("duration_frames")
        if url:
            clip_urls.append(url)

    if clip_urls:
        links = " &nbsp;|&nbsp; ".join(
            f'<a href="{url}">Open image</a>' for url in clip_urls[:3]
        )
        patch["Selected_Asset_Links"] = links

    if status != "Selected":
        patch["Asset_Need_Status"] = "Partially Fulfilled"

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], patch)
