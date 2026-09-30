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
from r2.candidates import fetch_music_candidates
from audio.voiceover_duration import (
    measured_voiceover_seconds,
    voiceover_exceeds_video,
    voiceover_exceeds_video_message,
    voiceover_tail_seconds,
)
from t1.apply import (
    analysis_payload,
    analysis_window,
    apply_timeline,
    clip_list,
    music_is_enabled,
    music_url,
    resolve_rules,
    snap_timeline_to_beats,
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


def _is_story_output(output: dict[str, Any]) -> bool:
    return field_str(output, "Format") == "Story" or field_str(output, "Studio_Output_Type") == "Story"


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


def _beat_sync_disabled(output: dict[str, Any]) -> bool:
    clips = clip_list(output)
    return bool(clips) and all(
        not bool(clip.get("beatSync", True))
        for clip in clips
        if isinstance(clip, dict)
    )


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


def _audio_duration_seconds(response: dict[str, Any]) -> float:
    """Return the actual decoded music duration, not the final detected beat.

    The timing engine's timeline_end_seconds is the last usable beat and can be
    several hundred milliseconds before EOF. Using that value as track length
    incorrectly rejects a 30.0s track whose final detected beat is at 29.559s.
    """
    timeline = response.get("timeline") if isinstance(response.get("timeline"), dict) else {}
    meta_candidates = []
    if isinstance(response.get("metadata"), dict):
        meta_candidates.append(response.get("metadata") or {})
    if isinstance(timeline.get("metadata"), dict):
        meta_candidates.append(timeline.get("metadata") or {})
    for metadata in meta_candidates:
        try:
            samples = float(metadata.get("samples") or 0)
            sr = float(metadata.get("sr") or 0)
        except (TypeError, ValueError):
            samples = sr = 0.0
        if samples > 0 and sr > 0:
            return samples / sr
    window = response.get("window") if isinstance(response.get("window"), dict) else {}
    try:
        window_duration = float(window.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        window_duration = 0.0
    if window_duration > 0:
        return window_duration
    try:
        timeline_duration = float(timeline.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        timeline_duration = 0.0
    if timeline_duration > 0:
        return timeline_duration
    metadata = timeline.get("metadata") if isinstance(timeline.get("metadata"), dict) else {}
    try:
        return max(0.0, float(metadata.get("timeline_end_seconds") or 0))
    except (TypeError, ValueError):
        return 0.0


def _asset_duration_seconds(asset: dict[str, Any]) -> float:
    try:
        value = float((asset.get("fields") or {}).get("Duration_Seconds") or 0)
    except (TypeError, ValueError):
        return 0.0
    return value if value > 0 else 0.0


def _cache_asset_duration(client: AirtableClient, asset_id: str, seconds: float) -> None:
    if not asset_id.startswith("rec") or seconds <= 0:
        return
    try:
        client.update_record(
            MEDIA_ASSETS_TABLE,
            asset_id,
            {"Duration_Seconds": round(seconds, 3)},
            typecast=True,
        )
    except Exception:
        pass


def _candidate_drive_id(asset: dict[str, Any]) -> str:
    return field_str(asset, "Google Drive File ID") or drive_file_id_from_url(field_str(asset, "Google Drive URL"))


def _candidate_music_url(asset: dict[str, Any]) -> str:
    return field_str(asset, "Google Drive URL")


def _create_timing_for_asset(
    *,
    asset: dict[str, Any] | None,
    fallback_drive_id: str,
    fallback_url: str,
    request_body: dict[str, Any],
    timing_client: TimingEngineClient,
    drive: GoogleDriveClient,
) -> tuple[dict[str, Any], float]:
    path: Path | None = None
    body = dict(request_body)
    try:
        drive_id = _candidate_drive_id(asset or {}) or fallback_drive_id
        url = _candidate_music_url(asset or {}) or fallback_url
        if drive_id:
            content, _mime = drive.download_file(drive_id)
            path = _write_audio(content)
            body["music_path"] = str(path)
            body.pop("music_url", None)
        else:
            body["music_url"] = url
            body.pop("music_path", None)
        response = timing_client.create_timeline(body)
        return response, _audio_duration_seconds(response)
    finally:
        if path and path.exists():
            path.unlink(missing_ok=True)


def _find_long_enough_music(
    *,
    client: AirtableClient,
    selected_asset_id: str,
    required_seconds: float,
    request_body: dict[str, Any],
    timing_client: TimingEngineClient,
    drive: GoogleDriveClient,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, float]:
    candidates = fetch_music_candidates(client)
    known = [
        row for row in candidates
        if row.get("id") != selected_asset_id and _asset_duration_seconds(row) + 0.05 >= required_seconds
    ]
    unknown = [
        row for row in candidates
        if row.get("id") != selected_asset_id and _asset_duration_seconds(row) <= 0
    ]
    short_known = [
        row for row in candidates
        if row.get("id") != selected_asset_id and 0 < _asset_duration_seconds(row) + 0.05 < required_seconds
    ]
    for asset in [*known, *unknown, *short_known]:
        if not _candidate_drive_id(asset) and not _candidate_music_url(asset):
            continue
        response, seconds = _create_timing_for_asset(
            asset=asset,
            fallback_drive_id="",
            fallback_url="",
            request_body=request_body,
            timing_client=timing_client,
            drive=drive,
        )
        _cache_asset_duration(client, str(asset.get("id") or ""), seconds)
        if seconds + 0.05 >= required_seconds:
            return asset, response, seconds
    return None, None, 0.0


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
    if _is_story_output(output):
        reason = "story"
        if dry_run:
            return {"processed": False, "dry_run": True, "skip": reason, **preview}
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], _skip_fields(reason), typecast=True)
        return {"processed": True, "skipped": reason, **preview}
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
    if _beat_sync_disabled(output):
        reason = "beat_sync_disabled"
        if dry_run:
            return {"processed": False, "dry_run": True, "skip": reason, **preview}
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], _skip_fields(reason), typecast=True)
        return {"processed": True, "skipped": reason, **preview}
    if not music_is_enabled(output):
        reason = "no_music"
        if dry_run:
            return {"processed": False, "dry_run": True, "skip": reason, **preview}
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], _skip_fields(reason), typecast=True)
        return {"processed": True, "skipped": reason, **preview}

    has_video = clips_have_video(clips)
    engine_url, default_rules = get_timing_defaults(client)
    rules = resolve_rules(output, default_rules, has_video=has_video)
    content_item_id = first_linked_id(field(output, "Content_Item"))
    content_item = client.get_record(CONTENT_ITEMS_TABLE, content_item_id) if content_item_id else None
    vo_end = measured_voiceover_seconds(output, content_item)
    if not vo_end:
        vo_end = voiceover_end_seconds(output) or voiceover_end_seconds(content_item or {})
    start, duration = analysis_window(output, vo_end_override=vo_end)
    tail_seconds = voiceover_tail_seconds(output, content_item)
    if vo_end and voiceover_exceeds_video(
        voiceover_seconds=vo_end,
        video_seconds=duration,
        tail_seconds=tail_seconds,
    ):
        message = voiceover_exceeds_video_message(
            voiceover_seconds=vo_end,
            video_seconds=duration,
            tail_seconds=tail_seconds,
            context="timing window",
        )
        if not dry_run:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                {"Timing_Status": STATUS_FAILED, "Timing_Error_Message": message[:10000]},
                typecast=True,
            )
        return {"processed": False, "reason": "voiceover_exceeds_video", "error": message, **preview}
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
        drive_client = drive or GoogleDriveClient()
        timing_engine = timing_client or TimingEngineClient(engine_url)
        selected_asset_id = field_str(output, "Selected_Music_Media_Asset_ID")
        selected_asset = (
            client.get_record(MEDIA_ASSETS_TABLE, selected_asset_id)
            if selected_asset_id.startswith("rec")
            else None
        )
        drive_id = _music_drive_id(client, output)
        response, selected_track_seconds = _create_timing_for_asset(
            asset=selected_asset,
            fallback_drive_id=drive_id,
            fallback_url=music_url(output),
            request_body=request_body,
            timing_client=timing_engine,
            drive=drive_client,
        )
        if selected_asset_id:
            _cache_asset_duration(client, selected_asset_id, selected_track_seconds)

        music_guard = {
            "required_seconds": round(duration, 3),
            "selected_track_seconds": round(selected_track_seconds, 3),
            "replacement": None,
            "fallback": "",
        }
        if selected_track_seconds + 0.05 < duration:
            replacement, replacement_response, replacement_seconds = _find_long_enough_music(
                client=client,
                selected_asset_id=selected_asset_id,
                required_seconds=duration,
                request_body=request_body,
                timing_client=timing_engine,
                drive=drive_client,
            )
            if replacement and replacement_response:
                replacement_id = str(replacement.get("id") or "")
                replacement_url = _candidate_music_url(replacement)
                response = replacement_response
                selected_track_seconds = replacement_seconds
                music_guard["replacement"] = {
                    "media_asset_record_id": replacement_id,
                    "asset_name": field_str(replacement, "Asset Name"),
                    "duration_seconds": round(replacement_seconds, 3),
                }
                client.update_record(
                    PLATFORM_OUTPUTS_TABLE,
                    output["id"],
                    {
                        "Selected_Music_Media_Asset_ID": replacement_id,
                        "Selected_Music_URL": replacement_url,
                        "Music_URL": replacement_url,
                    },
                    typecast=True,
                )
                fields_ref = output.setdefault("fields", {})
                fields_ref["Selected_Music_Media_Asset_ID"] = replacement_id
                fields_ref["Selected_Music_URL"] = replacement_url
                fields_ref["Music_URL"] = replacement_url
            else:
                music_guard["fallback"] = "no_qualifying_track_found"

        response = snap_timeline_to_beats(
            response,
            clip_count=max(1, len(clips)),
            fps=30,
            requested_duration=duration,
        )
        scenes = scene_times_for_clips(clips, drive=drive_client) if has_video else {}
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
            "Timing_Analysis_JSON": json.dumps(
                {**json.loads(analysis_payload(response)), "music_duration_guard": music_guard},
                separators=(",", ":"),
            ),
            "Music_BPM": response.get("bpm"),
            "Music_Duration_Seconds": duration,
            "Render_Clip_List_JSON": json_text(timed),
            "Render_Total_Frames": total_frames,
            "Selected_Clip_Count": len(timed),
        }
        audio_duration = _audio_duration_seconds(response)
        if audio_duration > 0:
            fields["Music_Duration_Seconds"] = round(audio_duration, 3)
        if audio_duration > 0 and audio_duration + 0.05 < duration:
            message = (
                f"Selected music is {audio_duration:.2f}s but the video requires {duration:.2f}s. "
                "No qualifying replacement track was found; refusing to loop short music."
            )
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                {"Timing_Status": STATUS_FAILED, "Timing_Error_Message": message[:10000]},
                typecast=True,
            )
            return {"processed": False, "reason": "music_shorter_than_video", "error": message, **preview}
        if footage_capped:
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
