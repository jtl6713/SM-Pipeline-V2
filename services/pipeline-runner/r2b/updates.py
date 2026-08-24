"""R2B claim, fail-fast, and rollback writes (Make 5576620)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from r2.updates import _clip_count_default
from r2b.constants import RETRY_DELAY_MINUTES


def _now() -> datetime:
    return datetime.now(timezone.utc)


def mark_retry_started(client: AirtableClient, output: dict[str, Any]) -> None:
    fields = output.get("fields", {})
    stamp = _now().strftime("%Y-%m-%d %H:%M")
    previous_status = fields.get("Asset_Selection_Status") or ""
    previous_count = fields.get("Asset_Selection_Attempt_Count") or 0
    previous_notes = fields.get("Asset_Selection_Notes") or ""
    validation = fields.get("Asset_Validation_Mode") or "Advisory"
    mode = fields.get("Requested_Video_Clip_Count_Mode") or "AI decides"
    exact = fields.get("Requested_Video_Clip_Count_Exact")
    min_count = fields.get("Requested_Video_Clip_Count_Min")
    max_count = fields.get("Requested_Video_Clip_Count_Max")
    preferred_music = fields.get("Preferred_Music_Media_Asset_ID")
    notes = (
        f"R2B retry asset selection started at {stamp}. "
        f"Previous status: {previous_status}. Previous attempt count: {previous_count}. "
        f"Previous notes: {previous_notes} Validation mode: {validation}. "
        f"Clip count mode: {mode}. Exact: {exact}. Range: {min_count}-{max_count}. "
        f"Preferred music ID: {preferred_music}."
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Asset_Selection_Status": "Selecting",
            "Asset_Selection_Notes": notes,
            "Last_Asset_Selection_Attempt_At": _now().isoformat(),
        },
    )


def fail_fast_zero_candidates(client: AirtableClient, output: dict[str, Any]) -> None:
    fields = output.get("fields", {})
    min_needed = _clip_count_default(output)
    attempts = int(fields.get("Asset_Selection_Attempt_Count") or 0) + 1
    mode = fields.get("Requested_Video_Clip_Count_Mode") or "AI decides"
    exact = fields.get("Requested_Video_Clip_Count_Exact")
    min_count = fields.get("Requested_Video_Clip_Count_Min")
    max_count = fields.get("Requested_Video_Clip_Count_Max")
    preferred_music = fields.get("Preferred_Music_Media_Asset_ID")
    preferred_url = fields.get("Preferred_Music_URL")
    stamp = _now().isoformat()
    notes = (
        f"R2B zero-candidate FAIL FAST completed at {stamp}.\n"
        "No eligible classified video candidates were available after the Airtable view + Python eligibility gate.\n"
        "OpenAI retry selection was SKIPPED.\n"
        "Eligible video candidate count: 0.\n"
        f"Minimum assets needed: {min_needed}\n"
        "The retry attempt terminated as Partial Match; no selection/render-prep progression occurred.\n"
        "Retry remains eligible after new media becomes available.\n\n"
        "Production Request directives:\n"
        f"Clip count mode: {mode}\nExact: {exact}\nRange: {min_count}-{max_count}\n"
        f"Preferred music ID: {preferred_music}\nPreferred music URL: {preferred_url}"
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Asset_Selection_Minimum_Assets_Needed": min_needed,
            "Selected_Asset_Notes": (
                "Fail-fast: 0 eligible classified video candidates. OpenAI selection skipped."
            ),
            "Selected_Clip_1_Media_Asset_ID": None,
            "Selected_Clip_2_Media_Asset_ID": None,
            "Render_Clip_List_JSON": None,
            "Asset_Selection_Last_Result": "Partial Match",
            "Selected_Music_Media_Asset_ID": None,
            "Selected_Music_URL": None,
            "Clip_1_URL": None,
            "Clip_2_URL": None,
            "Asset_Selection_Status": "Partial Match",
            "Selected_Assets_JSON": None,
            "Asset_Selection_Attempt_Count": attempts,
            "Asset_Selection_Notes": notes,
            "Selected_Asset_Summary": (
                "Zero eligible classified video assets. OpenAI retry selection was skipped."
            ),
            "Last_Asset_Selection_Attempt_At": _now().isoformat(),
            "Asset_Selection_Retry_Eligible": True,
            "Selected_Clip_Count": 0,
        },
    )


def rollback_retryable(client: AirtableClient, output: dict[str, Any], error: Exception) -> None:
    fields = output.get("fields", {})
    previous_status = str(fields.get("Asset_Selection_Status") or "Partial Match")
    attempts = int(fields.get("Asset_Selection_Attempt_Count") or 0) + 1
    stamp = _now().strftime("%Y-%m-%d %H:%M")
    next_retry = _now() + timedelta(minutes=RETRY_DELAY_MINUTES)
    notes = (
        f"R2B final update failed at {stamp}. The Platform Output was restored to its previous "
        f"retry state and will be eligible again after {RETRY_DELAY_MINUTES} minutes.\n"
        f"Error type: {type(error).__name__}\nError message: {error}\n\n"
        f"Previous status: {fields.get('Asset_Selection_Status')}\n"
        f"Previous notes:\n{fields.get('Asset_Selection_Notes') or ''}"
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Asset_Selection_Last_Result": "Error",
            "Asset_Selection_Status": previous_status,
            "Asset_Selection_Attempt_Count": attempts,
            "Asset_Selection_Notes": notes,
            "Asset_Selection_Failure_Reason": (
                f"R2B final Airtable update failed. {type(error).__name__}: {error}"
            )[:10000],
            "Asset_Selection_Retry_Eligible": True,
            "Last_Asset_Selection_Attempt_At": _now().isoformat(),
            "Asset_Selection_Next_Retry_At": next_retry.isoformat(),
        },
    )
