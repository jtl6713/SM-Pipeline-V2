"""P2 processor — voiceover + thumbnail generation (Make 5530955)."""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE, PRODUCTION_REQUESTS_TABLE
from audio.voiceover_duration import (
    DURATION_EPSILON_SECONDS,
    MIN_VOICEOVER_SECONDS,
    VoiceoverTooShort,
    probe_audio_duration_bytes,
    validate_voiceover_for_owner_cap,
    voiceover_tail_seconds,
)
from branding.watermark import apply_watermark_bytes, brand_watermark_bytes
from config import load_settings
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings
from p2.constants import (
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PIPELINE_SETTING_NORMALIZER_URL,
    THUMBNAIL_DRIVE_FOLDER_ID,
    VOICEOVER_DRIVE_FOLDER_ID,
)
from p2.elevenlabs_client import resolve_content_voice_id, synthesize_voiceover_by_id
from p2.formulas import (
    p2_exact_content_formula,
    recheck_silent_thumbnail,
    recheck_voiceover_and_thumbnail,
    recheck_voiceover_only,
)
from p2.normalizer_client import normalization_details, normalize_voiceover
from p2.stale_clears import stale_media_run_clears
from p2.thumbnail_client import generate_thumbnail_png
from render.fields import field_str, first_linked_id, linked_ids


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _required_video_seconds_for_voiceover(measured_seconds: float, tail_seconds: float) -> float:
    """Return a frame-aligned minimum duration that preserves narration plus tail."""
    return math.ceil((max(0.0, measured_seconds) + max(0.0, tail_seconds)) * 30.0) / 30.0


def _extend_video_duration_for_voiceover(
    client: AirtableClient,
    item: dict[str, Any],
    request: dict[str, Any] | None,
    measured_seconds: float,
) -> float:
    """Extend non-Story production targets instead of rejecting long synthesized narration."""
    required = _required_video_seconds_for_voiceover(
        measured_seconds,
        voiceover_tail_seconds(item, request),
    )

    current_content = float((item.get("fields") or {}).get("Content_Duration") or 0)
    if required > current_content:
        client.update_record(
            CONTENT_ITEMS_TABLE,
            item["id"],
            {"Content_Duration": required},
            typecast=True,
        )

    if request:
        current_request = float((request.get("fields") or {}).get("Video_Duration_Seconds") or 0)
        if required > current_request:
            client.update_record(
                PRODUCTION_REQUESTS_TABLE,
                request["id"],
                {"Video_Duration_Seconds": required},
                typecast=True,
            )

    for output_id in linked_ids((item.get("fields") or {}).get("Platform Outputs")):
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, output_id)
        output_type = (
            field_str(output, "Studio_Output_Type")
            or field_str(output, "Output_Type")
            or field_str(output, "Format")
        ).lower()
        if "story" in output_type:
            continue
        mode = field_str(output, "Studio_Effective_Voiceover_Mode").strip().lower()
        if mode in {"no", "false", "0"}:
            continue
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output_id,
            {
                "Studio_Effective_Video_Duration_Seconds": required,
                "Target_Final_Length": required,
                "Voiceover_Duration_Seconds": round(measured_seconds, 3),
                "Studio_Effective_Voiceover_Duration_Seconds": round(measured_seconds, 3),
            },
            typecast=True,
        )
    return required


def _persist_measured_timed_script(
    client: AirtableClient,
    *,
    item: dict[str, Any],
    request: dict[str, Any] | None,
    timeline: dict[str, Any],
    measured_seconds: float,
) -> None:
    """Write measured scene windows back so stamp/R4 use real TTS lengths."""
    from studio_produce.timed_script import notes_with_timed_script

    total = round(float(timeline.get("duration_seconds") or measured_seconds), 3)
    spoken = round(float(measured_seconds), 3)
    if request:
        notes = field_str(request, "Production_Notes")
        patch: dict[str, Any] = {
            "Production_Notes": notes_with_timed_script(notes, timeline),
            "Video_Duration_Seconds": total,
            "Voiceover_Duration_Seconds": spoken,
            "Voiceover_Tail_Seconds": 0,
        }
        client.update_record(PRODUCTION_REQUESTS_TABLE, request["id"], patch, typecast=True)
    client.update_record(
        CONTENT_ITEMS_TABLE,
        item["id"],
        {
            "Content_Duration": total,
            "Voiceover_Duration_Seconds": spoken,
        },
        typecast=True,
    )
    for output_id in linked_ids((item.get("fields") or {}).get("Platform Outputs")):
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, output_id)
        output_type = (
            field_str(output, "Studio_Output_Type")
            or field_str(output, "Output_Type")
            or field_str(output, "Format")
        ).lower()
        if "story" in output_type:
            continue
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output_id,
            {
                "Studio_Effective_Video_Duration_Seconds": total,
                "Target_Final_Length": total,
                "Voiceover_Duration_Seconds": spoken,
                "Studio_Effective_Voiceover_Duration_Seconds": spoken,
                "Studio_Effective_Voiceover_Tail_Seconds": 0,
            },
            typecast=True,
        )


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
    if str(settings.get("stage_backend_p3") or "python") == "disabled":
        return {"backend": "python", "source": source, "skipped": "p3_disabled"}
    from p3.processor import process_request as process_p3

    result = process_p3(
        content_item_record_id=content_record_id,
        test_run_id=test_run_id or None,
    )
    return {"backend": "python", "source": source, **result}


def _voiceover_fields_ready(item: dict[str, Any]) -> bool:
    return (
        field_str(item, "Content_Status") == "Ready for Voiceover"
        and field_str(item, "Script_Status") == "Generated"
        and field_str(item, "Voiceover_Status") == "Ready"
        and bool(field_str(item, "Voiceover_Script"))
    )


def item_wants_ai_thumbnail(item: dict[str, Any]) -> bool:
    if field_str(item, "Include_Thumbnail") == "No":
        return False
    if field_str(item, "Thumbnail_URL"):
        return False
    return bool(field_str(item, "Thumbnail_Prompt"))


def can_commit_generated_media(item: dict[str, Any], *, generated_thumb: bool) -> bool:
    if field_str(item, "Do_Not_Produce") in {"1", "true", "True", "checked"}:
        return False
    if field_str(item, "Voiceover_URL"):
        return False
    if generated_thumb and field_str(item, "Thumbnail_URL"):
        return False
    return True


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

    request = None
    request_id = first_linked_id(item.get("fields", {}).get("Production Requests"))
    if request_id:
        request = client.get_record(PRODUCTION_REQUESTS_TABLE, request_id)
    from p2.timed_script_voiceover import synthesize_timed_script_voiceover
    from studio_produce.timed_script import (
        speech_speed_for_timeline,
        timed_script_from_request,
    )

    timeline = timed_script_from_request(request)
    measured_timeline = None
    segment_seconds: list[float] = []
    voice_id = resolve_content_voice_id(item)
    spoken_script = field_str(item, "Voiceover_Script")
    from p2.voiceover_floor import lengthen_voiceover_script, speak_until_minimum

    if timeline and timeline.get("segments"):
        # Per-scene TTS + measured durations. Import clocks are hints only —
        # still N must last as long as scene N speech (NYC CI 290: import 20s
        # while TTS spoke ~13s left ~15s of silence when stills stayed locked).
        # The spoken total still cannot be under 4 seconds.
        raw_mp3, measured_timeline, segment_seconds = synthesize_timed_script_voiceover(
            timeline,
            voice_id=voice_id,
            synthesize=synthesize_voiceover_by_id,
        )
        norm_payload, normalized_mp3 = normalize_voiceover(
            raw_mp3,
            filename=f"{content_id}_voice.mp3",
            normalizer_base_url=normalizer_url,
        )
        measured_seconds = probe_audio_duration_bytes(normalized_mp3)
    else:
        speed = speech_speed_for_timeline(timeline)

        def _synthesize(script: str) -> bytes:
            return synthesize_voiceover_by_id(script, voice_id=voice_id, speed=speed)

        def _normalize(raw: bytes):
            return normalize_voiceover(
                raw,
                filename=f"{content_id}_voice.mp3",
                normalizer_base_url=normalizer_url,
            )

        normalized_mp3, measured_seconds, spoken_script, norm_payload = speak_until_minimum(
            spoken_script,
            synthesize=_synthesize,
            normalize=_normalize,
            probe=probe_audio_duration_bytes,
            lengthen=lengthen_voiceover_script,
        )
    if measured_seconds + DURATION_EPSILON_SECONDS < MIN_VOICEOVER_SECONDS:
        raise VoiceoverTooShort(
            f"Voiceover is {measured_seconds:.3f}s. Spoken audio must be at least "
            f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    if measured_timeline and segment_seconds:
        # Loudness normalization can nudge total length by a few ms. Scale the
        # measured scene windows so still boundaries still sum to the final file.
        raw_sum = sum(segment_seconds) or measured_seconds
        scale = measured_seconds / raw_sum if raw_sum > 0 else 1.0
        scaled = [max(1.0, seconds * scale) for seconds in segment_seconds]
        drift = measured_seconds - sum(scaled)
        scaled[-1] = max(1.0, scaled[-1] + drift)
        from studio_produce.timed_script import apply_measured_durations

        measured_timeline = apply_measured_durations(measured_timeline or timeline, scaled) or measured_timeline
        _persist_measured_timed_script(
            client,
            item=item,
            request=request,
            timeline=measured_timeline,
            measured_seconds=measured_seconds,
        )
        scene_detail = ",".join(f"{seconds:.2f}" for seconds in scaled)
        norm_details_extra = f" | Timed-script VO-driven scenes [{scene_detail}]s"
    else:
        norm_details_extra = ""
        if not timeline:
            cap_error = validate_voiceover_for_owner_cap(
                voiceover_seconds=measured_seconds,
                content_item=item,
                request=request,
            )
            if cap_error:
                # The synthesized file is the truth. Do not fail production because speech
                # ran longer than the planning target; extend every non-Story video target
                # to fit the narration plus the configured tail.
                _extend_video_duration_for_voiceover(client, item, request, measured_seconds)
    voice_file = drive.upload_and_share(
        VOICEOVER_DRIVE_FOLDER_ID,
        f"{content_id}_voice_normalized.mp3",
        normalized_mp3,
        "audio/mpeg",
    )
    norm_details = (
        f"{normalization_details(norm_payload)} | Audio duration {measured_seconds:.3f}s"
        f"{norm_details_extra}"
    )
    sent_at = _now_iso()
    want_thumbnail = item_wants_ai_thumbnail(item)

    thumb_file: dict[str, Any] | None = None
    if want_thumbnail:
        png_bytes = _branded_thumbnail(field_str(item, "Thumbnail_Prompt"))
        thumb_file = drive.upload_and_share(
            THUMBNAIL_DRIVE_FOLDER_ID,
            f"{content_id}_thumb.png",
            png_bytes,
            "image/png",
        )
    latest = client.get_record(CONTENT_ITEMS_TABLE, item["id"])
    if not can_commit_generated_media(latest, generated_thumb=want_thumbnail):
        return {
            **preview,
            "reason": "voiceover_thumbnail_recheck_failed" if want_thumbnail else "voiceover_only_recheck_failed",
            "voiceover_drive_file_id": voice_file.get("id"),
            "thumbnail_drive_file_id": (thumb_file or {}).get("id"),
        }
    if want_thumbnail:
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
            "Voiceover_Duration_Seconds": round(measured_seconds, 3),
        }
        if spoken_script and spoken_script != field_str(item, "Voiceover_Script"):
            update_fields["Voiceover_Script"] = spoken_script
        p3_source = "P-series daisy chain (python)"
    else:
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
            "Voiceover_Duration_Seconds": round(measured_seconds, 3),
        }
        if spoken_script and spoken_script != field_str(item, "Voiceover_Script"):
            update_fields["Voiceover_Script"] = spoken_script
        p3_source = "P2 optional-thumbnail branch (python)"

    client.update_record(CONTENT_ITEMS_TABLE, latest["id"], update_fields, typecast=True)
    p3 = _trigger_p3(content_record_id=latest["id"], test_run_id=test_run, source=p3_source)
    return {
        "processed": True,
        "route": "voiceover_thumbnail" if want_thumbnail else "voiceover_only",
        "voiceover_drive_file_id": voice_file.get("id"),
        "thumbnail_drive_file_id": (thumb_file or {}).get("id"),
        "p3_trigger": p3,
        **_preview(item, route=route),
    }
