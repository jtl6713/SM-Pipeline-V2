"""T1 processor — Timing Engine before Remotion."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, MEDIA_ASSETS_TABLE, PLATFORM_OUTPUTS_TABLE
from ap0.public_cover import drive_file_id_from_url
from integrations.google_drive import GoogleDriveClient
from render.fields import field, field_str, first_linked_id, json_text
from render.settings import get_timing_defaults
from t1.apply import (
    analysis_payload,
    analysis_window,
    apply_timeline,
    clip_list,
    music_is_enabled,
    music_url,
    resolve_rules,
    voiceover_end_seconds,
)
from t1.client import TimingEngineClient
from t1.constants import (
    DENSE_VIDEO_TRANSITION,
    DONE_STATUSES,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    MAX_RECORDS,
    NATIVE_RENDER,
    STATUS_FAILED,
    STATUS_READY,
    STATUS_SKIPPED,
)
from t1.formulas import t1_exact_output_formula, t1_production_formula
from t1.scenes import scene_times_for_clips
from t1.slice import clips_have_video, expand_to_timeline, footage_usable_seconds


def existing_timeline_json(output: dict[str, Any]) -> str:
    return str((output.get("fields") or {}).get("Timing_Timeline_JSON") or "").strip()


def _eligible(output: dict[str, Any], *, test_run_id: str | None = None) -> bool:
    actual_test = field_str(output, "Test_Run_ID")
    expected_test = (test_run_id or "").strip()
    if expected_test:
        if actual_test != expected_test:
            return False
    elif actual_test:
        return False
    if field_str(output, "Render_Status") == NATIVE_RENDER:
        return False
    if field_str(output, "Render_Status") != "Ready for Render":
        return False
    if not field_str(output, "Composition_ID"):
        return False
    if field_str(output, "Timing_Status") in DONE_STATUSES:
        return False
    return bool(clip_list(output))


def select_outputs(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = MAX_RECORDS,
) -> list[dict[str, Any]]:
    if output_record_id:
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, output_record_id)
        return [output] if _eligible(output, test_run_id=test_run_id) else []
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=t1_production_formula(),
        max_records=max_records,
    )


def _skip_fields(reason: str) -> dict[str, Any]:
    return {
        "Timing_Status": STATUS_SKIPPED,
        "Timing_Error_Message": "",
        "Timing_Analysis_JSON": json.dumps({"skipped": reason}, separators=(",", ":")),
    }


def _music_drive_id(client: AirtableClient, output: dict[str, Any]) -> str:
    for name in ("Selected_Music_Media_Asset_ID", "Preferred_Music_Media_Asset_ID"):
        asset_id = field_str(output, name)
        if asset_id.startswith("rec"):
            asset = client.get_record(MEDIA_ASSETS_TABLE, asset_id)
            drive_id = field_str(asset, "Google Drive File ID")
            if drive_id:
                return drive_id
    return drive_file_id_from_url(music_url(output))


def _write_audio(content: bytes) -> Path:
    handle = tempfile.NamedTemporaryFile(prefix="t1-music-", suffix=".audio", delete=False)
    handle.write(content)
    handle.close()
    return Path(handle.name)


def process_one(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    client: AirtableClient | None = None,
    timing_client: TimingEngineClient | None = None,
    drive: GoogleDriveClient | None = None,
) -> dict[str, Any]:
    client = client or AirtableClient()
    rows = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=1,
    )
    if not rows:
        return {
            "processed": False,
            "reason": "no_eligible_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }
    output = rows[0]
    preview = {
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
    }
    if existing_timeline_json(output):
        if dry_run:
            return {"processed": False, "dry_run": True, "skip": "timeline_already_present", **preview}
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {"Timing_Status": STATUS_READY, "Timing_Error_Message": ""},
            typecast=True,
        )
        return {"processed": True, "reused_timeline": True, **preview}
    clips = clip_list(output)
    if not music_is_enabled(output):
        reason = "no_music"
        if dry_run:
            return {"processed": False, "dry_run": True, "skip": reason, **preview}
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], _skip_fields(reason), typecast=True)
        return {"processed": True, "skipped": reason, **preview}

    has_video = clips_have_video(clips)
    engine_url, default_rules = get_timing_defaults(client)
    rules = resolve_rules(output, default_rules, has_video=has_video)
    start, duration = analysis_window(output)
    vo_end = voiceover_end_seconds(output)
    content_item_id = first_linked_id(field(output, "Content_Item"))
    parent = client.get_record(CONTENT_ITEMS_TABLE, content_item_id) if content_item_id and not vo_end else None
    if parent and not vo_end:
        vo_end = voiceover_end_seconds(parent)
        if vo_end:
            output = {**output, "fields": {**(output.get("fields") or {}), "Voiceover_Duration_Seconds": vo_end}}
            start, duration = analysis_window(output)
    footage_capped = False
    if has_video:
        usable = footage_usable_seconds(clips)
        if usable > 0 and usable + 1e-6 < duration:
            # Prefer a shorter beat-aligned edit over recycling short clips to fill
            # the requested owner duration (freezes + repeats).
            duration = max(0.25, usable)
            rules = {**rules, "recycle": False}
            footage_capped = True
    request_body = {
        "schema_version": "timing.request.1",
        "music_start_seconds": start,
        "music_duration_seconds": duration,
        "clip_count": max(1, len(clips)),
        "fps": 30,
        "transition_rules": rules,
        "sources": ["beats", "voiceover"],
        "voiceover_end_seconds": vo_end,
        "cleanup": True,
    }
    if has_video:
        request_body["default_transition"] = DENSE_VIDEO_TRANSITION
    if dry_run:
        preview["timing_request"] = request_body
        return {"processed": False, "dry_run": True, **preview}

    audio_path: Path | None = None
    try:
        drive_id = _music_drive_id(client, output)
        if drive_id:
            content, _mime = (drive or GoogleDriveClient()).download_file(drive_id)
            audio_path = _write_audio(content)
            request_body["music_path"] = str(audio_path)
        else:
            request_body["music_url"] = music_url(output)
        response = (timing_client or TimingEngineClient(engine_url)).create_timeline(request_body)
        scenes = scene_times_for_clips(clips, drive=drive or GoogleDriveClient()) if has_video else {}
        timed = (
            expand_to_timeline(clips, response, scene_times=scenes)
            if has_video
            else apply_timeline(clips, response)
        )
        total_frames = sum(int(clip.get("durationFrames") or 0) for clip in timed)
        fields = {
            "Timing_Status": STATUS_READY,
            "Timing_Error_Message": "",
            "Timing_Rules_JSON": json_text(rules),
            "Timing_Timeline_JSON": json_text(response.get("timeline") or response),
            "Timing_Analysis_JSON": analysis_payload(response),
            "Music_BPM": response.get("bpm"),
            "Music_Duration_Seconds": duration,
            "Render_Clip_List_JSON": json_text(timed),
            "Render_Total_Frames": total_frames,
            "Selected_Clip_Count": len(timed),
        }
        timeline = response.get("timeline") if isinstance(response.get("timeline"), dict) else {}
        meta = timeline.get("metadata") if isinstance(timeline.get("metadata"), dict) else {}
        try:
            beat_end = float(meta.get("timeline_end_seconds") or 0)
        except (TypeError, ValueError):
            beat_end = 0
        if beat_end > 0 and beat_end + 0.05 < duration:
            # Drop leftover beats so the last still/clip is not longer than the others.
            fields["Music_Duration_Seconds"] = round(beat_end, 3)
            fields["Studio_Effective_Video_Duration_Seconds"] = round(beat_end, 3)
        elif footage_capped:
            # Keep Remotion from re-padding an explicit owner duration past the footage.
            fields["Studio_Effective_Video_Duration_Seconds"] = duration
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
        if content_item_id:
            client.update_record(
                CONTENT_ITEMS_TABLE,
                content_item_id,
                {"Beat_Edit_Plan_JSON": fields["Timing_Timeline_JSON"]},
            )
        return {"processed": True, **preview, "bpm": response.get("bpm")}
    except Exception as exc:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {"Timing_Status": STATUS_FAILED, "Timing_Error_Message": str(exc)[:10000]},
            typecast=True,
        )
        return {"processed": False, "reason": "timing_failed", "error": str(exc), **preview}
    finally:
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


def process_batch(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_runs: int = MAX_RECORDS,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    client = AirtableClient()
    if output_record_id:
        return [process_one(output_record_id=output_record_id, test_run_id=test_run_id, dry_run=dry_run, client=client)]
    rows = select_outputs(client, test_run_id=test_run_id, max_records=max_runs)
    return [
        process_one(output_record_id=row["id"], test_run_id=test_run_id, dry_run=dry_run, client=client)
        for row in rows
    ]
