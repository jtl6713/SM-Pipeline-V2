"""P020-2 processor — one Ready carousel slide voiceover (Make 5893683)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings
from p2.elevenlabs_client import synthesize_voiceover_by_id
from p2.normalizer_client import normalize_voiceover
from p0202.constants import (
    DRIVE_DOWNLOAD_URL,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PIPELINE_SETTING_NORMALIZER_URL,
    SEARCH_FORMULA,
    VOICEOVER_DRIVE_FOLDER_ID,
)
from p0202.eligibility import eligibility_reason
from render.fields import field, field_str


def _order(slide: dict[str, Any]) -> str:
    value = field(slide, "Current Order")
    if value in (None, ""):
        return "0"
    return str(value).split(".")[0]


def _pick_slide(client: AirtableClient, slide_record_id: str | None) -> dict[str, Any] | None:
    if slide_record_id:
        record = client.get_record(CAROUSEL_SLIDES_TABLE, slide_record_id)
        return record
    rows = client.list_records(
        CAROUSEL_SLIDES_TABLE,
        formula=SEARCH_FORMULA,
        max_records=1,
        sort_field="Current Order",
        sort_direction="asc",
    )
    return rows[0] if rows else None


def process_request(
    *,
    dry_run: bool = False,
    slide_record_id: str | None = None,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "source": "P020-2",
        "search_formula": SEARCH_FORMULA,
    }
    client = AirtableClient()
    slide = _pick_slide(client, slide_record_id)
    if not slide:
        return {"processed": False, "reason": "no_ready_slide", **preview}
    reason = eligibility_reason(slide)
    preview.update(
        {
            "slide_record_id": slide["id"],
            "current_order": _order(slide),
            "slide_voice_id": field_str(slide, "Slide_Voice_ID"),
            "request_id": field_str(slide, "Studio_Voice_Prep_Request_ID"),
        }
    )
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    settings = pipeline_settings(client)
    normalizer_url = str(settings.get(PIPELINE_SETTING_NORMALIZER_URL) or "").strip() or None
    order = _order(slide)
    raw_name = f"p0202_{slide['id']}_slide_{order}_voice.mp3"
    raw_mp3 = synthesize_voiceover_by_id(
        field_str(slide, "Slide_Voiceover_Text"),
        voice_id=field_str(slide, "Slide_Voice_ID"),
    )
    _norm_payload, normalized_mp3 = normalize_voiceover(
        raw_mp3,
        filename=raw_name,
        normalizer_base_url=normalizer_url,
    )
    drive = GoogleDriveClient()
    voice_file = drive.upload_and_share(
        VOICEOVER_DRIVE_FOLDER_ID,
        f"p0202_{slide['id']}_slide_{order}_voice_normalized.mp3",
        normalized_mp3,
        "audio/mpeg",
    )
    file_id = str(voice_file.get("id") or "").strip()
    if not file_id:
        raise RuntimeError("Google Drive did not return a voiceover file id")
    rechecked = _pick_slide(client, slide["id"])
    if eligibility_reason(rechecked):
        return {
            "processed": False,
            "reason": "recheck_failed",
            "drive_file_id": file_id,
            **preview,
        }
    url = DRIVE_DOWNLOAD_URL.format(file_id=file_id)
    client.update_record(
        CAROUSEL_SLIDES_TABLE,
        slide["id"],
        {
            "Slide_Voiceover_Status": "Generated",
            "Slide_Voiceover_URL": url,
        },
        typecast=True,
    )
    return {
        "processed": True,
        "drive_file_id": file_id,
        "slide_voiceover_url": url,
        **preview,
    }
