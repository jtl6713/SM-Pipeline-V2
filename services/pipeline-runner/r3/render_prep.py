from __future__ import annotations

from typing import Any

from render.fields import field_str, json_text


def resolve_composition_id(existing: str, render_prep: dict[str, Any]) -> str:
    if existing:
        return existing
    clip1 = str(render_prep.get("compatibility_clip_1_url") or "").lower()
    if ".jpg" in clip1:
        return "ChicagoShiningPhotoSequence"
    return str(render_prep.get("composition_id") or "").strip()


def build_update_fields(
    output: dict[str, Any],
    package: dict[str, Any],
    content_item: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if str(package.get("selection_status") or "") != "Selected":
        return None
    render_prep = package.get("render_prep") or {}
    if str(render_prep.get("render_status") or "") != "Ready for Render":
        return None

    validation_passed = render_prep.get("validation_passed")
    remotion_error = ""
    if validation_passed is False:
        remotion_error = str(render_prep.get("validation_errors_text") or "")

    fields: dict[str, Any] = {
        "Selected_Asset_Notes": render_prep.get("prep_notes") or "",
        "Title_Text": render_prep.get("title_text") or "",
        "Render_Clip_List_JSON": json_text(render_prep.get("render_clip_list_json")),
        "Music_URL": render_prep.get("music_url") or "",
        "Clip_1_Duration_Frames": render_prep.get("compatibility_clip_1_duration_frames"),
        "Clip_2_URL": render_prep.get("compatibility_clip_2_url") or "",
        "Clip_2_Duration_Frames": render_prep.get("compatibility_clip_2_duration_frames"),
        "Remotion_Error_Message": remotion_error,
        "Output_Status": render_prep.get("output_status") or "In Production",
        "Render_Total_Frames": render_prep.get("render_total_frames"),
        "Clip_3_URL": render_prep.get("compatibility_clip_3_url") or "",
        "Output_Filename": render_prep.get("output_filename") or "",
        "Clip_1_URL": render_prep.get("compatibility_clip_1_url") or "",
        "Composition_ID": resolve_composition_id(
            field_str(output, "Composition_ID"),
            render_prep,
        ),
        "Brand_Text": render_prep.get("brand_text") or "",
        "Render_Status": render_prep.get("render_status") or "Ready for Render",
        "Clip_3_Duration_Frames": render_prep.get("compatibility_clip_3_duration_frames"),
    }
    voiceover_url = (
        str(render_prep.get("voiceover_url") or "").strip()
        or field_str(output, "Voiceover_URL")
        or field_str(content_item or {}, "Voiceover_URL")
    )
    if voiceover_url:
        fields["Voiceover_URL"] = voiceover_url
    return {key: value for key, value in fields.items() if value is not None and value != ""}
