"""Airtable write helpers for R2 claim / fail-fast paths."""

from __future__ import annotations

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
