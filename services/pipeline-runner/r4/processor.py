"""R4 processor — start Remotion render (Make 5556716)."""

from __future__ import annotations

import json
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import (
    CONTENT_ITEMS_TABLE,
    MEDIA_ASSETS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
)
from branding.watermark import brand_watermark_url
from r4.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, MAX_RECORDS, R4_CLEAR_FIELDS
from r4.formulas import r4_exact_output_formula, r4_production_formula
from audio.voiceover_duration import (
    extend_render_clips_to_cover_voiceover,
    validate_voiceover_for_render,
    voiceover_is_disabled,
)
from r4.render_request import choose_render_request, studio_visual_integrity_error, timing_blocks_render, voiceover_is_required, voiceover_url
from render.fields import field, field_str, first_linked_id
from render.remotion_client import RemotionClient
from render.settings import get_render_server_url, get_render_volumes
from render.studio_revision import manifest_studio_revision, render_package_revision_error, studio_revision_error


STUDIO_STREAM_PREFIX = "/api/media-assets/"
DRIVE_DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={file_id}"


def _studio_stream_media_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text.startswith(STUDIO_STREAM_PREFIX):
        return ""
    tail = text[len(STUDIO_STREAM_PREFIX):]
    record_id = tail.split("/", 1)[0].strip()
    return record_id if record_id.startswith("rec") else ""


def repair_studio_stream_render_sources(
    client: AirtableClient,
    output: dict[str, Any],
) -> tuple[int, list[str]]:
    """Replace Studio-relative stream URLs before sending a render to Remotion.

    Studio preview routes such as /api/media-assets/rec.../stream are browser-local
    and cannot be fetched by the remote Remotion renderer. Legacy/stale manifests
    can still contain them even though current stamping emits absolute sources.
    Resolve those clips through Media Assets' Google Drive authority and persist
    the repaired manifest so retries do not repeat the same bad payload.
    """
    raw = (output.get("fields") or {}).get("Render_Clip_List_JSON")
    if not str(raw or "").strip():
        return 0, []
    try:
        clips = json.loads(str(raw))
    except json.JSONDecodeError:
        return 0, []
    if not isinstance(clips, list):
        return 0, []

    asset_cache: dict[str, dict[str, Any]] = {}
    repaired = 0
    unresolved: list[str] = []
    for clip in clips:
        if not isinstance(clip, dict):
            continue
        url = str(clip.get("url") or "").strip()
        src = str(clip.get("src") or "").strip()
        if not (url.startswith(STUDIO_STREAM_PREFIX) or src.startswith(STUDIO_STREAM_PREFIX)):
            continue
        media_id = str(
            clip.get("mediaAssetRecordId")
            or clip.get("media_asset_record_id")
            or _studio_stream_media_id(url)
            or _studio_stream_media_id(src)
            or ""
        ).strip()
        if not media_id.startswith("rec"):
            unresolved.append(media_id or url or src or "unknown")
            continue
        asset = asset_cache.get(media_id)
        if asset is None:
            try:
                asset = client.get_record(MEDIA_ASSETS_TABLE, media_id)
            except Exception:
                asset = {}
            asset_cache[media_id] = asset
        drive_id = field_str(asset, "Google Drive File ID")
        drive_url = field_str(asset, "Google Drive URL")
        if not drive_url and drive_id:
            drive_url = DRIVE_DOWNLOAD_URL.format(file_id=drive_id)
        if not drive_url.startswith(("http://", "https://")):
            unresolved.append(media_id)
            continue
        clip["url"] = drive_url
        clip["src"] = drive_url
        if drive_id and not str(clip.get("googleDriveFileId") or "").strip():
            clip["googleDriveFileId"] = drive_id
        repaired += 1

    if repaired:
        rendered = json.dumps(clips, separators=(",", ":"))
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {"Render_Clip_List_JSON": rendered},
        )
        output.setdefault("fields", {})["Render_Clip_List_JSON"] = rendered
    return repaired, unresolved


def render_watermark_url(
    client: AirtableClient,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
) -> str:
    # Remotion photo renders always burn the official Chicago Shining logo
    # top-left. Library still burn-in stays profile-gated elsewhere.
    _ = output, content_item
    return brand_watermark_url(client)


def _eligible_exact_output(
    output: dict[str, Any],
    *,
    test_run_id: str | None = None,
) -> bool:
    actual_test = field_str(output, "Test_Run_ID")
    expected_test = (test_run_id or "").strip()
    if expected_test:
        if actual_test != expected_test:
            return False
    elif actual_test:
        return False
    # A stale Worker queue snapshot must never relaunch a saved or completed
    # Remotion job, even if a stale admission changed Render_Status to Ready.
    if field_str(output, "Remotion_Job_ID") or field_str(output, "Final_File_URL"):
        return False
    if field_str(output, "Render_Status") != "Ready for Render":
        return False
    if not field_str(output, "Composition_ID"):
        return False
    if not field_str(output, "Output_Filename"):
        return False
    raw_clips = (output.get("fields") or {}).get("Render_Clip_List_JSON")
    if not str(raw_clips or "").strip():
        return False
    try:
        frames = float((output.get("fields") or {}).get("Render_Total_Frames") or 0)
    except (TypeError, ValueError):
        return False
    return frames > 0


def select_output(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
) -> dict[str, Any] | None:
    if output_record_id:
        # Fetch by ID. Do not re-run the formula that compares Render_Clip_List_JSON;
        # Airtable 422s when that long-text field is huge.
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, output_record_id)
        return output if _eligible_exact_output(output, test_run_id=test_run_id) else None
    rows = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=r4_production_formula(),
        max_records=MAX_RECORDS,
    )
    return rows[0] if rows else None


def render_snapshot_identity(output: dict[str, Any]) -> tuple[str, ...]:
    """Immutable R4 input identity for the exact render package we are launching."""
    fields = output.get("fields") or {}
    names = (
        "Creative_Render_Manifest_JSON",
        "Render_Clip_List_JSON",
        "Render_Total_Frames",
        "Composition_ID",
        "Output_Filename",
        "Music_URL",
        "Voiceover_URL",
        "Voiceover_Render_Volume",
        "Music_Volume",
        "Music_Ducked_Volume",
        "Music_Ducking_Enabled",
        "Music_Duck_Fade_Frames",
    )
    return tuple(str(fields.get(name) if fields.get(name) is not None else "") for name in names)


def render_snapshot_error(
    expected_snapshot: tuple[str, ...],
    expected_revision: dict[str, Any] | None,
    current: dict[str, Any],
) -> str | None:
    revision_error = studio_revision_error(expected_revision, current)
    if revision_error:
        return revision_error
    if render_snapshot_identity(current) != expected_snapshot:
        return "R4 render package changed after this render request was prepared; launch the current package instead."
    return None


def stale_r4_launch_cleanup_fields(
    current: dict[str, Any],
    *,
    launched_job_id: str,
    error: str,
) -> dict[str, Any]:
    """Clear only this stale launch; never overwrite a newer R4 job."""
    if not launched_job_id or field_str(current, "Remotion_Job_ID") != launched_job_id:
        return {}
    return {
        "Remotion_Job_ID": "",
        "Remotion_Status_URL": "",
        "Remotion_Props_JSON": "",
        "Render_Server_URL": "",
        "Render_Status": "Ready for Render",
        "Remotion_Error_Message": error[:10000],
    }


def process_one(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    output = select_output(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
    )
    if not output:
        return {
            "processed": False,
            "reason": "no_eligible_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    repaired_sources, unresolved_sources = repair_studio_stream_render_sources(client, output)
    if unresolved_sources:
        message = (
            "Remotion source repair could not resolve Studio-only media URL(s): "
            + ", ".join(unresolved_sources[:10])
        )
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Render_Status": "Blocked",
                "Remotion_Error_Message": message[:10000],
            },
            typecast=True,
        )
        return {
            "processed": False,
            "reason": "unfetchable_render_source",
            "error": message,
            "repaired_sources": repaired_sources,
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
            "make_scenario_name": MAKE_SCENARIO_NAME,
        }

    music_default, voice_default = get_render_volumes(client)
    render_base = get_render_server_url(client)

    content_item = None
    content_item_id = first_linked_id(output.get("fields", {}).get("Content_Item"))
    if content_item_id:
        content_item = client.get_record(CONTENT_ITEMS_TABLE, content_item_id)

    if timing_blocks_render(output):
        return {
            "processed": False,
            "reason": "waiting_for_timing",
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
            "make_scenario_name": MAKE_SCENARIO_NAME,
        }

    revision_error = render_package_revision_error(output)
    if revision_error:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Render_Status": "Blocked",
                "Remotion_Error_Message": revision_error[:10000],
            },
            typecast=True,
        )
        return {
            "processed": False,
            "reason": "stale_render_package",
            "error": revision_error,
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
            "make_scenario_name": MAKE_SCENARIO_NAME,
        }

    voiceover_required = voiceover_is_required(output, content_item)
    voiceover_disabled = voiceover_is_disabled(output, content_item)
    vo = "" if voiceover_disabled else voiceover_url(output, content_item)
    if voiceover_required and not vo:
        return {
            "processed": False,
            "reason": "waiting_for_voiceover",
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
            "make_scenario_name": MAKE_SCENARIO_NAME,
        }
    if vo and not field_str(output, "Voiceover_URL"):
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], {"Voiceover_URL": vo})
        output.setdefault("fields", {})["Voiceover_URL"] = vo

    vo_fit_error = validate_voiceover_for_render(output, content_item) if vo else None
    if vo_fit_error:
        # Photo-sequence stamp can undershoot by a few frames when VO×fps was
        # rounded (Output 2156). Extend the last clip to cover measured speech
        # instead of parking Blocked forever.
        extended = extend_render_clips_to_cover_voiceover(output, content_item)
        if extended:
            client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], extended, typecast=True)
            output.setdefault("fields", {}).update(extended)
            vo_fit_error = validate_voiceover_for_render(output, content_item)
        if vo_fit_error:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                {
                    "Render_Status": "Blocked",
                    "Remotion_Error_Message": vo_fit_error[:10000],
                },
                typecast=True,
            )
            return {
                "processed": False,
                "reason": "voiceover_exceeds_video",
                "error": vo_fit_error,
                "output_record_id": output["id"],
                "output_id": field_str(output, "Output_ID"),
                "make_scenario_id": MAKE_SCENARIO_ID,
                "make_scenario_name": MAKE_SCENARIO_NAME,
            }

    route, payload = choose_render_request(
        output,
        content_item,
        default_music=music_default,
        default_voice=voice_default,
    )
    integrity_error = studio_visual_integrity_error(output, payload)
    if integrity_error:
        # This must run before clearing artifacts or calling Remotion. Preserve
        # the original output and block further automatic retries of bad inputs.
        if not dry_run:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                {
                    "Render_Status": "Blocked",
                    "Remotion_Error_Message": integrity_error[:10000],
                },
                typecast=True,
            )
        return {
            "processed": False,
            "reason": "studio_visual_integrity_blocked",
            "error": integrity_error,
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
            "make_scenario_name": MAKE_SCENARIO_NAME,
        }

    expected_revision = manifest_studio_revision(output)
    expected_snapshot = render_snapshot_identity(output)
    watermark_url = render_watermark_url(client, output, content_item)
    if watermark_url:
        payload["watermarkUrl"] = watermark_url
        payload["watermarkRequired"] = True

    preview = {
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "route": route,
        "render_server": render_base,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
    }

    if dry_run:
        preview["render_request"] = payload
        return {"processed": False, "dry_run": True, **preview}

    remotion = RemotionClient(render_base)
    # Single Remotion slot: if Chrome is already busy, park this row in the
    # waiting queue instead of accepting another job that only looks like Rendering.
    if remotion.slot_busy():
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Render_Status": "Waiting in Render Queue",
                "Remotion_Job_ID": "",
                "Remotion_Status_URL": "",
                "Remotion_Error_Message": "",
                "Final_File_Error_Message": "",
            },
            typecast=True,
        )
        return {
            "processed": False,
            "reason": "waiting_for_remotion_slot",
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
            "make_scenario_name": MAKE_SCENARIO_NAME,
        }

    # The payload above is an immutable snapshot. Re-read immediately before
    # clearing old artifacts and again before launch so a concurrent Studio edit
    # cannot cause R4 to start an older visual/script revision.
    current = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
    # Re-check the irreversible launch guard immediately before clearing prior
    # artifacts. A final file or existing job is authoritative, irrespective
    # of a concurrent Worker status-only Ready patch.
    if field_str(current, "Remotion_Job_ID") or field_str(current, "Final_File_URL"):
        return {
            "processed": False,
            "reason": "render_already_started",
            "output_record_id": output["id"],
            "output_id": field_str(output, "Output_ID"),
            "make_scenario_id": MAKE_SCENARIO_ID,
        }
    snapshot_error = render_snapshot_error(expected_snapshot, expected_revision, current)
    if snapshot_error:
        return {
            "processed": False,
            "reason": "stale_render_snapshot",
            "error": snapshot_error,
            **preview,
        }

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], dict(R4_CLEAR_FIELDS))

    current = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
    snapshot_error = render_snapshot_error(expected_snapshot, expected_revision, current)
    if snapshot_error:
        return {
            "processed": False,
            "reason": "stale_render_snapshot",
            "error": snapshot_error,
            **preview,
        }

    response = remotion.post_render(payload)
    launched_job_id = str(response.get("jobId") or "").strip()

    # A creative edit or a competing R4 launch may win while Remotion is
    # accepting the request. Never stamp this stale job onto the output.
    current = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
    snapshot_error = render_snapshot_error(expected_snapshot, expected_revision, current)
    current_job_id = field_str(current, "Remotion_Job_ID")
    if snapshot_error or current_job_id:
        error = snapshot_error or (
            f"R4 render launch superseded by job {current_job_id}; discarded job {launched_job_id}."
        )
        remotion.cleanup_job(launched_job_id, filename=field_str(output, "Output_Filename") or None)
        return {
            "processed": False,
            "reason": "stale_render_launch" if snapshot_error else "render_already_started",
            "error": error,
            **preview,
        }

    save_fields: dict[str, Any] = {
        "Remotion_Job_ID": response.get("jobId"),
        "Remotion_Status_URL": response.get("statusUrl"),
        "Render_Server_URL": response.get("renderUrl") or render_base,
        "Remotion_Props_JSON": json.dumps(payload, separators=(",", ":")),
        "Render_Status": "Rendering",
        "Remotion_Error_Message": "",
        "Final_File_Error_Message": "",
    }
    if route == "p020_manifest":
        music_vol = payload.get("music", {}).get("volume")
        save_fields["Music_Volume"] = music_vol
        save_fields["Music_Ducking_Enabled"] = payload.get("music", {}).get("duckingEnabled", True)
        save_fields["Music_Ducked_Volume"] = payload.get("music", {}).get("duckingMultiplier", 0) * (
            music_vol or 0
        )
        save_fields["Music_Duck_Fade_Frames"] = payload.get("music", {}).get("duckFadeFrames")
    elif music_default:
        save_fields["Music_Volume"] = payload.get("music", {}).get("volume", music_default)

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], save_fields)

    # Close the final check/write race. If a Studio edit landed after the last
    # re-read, discard only the job identity written by this launch. If a newer
    # R4 job already replaced it, leave that newer job untouched.
    committed = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
    post_write_error = render_snapshot_error(expected_snapshot, expected_revision, committed)
    if post_write_error:
        cleanup = stale_r4_launch_cleanup_fields(
            committed,
            launched_job_id=launched_job_id,
            error=post_write_error,
        )
        if cleanup:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                cleanup,
                typecast=True,
            )
        remotion.cleanup_job(launched_job_id, filename=field_str(output, "Output_Filename") or None)
        return {
            "processed": False,
            "reason": "stale_render_launch_post_write",
            "error": post_write_error,
            "stale_job_compensated": bool(cleanup),
            **preview,
        }

    return {"processed": True, **preview, "job_id": response.get("jobId")}
