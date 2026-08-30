"""R4 processor — start Remotion render (Make 5556716)."""

from __future__ import annotations

import json
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from r4.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, MAX_RECORDS, R4_CLEAR_FIELDS
from r4.formulas import r4_exact_output_formula, r4_production_formula
from r4.render_request import choose_render_request, timing_blocks_render, voiceover_is_required, voiceover_url
from render.fields import field_str, first_linked_id
from render.remotion_client import RemotionClient
from render.settings import get_render_server_url, get_render_volumes


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

    vo = voiceover_url(output, content_item)
    if voiceover_is_required(output, content_item) and not vo:
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

    route, payload = choose_render_request(
        output,
        content_item,
        default_music=music_default,
        default_voice=voice_default,
    )

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

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], dict(R4_CLEAR_FIELDS))

    remotion = RemotionClient(render_base)
    response = remotion.post_render(payload)

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
    return {"processed": True, **preview, "job_id": response.get("jobId")}
