"""Gather classified video/music candidates for R2."""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from r2.constants import (
    MEDIA_ASSETS_TABLE,
    MUSIC_CANDIDATE_LIMIT,
    MUSIC_CANDIDATES_VIEW,
    VIDEO_CANDIDATE_LIMIT,
    VIDEO_CANDIDATES_VIEW,
)

if TYPE_CHECKING:
    from airtable.client import AirtableClient

ALLOWED_RIGHTS = {"Owned", "Licensed", "Public Domain"}


def _field(row: dict[str, Any], name: str) -> str:
    return str(row.get("fields", {}).get(name) or "").strip()


def is_eligible_video_candidate(row: dict[str, Any]) -> bool:
    fields = row.get("fields", {})
    if not str(row.get("id") or "").startswith("rec"):
        return False
    if _field(row, "Media_Class") != "Video":
        return False
    if _field(row, "Asset_Role") != "Raw Footage":
        return False
    if _field(row, "Raw_Source_Eligibility") != "Eligible":
        return False
    if _field(row, "Classification_Status") != "Classified":
        return False
    if _field(row, "Asset_Status") != "Available":
        return False
    if _field(row, "Drive_Access_Status") != "Public":
        return False
    if _field(row, "Exclusion_Reasons"):
        return False
    if fields.get("Active") is False:
        return False
    if fields.get("Do_Not_Use") is True:
        return False
    if not _field(row, "Google Drive URL"):
        return False
    if _field(row, "Rights_Status") not in ALLOWED_RIGHTS:
        return False
    return True


def is_eligible_music_candidate(row: dict[str, Any]) -> bool:
    fields = row.get("fields", {})
    if not str(row.get("id") or "").startswith("rec"):
        return False
    if _field(row, "Media_Class") != "Audio":
        return False
    if _field(row, "Asset_Role") != "Music":
        return False
    if _field(row, "Raw_Source_Eligibility") != "Not Applicable":
        return False
    if _field(row, "Classification_Status") != "Classified":
        return False
    if _field(row, "Asset_Status") != "Available":
        return False
    if _field(row, "Drive_Access_Status") != "Public":
        return False
    if _field(row, "Exclusion_Reasons"):
        return False
    if fields.get("Active") is False:
        return False
    if fields.get("Do_Not_Use") is True:
        return False
    if not _field(row, "Google Drive URL"):
        return False
    if _field(row, "Rights_Status") not in ALLOWED_RIGHTS:
        return False
    return True


def candidate_summary(row: dict[str, Any], *, kind: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "media_asset_record_id": row.get("id"),
        "asset_name": _field(row, "Asset Name"),
        "google_drive_url": _field(row, "Google Drive URL"),
        "quality_score": row.get("fields", {}).get("Quality_Score"),
        "usefulness_score": row.get("fields", {}).get("Usefulness_Score"),
    }


def fetch_video_candidates(client: AirtableClient) -> list[dict[str, Any]]:
    rows = client.list_records(
        MEDIA_ASSETS_TABLE,
        view=VIDEO_CANDIDATES_VIEW,
        max_records=VIDEO_CANDIDATE_LIMIT,
    )
    eligible = [row for row in rows if is_eligible_video_candidate(row)]
    eligible.sort(
        key=lambda row: (
            -(float(row.get("fields", {}).get("Usefulness_Score") or 0)),
            -(float(row.get("fields", {}).get("Quality_Score") or 0)),
        )
    )
    return eligible


def fetch_music_candidates(client: AirtableClient) -> list[dict[str, Any]]:
    rows = client.list_records(
        MEDIA_ASSETS_TABLE,
        view=MUSIC_CANDIDATES_VIEW,
        max_records=MUSIC_CANDIDATE_LIMIT,
    )
    eligible = [row for row in rows if is_eligible_music_candidate(row)]
    eligible.sort(
        key=lambda row: (
            -(float(row.get("fields", {}).get("Usefulness_Score") or 0)),
            -(float(row.get("fields", {}).get("Quality_Score") or 0)),
        )
    )
    return eligible
