"""Clear superseded P2 media run residue — port of worker.js item4StaleMediaRunClears."""

from __future__ import annotations

from typing import Any

from render.fields import field_str


def stale_media_run_clears(parent: dict[str, Any]) -> dict[str, Any]:
    """Drop thumbnail residue only.

    A blank Voiceover_URL with a Drive file id, or a tts-lease in the
    normalization details, is a paid read that has not been committed yet.
    Clearing it made the next pass buy the same sentence again.
    """
    clears: dict[str, Any] = {}
    thumb_status = field_str(parent, "Thumbnail_Status")
    if (
        thumb_status in {"Ready", "Generated"}
        and not field_str(parent, "Thumbnail_URL")
        and field_str(parent, "Thumbnail_Google_Drive_File_ID")
    ):
        clears["Thumbnail_Google_Drive_File_ID"] = None
    return clears
