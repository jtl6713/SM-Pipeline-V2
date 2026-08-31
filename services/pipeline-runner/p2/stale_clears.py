"""Clear superseded P2 media run residue — port of worker.js item4StaleMediaRunClears."""

from __future__ import annotations

from typing import Any

from render.fields import field_str


def stale_media_run_clears(parent: dict[str, Any]) -> dict[str, Any]:
    fields = parent.get("fields") or {}
    clears: dict[str, Any] = {}
    want_voiceover = field_str(parent, "Include_Voiceover") != "No"
    if want_voiceover and not field_str(parent, "Voiceover_URL"):
        if field_str(parent, "Voiceover_Google_Drive_File_ID"):
            clears["Voiceover_Google_Drive_File_ID"] = None
        if field_str(parent, "Voiceover_Normalization_Status"):
            clears["Voiceover_Normalization_Status"] = None
        if field_str(parent, "Voiceover_Normalization_Details"):
            clears["Voiceover_Normalization_Details"] = None
        if fields.get("Voiceover_Normalized_At"):
            clears["Voiceover_Normalized_At"] = None
    thumb_status = field_str(parent, "Thumbnail_Status")
    if (
        thumb_status in {"Ready", "Generated"}
        and not field_str(parent, "Thumbnail_URL")
        and field_str(parent, "Thumbnail_Google_Drive_File_ID")
    ):
        clears["Thumbnail_Google_Drive_File_ID"] = None
    return clears
