"""P2 processor — voiceover + thumbnail generation (Make 5530955)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE
from branding.watermark import apply_watermark_bytes, brand_watermark_bytes
from config import load_settings
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings
from p2.constants import (
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    P3_WEBHOOK_URL,
    PIPELINE_SETTING_NORMALIZER_URL,
    THUMBNAIL_DRIVE_FOLDER_ID,
    VOICEOVER_DRIVE_FOLDER_ID,
)
from p2.elevenlabs_client import synthesize_voiceover
from p2.formulas import (
    p2_exact_content_formula,
    recheck_silent_thumbnail,
    recheck_voiceover_and_thumbnail,
    recheck_voiceover_only,
)
from p2.normalizer_client import normalization_details, normalize_voiceover
from p2.stale_clears import stale_media_run_clears
from p2.thumbnail_client import generate_thumbnail_png
from render.fields import field_str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_content_item(
    client: AirtableClient,
    *,
    content_item_record_id: str,
    test_run_id: str | None,
) -> dict[str, Any] | None:
    formula = p2_exact_content_formula(content_item_record_id, test_run_id or "")
    rows = client.list_records(CONTENT_ITEMS_TABLE, formula=formula, max_records=1)
    return rows[0] if rows else None


def _recheck(client: AirtableClient, formula: str) -> dict[str, Any] | None:
    rows = client.list_records(CONTENT_ITEMS_TABLE, formula=formula, max_records=1)
    return rows[0] if rows else None


def _trigger_p3(*, content_record_id: str, test_run_id: str, source: str) -> dict[str, Any]:
    settings = load_settings()
    if str(settings.get("stage_backend_p3") or "make") == "python":
        from p3.processor import process_request as process_p3

        result = process_p3(
            content_item_record_id=content_record_id,
            test_run_id=test_run_id or None,
        )
        return {"backend": "python", "source": source, **result}

    webhook_url = str(settings.get("p3_webhook_url") or P3_WEBHOOK_URL).strip()
    response = requests.post(
        webhook_url,
        headers={"Content-Type": "application/json", "Accept": "text/plain, application/json"},
        json={
            "source": source,
            "target": "P3",
            "content_record_id": content_record_id,
            "test_run_id": test_run_id,
            "requested_at": _now_iso(),
        },
        timeout=40,
    )
    return {"backend": "make", "status_code": response.status_code, "body": response.text[:300]}


def _voiceover_fields_ready(item: dict[str, Any]) -> bool:
    return (
        field_str(item, "Content_Status") == "Ready for Voiceover"
        and field_str(item, "Script_Status") == "Generated"
        and field_str(item, "Voiceover_Status") == "Ready"
        and bool(field_str(item, "Voiceover_Script"))
    )


def _route_for_item(item: dict[str, Any]) -> str | None:
    if _voiceover_fields_ready(item):
        return "voiceover"
    if (
        field_str(item, "Thumbnail_Status") == "Ready"
        and field_str(item, "Thumbnail_Prompt")
        and not field_str(item, "Thumbnail_URL")
        and field_str(item, "Include_Voiceover") == "No"
    ):
        return "silent_thumbnail"
    return None


def _preview(item: dict[str, Any], *, route: str | None) -> dict[str, Any]:
    return {
        "content_item_record_id": item["id"],
        "content_id": field_str(item, "Content_ID"),
        "route": route,
        "content_status": field_str(item, "Content_Status"),
        "voiceover_status": field_str(item, "Voiceover_Status"),
        "thumbnail_status": field_str(item, "Thumbnail_Status"),
        "include_voiceover": field_str(item, "Include_Voiceover"),
    }


def process_request(
    *,
    content_item_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not content_item_record_id:
        return {
            "processed": False,
            "reason": "missing_content_item_record_id",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    client = AirtableClient()
    item = _load_content_item(client, content_item_record_id=content_item_record_id, test_run_id=test_run_id)
    if not item:
        return {
            "processed": False,
            "reason": "content_item_not_found",
            "content_item_record_id": content_item_record_id,
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    clears = stale_media_run_clears(item)
    if clears and not dry_run:
        client.update_record(CONTENT_ITEMS_TABLE, item["id"], clears, typecast=True)
        item = client.get_record(CONTENT_ITEMS_TABLE, item["id"])

    settings_store = pipeline_settings(client)
    normalizer_url = settings_store.get(PIPELINE_SETTING_NORMALIZER_URL)
    route = _route_for_item(item)
    if route == "voiceover" and not normalizer_url:
        return {
            "processed": False,
            "reason": "missing_voiceover_normalizer_url",
            "make_scenario_id": MAKE_SCENARIO_ID,
            **_preview(item, route=route),
        }
    if not route:
        return {
            "processed": False,
            "reason": "no_eligible_p2_route",
            "make_scenario_id": MAKE_SCENARIO_ID,
            **_preview(item, route=None),
        }

    preview = {
        "processed": False,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        **_preview(item, route=route),
    }
    if dry_run:
        return {"dry_run": True, **preview}

    drive = GoogleDriveClient()
    content_id = field_str(item, "Content_ID") or item["id"]
    test_run = field_str(item, "Test_Run_ID")

    def _branded_thumbnail(prompt: str, *, aspect_ratio: str = "9:16") -> bytes:
        raw = generate_thumbnail_png(prompt, aspect_ratio=aspect_ratio)
        return apply_watermark_bytes(raw, brand_watermark_bytes(client), output_format="png")

    if route == "silent_thumbnail":
        png_bytes = _branded_thumbnail(field_str(item, "Thumbnail_Prompt"))
        thumb_file = drive.upload_and_share(
            THUMBNAIL_DRIVE_FOLDER_ID,
            f"{content_id}_thumb.png",
            png_bytes,
            "image/png",
        )
        rechecked = _recheck(client, recheck_silent_thumbnail(item["id"]))
        if not rechecked:
            return {
                **preview,
                "reason": "silent_thumbnail_recheck_failed",
                "thumbnail_drive_file_id": thumb_file.get("id"),
            }
        client.update_record(
            CONTENT_ITEMS_TABLE,
            rechecked["id"],
            {
                "Thumbnail_URL": thumb_file.get("webContentLink"),
                "Content_Status": "Thumbnail Ready",
                "Thumbnail_Status": "Generated",
                "Thumbnail_Google_Drive_File_ID": thumb_file.get("id"),
            },
            typecast=True,
        )
        p3 = _trigger_p3(
            content_record_id=rechecked["id"],
            test_run_id=test_run,
            source="P2 silent-thumbnail branch (python)",
        )
        return {
            "processed": True,
            "route": "silent_thumbnail",
            "thumbnail_drive_file_id": thumb_file.get("id"),
            "p3_trigger": p3,
            **_preview(item, route=route),
        }

    raw_mp3 = synthesize_voiceover(field_str(item, "Voiceover_Script"), voice_name=field_str(item, "Voice"))
    norm_payload, normalized_mp3 = normalize_voiceover(
        raw_mp3,
        filename=f"{content_id}_voice.mp3",
        normalizer_base_url=normalizer_url,
    )
    voice_file = drive.upload_and_share(
        VOICEOVER_DRIVE_FOLDER_ID,
        f"{content_id}_voice_normalized.mp3",
        normalized_mp3,
        "audio/mpeg",
    )
    norm_details = normalization_details(norm_payload)
    sent_at = _now_iso()
    want_thumbnail = field_str(item, "Thumbnail_Status") == "Ready" and bool(field_str(item, "Thumbnail_Prompt"))

    thumb_file: dict[str, Any] | None = None
    if want_thumbnail:
        png_bytes = _branded_thumbnail(field_str(item, "Thumbnail_Prompt"))
        thumb_file = drive.upload_and_share(
            THUMBNAIL_DRIVE_FOLDER_ID,
            f"{content_id}_thumb.png",
            png_bytes,
            "image/png",
        )
        rechecked = _recheck(client, recheck_voiceover_and_thumbnail(item["id"]))
        if not rechecked:
            return {
                **preview,
                "reason": "voiceover_thumbnail_recheck_failed",
                "voiceover_drive_file_id": voice_file.get("id"),
                "thumbnail_drive_file_id": thumb_file.get("id"),
            }
        update_fields = {
            "Thumbnail_URL": thumb_file.get("webContentLink"),
            "Voiceover_URL": voice_file.get("webContentLink"),
            "Content_Status": "Thumbnail Ready",
            "Thumbnail_Status": "Generated",
            "Voiceover_Status": "Generated",
            "Voiceover_Normalized_At": sent_at,
            "Voiceover_Render_Volume": "1",
            "Thumbnail_Google_Drive_File_ID": thumb_file.get("id"),
            "Voiceover_Google_Drive_File_ID": voice_file.get("id"),
            "Voiceover_Normalization_Status": "Normalized",
            "Voiceover_Normalization_Details": norm_details,
        }
        p3_source = "P-series daisy chain (python)"
    else:
        rechecked = _recheck(client, recheck_voiceover_only(item["id"]))
        if not rechecked:
            return {
                **preview,
                "reason": "voiceover_only_recheck_failed",
                "voiceover_drive_file_id": voice_file.get("id"),
            }
        update_fields = {
            "Voiceover_URL": voice_file.get("webContentLink"),
            "Content_Status": "Thumbnail Ready",
            "Thumbnail_Status": "Not Needed",
            "Voiceover_Status": "Generated",
            "Voiceover_Normalized_At": sent_at,
            "Voiceover_Render_Volume": "1",
            "Voiceover_Google_Drive_File_ID": voice_file.get("id"),
            "Voiceover_Normalization_Status": "Normalized",
            "Voiceover_Normalization_Details": norm_details,
        }
        p3_source = "P2 optional-thumbnail branch (python)"

    client.update_record(CONTENT_ITEMS_TABLE, rechecked["id"], update_fields, typecast=True)
    p3 = _trigger_p3(content_record_id=rechecked["id"], test_run_id=test_run, source=p3_source)
    return {
        "processed": True,
        "route": "voiceover_thumbnail" if want_thumbnail else "voiceover_only",
        "voiceover_drive_file_id": voice_file.get("id"),
        "thumbnail_drive_file_id": (thumb_file or {}).get("id"),
        "p3_trigger": p3,
        **_preview(item, route=route),
    }
