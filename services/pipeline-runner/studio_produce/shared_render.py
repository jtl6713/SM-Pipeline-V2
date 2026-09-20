"""One Remotion render shared across equivalent 9:16 vertical short outputs."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from render.fields import field, field_str
from r5.processor import review_fields_after_successful_render
from studio_produce.constants import PLATFORM_OUTPUTS_TABLE, STORY_OUTPUT_TYPES
from studio_produce.stamp import is_native_photo

SHARED_RENDER_OUTPUT_TYPES = frozenset({"Reel", "Short", "Video Draft"})
CANONICAL_PLATFORM_ORDER = ("Instagram", "Facebook", "YouTube", "TikTok")


def is_shared_render_eligible(output: dict[str, Any]) -> bool:
    ratio = field_str(output, "Aspect_Ratio").replace("x", ":")
    if ratio != "9:16":
        return False
    output_type = field_str(output, "Studio_Output_Type") or field_str(output, "Output_Type")
    if output_type in STORY_OUTPUT_TYPES or output_type not in SHARED_RENDER_OUTPUT_TYPES:
        return False
    platform = field_str(output, "Platform")
    mapping = field_str(output, "Platform_Output_Type")
    if is_native_photo(platform, output_type, mapping):
        return False
    if field_str(output, "Render_Status") == "Native Photo Route":
        return False
    return True


def _normalized_clip_key(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()
    if isinstance(payload, list):
        normalized = []
        for clip in payload:
            if not isinstance(clip, dict):
                continue
            normalized.append(
                {
                    "url": str(clip.get("url") or clip.get("src") or "").strip(),
                    "durationFrames": int(clip.get("durationFrames") or clip.get("duration_frames") or 0),
                    "overlay": clip.get("overlay") if isinstance(clip.get("overlay"), dict) else None,
                }
            )
        return hashlib.sha256(json.dumps(normalized, sort_keys=True).encode("utf-8")).hexdigest()
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def render_equivalence_key(output: dict[str, Any]) -> str | None:
    if not is_shared_render_eligible(output):
        return None
    clip_key = _normalized_clip_key(field_str(output, "Render_Clip_List_JSON"))
    if not clip_key:
        return None
    parts = [
        clip_key,
        field_str(output, "Composition_ID"),
        str(field(output, "Render_Total_Frames") or ""),
        field_str(output, "Music_URL"),
        field_str(output, "Voiceover_URL"),
        str(field(output, "Music_Volume") or ""),
        str(field(output, "Music_Ducked_Volume") or ""),
        str(field(output, "Voiceover_Render_Volume") or ""),
        str(field(output, "Voiceover_Volume") or ""),
        str(field(output, "Music_Ducking_Enabled") or ""),
        str(field(output, "Music_Duck_Fade_Frames") or ""),
        field_str(output, "Timing_Status"),
        _normalized_clip_key(field_str(output, "Timing_Timeline_JSON")),
        field_str(output, "Creative_Render_Manifest_JSON"),
        str(field(output, "Video_Duration_Seconds_Override") or ""),
    ]
    return "|".join(parts)


def pick_canonical(outputs: list[dict[str, Any]]) -> dict[str, Any]:
    def rank(row: dict[str, Any]) -> tuple[int, str]:
        platform = field_str(row, "Platform")
        try:
            order = CANONICAL_PLATFORM_ORDER.index(platform)
        except ValueError:
            order = len(CANONICAL_PLATFORM_ORDER)
        return order, field_str(row, "Output_ID")

    return sorted(outputs, key=rank)[0]


def build_shared_render_plan(outputs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    plan: dict[str, dict[str, Any]] = {}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in outputs or []:
        if not row or not row.get("id"):
            continue
        key = render_equivalence_key(row)
        if not key:
            plan[row["id"]] = {"role": "solo", "canonical_id": row["id"], "sibling_ids": []}
            continue
        grouped.setdefault(key, []).append(row)

    for group in grouped.values():
        if len(group) < 2:
            row = group[0]
            plan[row["id"]] = {"role": "solo", "canonical_id": row["id"], "sibling_ids": []}
            continue
        canonical = pick_canonical(group)
        canonical_id = canonical["id"]
        sibling_ids = [row["id"] for row in group if row["id"] != canonical_id]
        plan[canonical_id] = {"role": "canonical", "canonical_id": canonical_id, "sibling_ids": sibling_ids}
        for sibling_id in sibling_ids:
            plan[sibling_id] = {"role": "sibling", "canonical_id": canonical_id, "sibling_ids": []}

    for row in outputs or []:
        row_id = row.get("id")
        if row_id and row_id not in plan:
            plan[row_id] = {"role": "solo", "canonical_id": row_id, "sibling_ids": []}
    return plan


def sort_outputs_for_shared_render(outputs: list[dict[str, Any]], plan: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    role_order = {"canonical": 0, "solo": 1, "sibling": 2}

    def sort_key(row: dict[str, Any]) -> tuple[int, str]:
        meta = plan.get(row.get("id") or "", {})
        return role_order.get(meta.get("role"), 1), field_str(row, "Output_ID")

    return sorted(outputs or [], key=sort_key)


def propagate_fields_from_source(source: dict[str, Any]) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "Final_File_URL": field_str(source, "Final_File_URL") or None,
        "Final_File_ID": field_str(source, "Final_File_ID") or None,
        "Output_URL": field_str(source, "Output_URL") or None,
        "Studio_Preview_URL": field_str(source, "Studio_Preview_URL") or None,
        "Studio_Preview_R2_Key": field_str(source, "Studio_Preview_R2_Key") or None,
        "Studio_Preview_Updated_At": field_str(source, "Studio_Preview_Updated_At") or None,
        "Render_Status": "Rendered",
        "Output_Status": "Ready for Review",
        "Final_File_Storage_Status": field_str(source, "Final_File_Storage_Status") or "Uploaded",
        "Final_File_Error_Message": "",
        "Remotion_Error_Message": "",
        "Remotion_Job_ID": "",
        "Remotion_Status_URL": "",
        "Remotion_Props_JSON": "",
        "Render_Server_URL": field_str(source, "Render_Server_URL") or None,
        **review_fields_after_successful_render(source),
    }
    clip_json = field_str(source, "Render_Clip_List_JSON")
    if clip_json:
        fields["Render_Clip_List_JSON"] = clip_json
    timing_json = field_str(source, "Timing_Timeline_JSON")
    if timing_json:
        fields["Timing_Timeline_JSON"] = timing_json
    timing_status = field_str(source, "Timing_Status")
    if timing_status:
        fields["Timing_Status"] = timing_status
    return fields


def propagate_render_result(client, source: dict[str, Any], sibling_ids: list[str]) -> list[str]:
    if not sibling_ids:
        return []
    fields = propagate_fields_from_source(source)
    updated: list[str] = []
    for sibling_id in sibling_ids:
        if not sibling_id or sibling_id == source.get("id"):
            continue
        client.update_record(PLATFORM_OUTPUTS_TABLE, sibling_id, fields, typecast=True)
        updated.append(sibling_id)
    return updated
