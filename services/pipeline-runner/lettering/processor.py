from __future__ import annotations

from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from branding.watermark import already_branded_url, apply_watermark_bytes, brand_watermark_bytes
from item4.constants import MEDIA_PUBLIC_BASE
from lettering.compositor import (
    already_lettered_url,
    is_ai_cover_clip,
    is_leftover_overlay_text,
    letter_jpeg_bytes,
    overlay_text_for_clip,
)
from lettering.constants import MAX_RECORDS
from lettering.formulas import lettering_exact_output_formula, lettering_production_formula
from render.fields import field_str, first_linked_id, json_text, parse_json_field
from integrations.r2_upload import R2UploadClient


CLIP_JSON_FIELDS = ("Render_Clip_List_JSON",)
PACKAGE_JSON_FIELDS = ("Selected_Assets_JSON",)


def _raw(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


def _clip_url(clip: dict[str, Any]) -> str:
    return str(clip.get("url") or clip.get("src") or "").strip()


def _set_clip_url(clip: dict[str, Any], url: str) -> None:
    clip["url"] = url
    if "src" in clip:
        clip["src"] = url
    clip["lettered"] = True
    clip["watermarked"] = True


def _clip_has_leftover_overlay(clip: dict[str, Any]) -> bool:
    overlay = clip.get("overlay") or {}
    if isinstance(overlay, str):
        text = overlay.strip()
    else:
        text = str(overlay.get("text") or "").strip()
    caption = str(clip.get("caption") or "").strip()
    return is_leftover_overlay_text(text) or is_leftover_overlay_text(caption)


def _unlettered_source_url(clip: dict[str, Any], output: dict[str, Any], index: int) -> str:
    current = _clip_url(clip)
    if current and not already_lettered_url(current):
        return current
    parsed = parse_json_field(_raw(output, "Selected_Assets_JSON"))
    prep = parsed.get("render_prep") if isinstance(parsed, dict) else {}
    listed = parse_json_field(prep.get("render_clip_list_json")) if isinstance(prep, dict) else None
    if isinstance(listed, list) and index < len(listed) and isinstance(listed[index], dict):
        candidate = str(listed[index].get("url") or listed[index].get("src") or "").strip()
        if candidate and not already_lettered_url(candidate):
            return candidate
    return ""


def _clips_from_output(output: dict[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
    for name in CLIP_JSON_FIELDS:
        parsed = parse_json_field(_raw(output, name))
        if isinstance(parsed, list) and parsed:
            return name, parsed
        if isinstance(parsed, dict) and isinstance(parsed.get("clips"), list) and parsed["clips"]:
            return name, parsed["clips"]
    for name in PACKAGE_JSON_FIELDS:
        parsed = parse_json_field(_raw(output, name))
        if isinstance(parsed, dict):
            for key in ("selected_clips", "clips"):
                clips = parsed.get(key)
                if isinstance(clips, list) and clips:
                    return name, clips
        if isinstance(parsed, list) and parsed:
            return name, parsed
    return None, []


def branding_jobs_for_clips(
    clips: list[dict[str, Any]],
    output: dict[str, Any],
    title: str,
) -> list[tuple[int, dict[str, Any], str, str]]:
    work: list[tuple[int, dict[str, Any], str, str]] = []
    for index, clip in enumerate(clips):
        if not isinstance(clip, dict):
            continue
        text = "" if is_ai_cover_clip(clip) else overlay_text_for_clip(clip, title)
        url = _clip_url(clip)
        leftover = _clip_has_leftover_overlay(clip)
        if already_branded_url(url) and not leftover:
            continue
        source_url = _unlettered_source_url(clip, output, index)
        if not source_url and url and not already_branded_url(url):
            source_url = url
        if not source_url:
            continue
        work.append((index, clip, text, source_url))
    return work


def _rewrite(value: Any, url_map: dict[str, str]) -> Any:
    if isinstance(value, list):
        for clip in value:
            if isinstance(clip, dict):
                old = _clip_url(clip)
                if old in url_map:
                    _set_clip_url(clip, url_map[old])
        return value
    if isinstance(value, dict):
        for key in ("selected_clips", "clips"):
            if isinstance(value.get(key), list):
                _rewrite(value[key], url_map)
        prep = value.get("render_prep")
        if isinstance(prep, dict):
            for idx in (1, 2, 3):
                key = f"compatibility_clip_{idx}_url"
                old = str(prep.get(key) or "")
                if old in url_map:
                    prep[key] = url_map[old]
        return value
    return value


def select_outputs(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = MAX_RECORDS,
) -> list[dict[str, Any]]:
    if output_record_id:
        formula = lettering_exact_output_formula(output_record_id, test_run_id or "")
        max_records = 1
    else:
        formula = lettering_production_formula()
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=formula,
        max_records=max_records,
    )


def process_one(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=1,
    )
    if not outputs:
        return {"processed": False, "reason": "no_eligible_platform_output"}

    output = outputs[0]
    json_field, clips = _clips_from_output(output)
    if not clips:
        return {
            "processed": False,
            "reason": "missing_clip_json",
            "output_record_id": output["id"],
        }

    content_item = None
    content_item_id = first_linked_id(output.get("fields", {}).get("Content_Item"))
    if content_item_id:
        content_item = client.get_record(CONTENT_ITEMS_TABLE, content_item_id)
    title = (
        field_str(output, "Output_Title")
        or field_str(output, "Title_Text")
        or field_str(content_item or {}, "Content_Title")
        or ""
    )

    work = branding_jobs_for_clips(clips, output, title)

    preview = {
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "clip_count": len(clips),
        "letter_count": sum(1 for item in work if item[2]),
        "brand_count": len(work),
        "json_field": json_field,
    }
    if not work:
        return {"processed": False, "reason": "already_branded_or_no_stills", **preview}
    if dry_run:
        return {
            "processed": False,
            "dry_run": True,
            "would_letter": [item[2] for item in work if item[2]],
            "would_watermark": [item[3] for item in work],
            **preview,
        }

    watermark_png = brand_watermark_bytes(client)
    uploader = R2UploadClient()
    url_map: dict[str, str] = {}
    lettered_urls: list[str] = []
    for index, clip, text, source_url in work:
        response = requests.get(source_url, timeout=120)
        response.raise_for_status()
        jpeg = letter_jpeg_bytes(response.content, text)
        branded = apply_watermark_bytes(jpeg, watermark_png, output_format="jpeg")
        folder = "lettered" if text else "watermarked"
        key = f"studio/previews/{folder}/{output['id']}/{index}.jpg"
        uploader.put_object(key, branded, "image/jpeg")
        public_url = f"{MEDIA_PUBLIC_BASE.rstrip('/')}/{key.lstrip('/')}"
        url_map[source_url] = public_url
        current = _clip_url(clip)
        if current and current != source_url:
            url_map[current] = public_url
        if text:
            if isinstance(clip.get("overlay"), dict):
                clip["overlay"] = {**clip["overlay"], "text": text}
            elif clip.get("overlay") is not None:
                clip["overlay"] = text
            clip["caption"] = text
        lettered_urls.append(public_url)
        _set_clip_url(clip, public_url)

    fields: dict[str, Any] = {}
    for name in (*CLIP_JSON_FIELDS, *PACKAGE_JSON_FIELDS):
        parsed = parse_json_field(_raw(output, name))
        if parsed is None:
            continue
        fields[name] = json_text(_rewrite(parsed, url_map))

    first_url = _clip_url(clips[0]) if clips else ""
    if first_url:
        fields["Studio_Preview_URL"] = first_url
        fields["Clip_1_URL"] = first_url
        fields["Selected_Clip_1_URL"] = first_url
    if len(clips) > 1:
        second = _clip_url(clips[1])
        fields["Clip_2_URL"] = second
        fields["Selected_Clip_2_URL"] = second
    if len(clips) > 2:
        third = _clip_url(clips[2])
        fields["Clip_3_URL"] = third
        fields["Selected_Clip_3_URL"] = third

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields)
    return {
        "processed": True,
        "route": "native_branding",
        "lettered_urls": lettered_urls,
        **preview,
    }


def process_batch(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_runs: int = MAX_RECORDS,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    client = AirtableClient()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=max_runs,
    )
    if not outputs:
        return [{"processed": False, "reason": "no_eligible_platform_output"}]
    results: list[dict[str, Any]] = []
    for output in outputs:
        results.append(
            process_one(
                output_record_id=output["id"],
                test_run_id=test_run_id,
                dry_run=dry_run,
            )
        )
        if dry_run:
            break
    return results
