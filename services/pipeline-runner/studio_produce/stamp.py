from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from studio_produce.constants import PLATFORM_OUTPUTS_TABLE
from render.fields import field, field_str
from studio_produce.constants import NATIVE_OUTPUT_TYPES, STORY_OUTPUT_TYPES
from studio_produce.context import expected_photo_count, master_assets, variant_manifest
from studio_produce.job import finished_origin_kind, parse_json
from studio_produce.media import (
    asset_is_video,
    asset_media_kind,
    clip_in_out_seconds,
    distribute_frames,
    playable_url,
    source_duration_seconds,
)

if TYPE_CHECKING:
    from airtable.client import AirtableClient


STORY_TEASER_SECONDS = 5
SINGLE_STILL_SECONDS = 5
PHOTO_FLOOR_SECONDS = 3
FPS = 30


def is_native_photo(platform: str, output_type: str, mapping: str = "") -> bool:
    platform = str(platform or "").strip()
    output_type = str(output_type or "").strip()
    mapping = str(mapping or "").strip()
    if output_type in STORY_OUTPUT_TYPES:
        return False
    if platform == "TikTok" and output_type in {"Multi-Photo", "Single Photo", *NATIVE_OUTPUT_TYPES}:
        return output_type in {"Multi-Photo", "Single Photo"} or mapping == "TikTok Slideshow"
    if platform == "Instagram" and (
        output_type in {"Carousel", "Single Image", "Instagram Feed Post", *NATIVE_OUTPUT_TYPES}
        or mapping in {"Instagram Carousel", "Instagram Feed Post"}
    ):
        return output_type != "Reel" and output_type not in STORY_OUTPUT_TYPES
    if platform == "Facebook" and (
        output_type in {"Multi-Image Post", "Single Image", "Facebook Post", *NATIVE_OUTPUT_TYPES}
        or mapping in {"Facebook Photo Set", "Facebook Post"}
    ):
        return output_type != "Slideshow Reel" and output_type not in STORY_OUTPUT_TYPES
    return output_type in NATIVE_OUTPUT_TYPES


def plan_item_for_output(request: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    plan = parse_json(field(request, "Studio_Output_Plan_JSON"), {}) or {}
    platform = field_str(output, "Platform")
    output_type = field_str(output, "Studio_Output_Type") or field_str(output, "Output_Type")
    key = f"{platform}::{output_type}"
    for item in plan.get("items") or []:
        if not isinstance(item, dict):
            continue
        if f"{item.get('platform') or ''}::{item.get('output_type') or ''}" == key:
            return item
    return {}


def directive_yes(value: Any) -> bool:
    return str(value or "").strip() != "No"


def output_effective(output: dict[str, Any], request: dict[str, Any], parent: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "platform": field_str(output, "Platform"),
        "output_type": field_str(output, "Studio_Output_Type") or field_str(output, "Output_Type"),
        "voiceover_mode": field_str(output, "Studio_Effective_Voiceover_Mode") or field_str(request, "Voiceover_Mode") or "Yes",
        "thumbnail_mode": field_str(output, "Studio_Effective_Thumbnail_Mode") or field_str(request, "Thumbnail_Mode") or "Yes",
        "background_music_mode": field_str(output, "Studio_Effective_Background_Music_Mode") or field_str(request, "Background_Music_Mode") or "Yes",
        "video_duration_seconds": field(output, "Studio_Effective_Video_Duration_Seconds") or field(request, "Video_Duration_Seconds") or 0,
        "voiceover_duration_seconds": field(output, "Studio_Effective_Voiceover_Duration_Seconds") or field(request, "Voiceover_Duration_Seconds") or field(parent or {}, "Voiceover_Duration_Seconds") or 0,
        "music_start_seconds": field(output, "Studio_Effective_Music_Start_Seconds") or field(request, "Music_Start_Seconds") or field(parent or {}, "Music_Start_Seconds") or 0,
        "requested_title": field_str(output, "Studio_Effective_Requested_Title") or field_str(request, "Requested_Title") or field_str(parent or {}, "Content_Title"),
        "requested_caption": field_str(output, "Studio_Effective_Requested_Caption") or field_str(request, "Requested_Caption") or field_str(parent or {}, "Caption"),
        "music_url": field_str(output, "Music_URL") or field_str(output, "Preferred_Music_URL") or field_str(parent or {}, "Selected_Music_URL"),
    }


def duration_seconds(
    *,
    story: bool,
    clip_count: int,
    effective: dict[str, Any],
    request: dict[str, Any],
    output: dict[str, Any] | None = None,
) -> float:
    output_override = field(output or {}, "Video_Duration_Seconds_Override")
    try:
        if output_override and float(output_override) > 0:
            value = float(output_override)
            return min(15.0, value) if story else value
    except (TypeError, ValueError):
        pass
    if story:
        return SINGLE_STILL_SECONDS if clip_count <= 1 else min(15, clip_count * SINGLE_STILL_SECONDS)
    stored = effective.get("video_duration_seconds") or field(request, "Video_Duration_Seconds") or 0
    try:
        stored_n = float(stored)
    except (TypeError, ValueError):
        stored_n = 0
    # Owner-set duration on the Production Request (including 30) is authoritative.
    if stored_n > 0:
        return stored_n
    if clip_count <= 1:
        return SINGLE_STILL_SECONDS
    return min(30, max(clip_count * PHOTO_FLOOR_SECONDS, 9))


def _master_for_source(masters: list[dict[str, Any]], source: dict[str, Any]) -> dict[str, Any]:
    source_id = str(source.get("id") or "")
    for master in masters:
        if str(master.get("id") or "") == source_id:
            return master
    return source


def _music_requested(effective: dict[str, Any]) -> bool:
    mode = str(effective.get("background_music_mode") or "").strip().lower()
    if mode in {"no", "false", "0"}:
        return False
    return bool(effective.get("music_url"))


def assign_clip_frames(
    clips: list[dict[str, Any]],
    *,
    story: bool,
    effective: dict[str, Any],
    request: dict[str, Any],
    output: dict[str, Any] | None,
) -> tuple[list[int], int]:
    kinds = [asset_media_kind(item.get("source") or item) for item in clips]
    video_indexes = [index for index, kind in enumerate(kinds) if kind == "video"]
    photo_indexes = [index for index, kind in enumerate(kinds) if kind != "video"]
    frames = [0] * len(clips)
    native_video = []
    for index in video_indexes:
        source = clips[index].get("source") or {}
        start, end = clip_in_out_seconds(source)
        native_video.append(max(1, round((end - start) * FPS)))
        frames[index] = native_video[-1]
    video_total = sum(native_video)
    owner = duration_seconds(
        story=story,
        clip_count=len(clips),
        effective=effective,
        request=request,
        output=output,
    )
    stored = effective.get("video_duration_seconds") or 0
    try:
        owner_set = float(stored) > 0
    except (TypeError, ValueError):
        owner_set = False
    if story:
        target = max(len(clips), round(owner * FPS))
    elif owner_set:
        target = max(len(clips), round(float(stored) * FPS))
    else:
        photo_seconds = PHOTO_FLOOR_SECONDS * max(1, len(photo_indexes)) if photo_indexes else 0
        target = video_total + max(len(photo_indexes), round(photo_seconds * FPS))
        if not video_indexes:
            target = max(len(clips), round(owner * FPS))
    cap = story or owner_set
    if cap:
        photo_floor = round(PHOTO_FLOOR_SECONDS * FPS) * len(photo_indexes) if photo_indexes else 0
        min_video = len(video_indexes)
        min_photo = len(photo_indexes)
        if photo_indexes and video_indexes:
            photo_budget = max(min_photo, min(photo_floor, target - min_video))
            video_budget = max(min_video, target - photo_budget)
        elif photo_indexes:
            photo_budget = target
            video_budget = 0
        else:
            photo_budget = 0
            video_budget = target
        if video_indexes:
            if video_total <= video_budget:
                for position, index in enumerate(video_indexes):
                    frames[index] = native_video[position]
                if photo_indexes:
                    photo_budget = max(min_photo, target - video_total)
                else:
                    target = video_total
            else:
                allocated = distribute_frames(native_video, video_budget)
                for position, index in enumerate(video_indexes):
                    frames[index] = allocated[position]
        if photo_indexes:
            allocated = distribute_frames([1] * len(photo_indexes), max(min_photo, photo_budget))
            for position, index in enumerate(photo_indexes):
                frames[index] = allocated[position]
        total = sum(frames) or max(1, target)
        if cap and photo_indexes and total != target:
            delta = target - total
            frames[photo_indexes[-1]] = max(1, frames[photo_indexes[-1]] + delta)
            total = sum(frames)
        return frames, total
    remaining = max(len(photo_indexes), target - video_total) if photo_indexes else 0
    if photo_indexes:
        allocated = distribute_frames([1] * len(photo_indexes), remaining)
        for position, index in enumerate(photo_indexes):
            frames[index] = allocated[position]
    total = sum(frames) or max(1, target)
    return frames, total


def overlay_from_caption(text: str, *, tiktok_916: bool = False) -> dict[str, Any] | None:
    overlay_text = str(text or "").strip()
    if not overlay_text:
        return None
    return {
        "enabled": True,
        "text": overlay_text,
        "role": "caption",
        "position": "lower-third" if tiktok_916 else "bottom",
        "size": 52,
        "stylePreset": "Lower Third / Minimal",
        "animation": "fade",
        "startFraction": 0,
        "endFraction": 1,
        "backgroundOpacity": 0.4,
    }


def pick_variant(source: dict[str, Any], ratio: str) -> dict[str, Any] | None:
    variants = source.get("variants") if isinstance(source.get("variants"), dict) else {}
    wanted = str(ratio or "").replace("x", ":")
    aliases = {
        "9:16": ["9:16", "9x16"],
        "16:9": ["16:9", "16x9"],
        "4:5": ["4:5", "4x5"],
        "1:1": ["1:1", "1x1"],
    }
    for key in aliases.get(wanted, [wanted]):
        variant = variants.get(key)
        if _renderable(variant):
            return variant
        for existing, item in variants.items():
            if str(existing).replace("x", ":") == wanted and _renderable(item):
                return item
    for item in variants.values():
        if _renderable(item):
            return item
    return None


def _renderable(variant: Any) -> bool:
    if not isinstance(variant, dict):
        return False
    url = str(variant.get("preview_url") or "").strip()
    media_id = str(variant.get("media_asset_record_id") or "").strip()
    return bool(url) and media_id.startswith("rec")


def _public_master_url(master: dict[str, Any]) -> str:
    return str(master.get("url") or master.get("preview_url") or "").strip()


def _public_cdn_url(value: Any) -> str:
    url = str(value or "").strip()
    return url if url.startswith("https://media.chicagoshining.com/") else ""


def photo_sequence_url(master: dict[str, Any], variant: dict[str, Any] | None) -> str:
    """Prefer the original still. 9:16 fill-crop variants cut square/4:5 flyers."""
    return (
        _public_cdn_url(master.get("preview_url"))
        or str((variant or {}).get("preview_url") or "").strip()
        or playable_url(master)
    )


def finished_source_package(
    request: dict[str, Any],
    output: dict[str, Any],
    parent: dict[str, Any] | None,
) -> dict[str, Any] | None:
    kind = finished_origin_kind(request.get("fields") or request)
    if not kind:
        notes = str(field(request, "Production_Notes") or "")
        kind = "finished-video" if "ez-input=finished-video" in notes else (
            "finished-stills" if "ez-input=finished-stills" in notes or "ez-input=finished-carousel" in notes else ""
        )
    if not kind:
        return None
    masters = master_assets(request)
    if not masters:
        return None
    effective = output_effective(output, request, parent)
    plan_item = plan_item_for_output(request, output)
    ratio = str(plan_item.get("aspect_ratio") or field_str(output, "Aspect_Ratio") or "").strip()
    if kind == "finished-video":
        ratio = ratio or "9:16"
        chosen = next(
            (
                item for item in masters
                if str(item.get("mime_type") or "").lower().startswith("video/")
                or str(item.get("name") or "").lower().endswith((".mp4", ".mov", ".m4v", ".webm"))
            ),
            masters[0],
        )
        masters = [chosen]
    else:
        ratio = ratio or ("4:5" if len(masters) == 1 else "1:1")
        masters = [
            item for item in masters
            if not str(item.get("mime_type") or "").lower().startswith("video/")
        ] or masters
    clips = []
    for index, master in enumerate(masters):
        url = _public_master_url(master)
        if not url:
            return None
        clips.append({
            "id": f"finished-source-{index + 1}",
            "order": int(master.get("order") or index + 1),
            "media_asset_record_id": str(master.get("media_asset_record_id") or ""),
            "source_asset_id": str(master.get("id") or "") or None,
            "asset_name": str(master.get("name") or f"finished-{index + 1}"),
            "url": url,
            "src": url,
            "startFrame": 0,
            "durationFrames": 1,
            "motionStyle": "none",
            "source": "finished_passthrough",
            "aspect_ratio": ratio,
            "google_drive_file_id": str(master.get("google_drive_file_id") or "") or None,
            "overlay": None,
            "caption": "",
        })
    if not clips:
        return None
    native = kind != "finished-video"
    selected = {
        "schema_version": "studio.source-selection.2",
        "authority": "studio_finished_passthrough",
        "production_request_record_id": request["id"],
        "platform": effective["platform"],
        "output_type": effective["output_type"],
        "aspect_ratio": ratio,
        "selection_status": "Selected",
        "selected_clips": clips,
        "fps": 30,
        "target_total_frames": 1,
        "render_prep": {
            "render_status": "Rendered" if kind == "finished-video" else "Native Photo Route",
            "composition_id": None,
            "output_filename": None,
            "render_total_frames": 1,
            "render_clip_list_json": "[]",
        },
    }
    return {
        "status": "Ready",
        "ratio": ratio,
        "clips": clips,
        "clip_count": len(clips),
        "total_frames": 1,
        "composition_id": None,
        "output_filename": None,
        "selected_assets_json": json.dumps(selected),
        "render_clip_list_json": json.dumps([
            {
                "id": clip["id"],
                "order": clip["order"],
                "mediaAssetRecordId": clip["media_asset_record_id"] or None,
                "assetName": clip["asset_name"],
                "url": clip["url"],
                "src": clip["src"],
                "startFrame": 0,
                "durationFrames": 1,
                "motionStyle": "none",
                "overlay": None,
                "caption": "",
            }
            for clip in clips
        ]),
        "native": native,
        "finished": True,
        "finished_kind": kind,
        "story": effective["output_type"] in STORY_OUTPUT_TYPES,
        "effective": effective,
    }


def source_package(
    request: dict[str, Any],
    output: dict[str, Any],
    parent: dict[str, Any] | None,
) -> dict[str, Any] | None:
    finished = finished_source_package(request, output, parent)
    if finished:
        return finished
    if field_str(request, "Studio_Variant_Status") != "Ready":
        return None
    effective = output_effective(output, request, parent)
    plan_item = plan_item_for_output(request, output)
    ratio = str(plan_item.get("aspect_ratio") or field_str(output, "Aspect_Ratio") or "9:16").strip()
    if not ratio:
        return None
    masters = master_assets(request)
    expected = expected_photo_count(request, masters)
    if masters and len(masters) < expected:
        return None
    manifest = variant_manifest(request)
    sources = [item for item in (manifest.get("assets") or []) if isinstance(item, dict)]
    sources.sort(key=lambda item: int(item.get("order") or 0))
    story = effective["output_type"] in STORY_OUTPUT_TYPES
    if story:
        sources = sources[:1]
    elif expected and len(sources) < expected:
        return None
    captions = {
        str(asset.get("id") or ""): str(asset.get("caption") or "").strip()
        for asset in masters
        if str(asset.get("caption") or "").strip()
    }
    clips = []
    omitted = []
    has_video = False
    for source in sources:
        master = _master_for_source(masters, source)
        merged = {**master, **source}
        video = asset_is_video(merged)
        variant = pick_variant(source, ratio)
        url = (
            playable_url(merged) or str((variant or {}).get("preview_url") or "").strip()
            if video
            else photo_sequence_url(master, variant)
        )
        media_id = str(
            merged.get("media_asset_record_id")
            or (variant or {}).get("media_asset_record_id")
            or ""
        ).strip()
        drive_id = str(
            (
                merged.get("google_drive_file_id")
                if (not video and _public_cdn_url(master.get("preview_url")))
                else (variant or {}).get("google_drive_file_id") or merged.get("google_drive_file_id")
            )
            or ""
        ).strip()
        fit_mode = None if video else ("fill_crop" if story else "full_with_solid_background")
        if not url or not media_id.startswith("rec"):
            omitted.append(str(source.get("id") or source.get("name") or "unknown"))
            continue
        overlay_text = captions.get(str(source.get("id") or "")) or str(source.get("caption") or "").strip()
        overlay = overlay_from_caption(
            overlay_text,
            tiktok_916=effective["platform"] == "TikTok" and ratio == "9:16",
        )
        in_seconds, out_seconds = clip_in_out_seconds(merged)
        has_video = has_video or video
        clips.append({
            "source": merged,
            "variant": variant,
            "url": url,
            "media_asset_id": media_id,
            "drive_id": drive_id,
            "fit_mode": fit_mode,
            "overlay": overlay,
            "media_kind": "video" if video else "photo",
            "in_seconds": in_seconds,
            "out_seconds": out_seconds,
            "source_in_seconds": in_seconds,
            "source_out_seconds": out_seconds,
            "source_duration_seconds": source_duration_seconds(merged),
        })
    if omitted or not clips:
        return None
    clip_frames, total_frames = assign_clip_frames(
        clips,
        story=story,
        effective=effective,
        request=request,
        output=output,
    )
    fps = FPS
    start = 0
    built = []
    for index, item in enumerate(clips):
        frames = clip_frames[index]
        overlay = item["overlay"]
        video = item["media_kind"] == "video"
        in_seconds = float(item["in_seconds"] or 0)
        out_seconds = in_seconds + (frames / fps) if video else item["out_seconds"]
        source_duration = float(item.get("source_duration_seconds") or 0) or max(out_seconds or 0, in_seconds)
        built.append({
            "id": f"studio-source-{index + 1}",
            "order": int((item["source"] or {}).get("order") or index + 1),
            "media_asset_record_id": item["media_asset_id"],
            "source_asset_id": str((item["source"] or {}).get("id") or "") or None,
            "asset_name": str((item["variant"] or {}).get("file_name") or (item["source"] or {}).get("name") or f"photo-{index + 1}.jpg"),
            "google_drive_url": str((item["variant"] or {}).get("google_drive_url") or "").strip() or None,
            "url": item["url"],
            "src": item["url"],
            "startFrame": start,
            "durationFrames": frames,
            "motionStyle": "none" if video else ("slowZoom" if story else "none"),
            "fitMode": item.get("fit_mode"),
            "media_kind": item["media_kind"],
            "mediaKind": item["media_kind"],
            "in_seconds": in_seconds,
            "out_seconds": out_seconds,
            "inSeconds": in_seconds,
            "outSeconds": out_seconds if video else None,
            "startFromSeconds": in_seconds if video else 0,
            "sourceDurationSeconds": source_duration if video else None,
            "source_duration_seconds": source_duration if video else None,
            "sourceInSeconds": item.get("source_in_seconds") if video else None,
            "sourceOutSeconds": item.get("source_out_seconds") if video else None,
            "source": "studio_platform_variant",
            "aspect_ratio": ratio,
            "google_drive_file_id": item["drive_id"] or None,
            "overlay": overlay or None,
            "caption": (overlay or {}).get("text") or "",
        })
        start += frames
    if (not story) and has_video and (not _music_requested(effective)):
        try:
            owner_set = float(effective.get("video_duration_seconds") or 0) > 0
        except (TypeError, ValueError):
            owner_set = False
        if owner_set:
            from t1.slice import expand_without_beats
            built = expand_without_beats(built, target_frames=total_frames, fps=fps)
            start = 0
            for clip in built:
                clip["startFrame"] = start
                start += int(clip.get("durationFrames") or 0)
            total_frames = sum(int(clip.get("durationFrames") or 0) for clip in built) or total_frames
    native = (not has_video) and is_native_photo(effective["platform"], effective["output_type"], field_str(output, "Platform_Output_Type"))
    composition_id = None if native else "ChicagoShiningPhotoSequence"
    safe_type = "".join(ch if ch.isalnum() else "-" for ch in effective["output_type"].lower()).strip("-") or "output"
    filename = f"studio-{field_str(request, 'Production_Request_ID') or request['id']}-{effective['platform'].lower()}-{safe_type}.mp4"
    clip_list = [
        {
            "id": clip["id"],
            "order": clip["order"],
            "mediaAssetRecordId": clip["media_asset_record_id"],
            "assetName": clip["asset_name"],
            "url": clip["url"],
            "src": clip["src"],
            "startFrame": clip["startFrame"],
            "durationFrames": clip["durationFrames"],
            "motionStyle": clip["motionStyle"],
            "fitMode": clip.get("fitMode") or clip.get("fit_mode"),
            "mediaKind": clip.get("media_kind") or "photo",
            "media_kind": clip.get("media_kind") or "photo",
            "googleDriveFileId": clip.get("google_drive_file_id") or None,
            "inSeconds": clip.get("in_seconds") or 0,
            "outSeconds": clip.get("out_seconds") or clip.get("outSeconds"),
            "startFromSeconds": clip.get("startFromSeconds") or 0,
            "sourceDurationSeconds": clip.get("sourceDurationSeconds") or clip.get("source_duration_seconds"),
            "sourceInSeconds": clip.get("sourceInSeconds") or clip.get("source_in_seconds"),
            "sourceOutSeconds": clip.get("sourceOutSeconds") or clip.get("source_out_seconds"),
            "overlay": clip.get("overlay") or None,
            "caption": clip.get("caption") or "",
        }
        for clip in built
    ]
    selected = {
        "schema_version": "studio.source-selection.2",
        "authority": "studio_owner_uploaded_exact_source",
        "production_request_record_id": request["id"],
        "platform": effective["platform"],
        "output_type": effective["output_type"],
        "aspect_ratio": ratio,
        "selection_status": "Selected",
        "selected_clips": built,
        "fps": fps,
        "target_total_frames": total_frames,
        "render_prep": {
            "render_status": "Native Photo Route" if native else "Ready for Render",
            "composition_id": composition_id,
            "output_filename": filename,
            "render_total_frames": total_frames,
            "render_clip_list_json": json.dumps(clip_list),
        },
    }
    return {
        "status": "Ready",
        "ratio": ratio,
        "clips": built,
        "clip_count": len(built),
        "total_frames": total_frames,
        "composition_id": composition_id,
        "output_filename": filename if composition_id else None,
        "selected_assets_json": json.dumps(selected),
        "render_clip_list_json": json.dumps(clip_list),
        "native": native,
        "story": story,
        "effective": effective,
    }


def stamp_fields(
    package: dict[str, Any],
    parent: dict[str, Any] | None,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clips = package.get("clips") or []
    per = int(package["total_frames"] / package["clip_count"]) if package.get("clip_count") else 0
    native = bool(package.get("native"))
    thumb = field_str(parent or {}, "Thumbnail_URL")
    fields = {
        "Asset_Need_Status": "Not Needed",
        "Selected_Clip_1_URL": clips[0]["url"] if len(clips) > 0 else None,
        "Selected_Clip_2_URL": clips[1]["url"] if len(clips) > 1 else None,
        "Selected_Clip_3_URL": clips[2]["url"] if len(clips) > 2 else None,
        "Clip_1_URL": clips[0]["url"] if len(clips) > 0 else None,
        "Clip_2_URL": clips[1]["url"] if len(clips) > 1 else None,
        "Clip_3_URL": clips[2]["url"] if len(clips) > 2 else None,
        "Selected_Clip_1_Media_Asset_ID": clips[0]["media_asset_record_id"] if len(clips) > 0 else None,
        "Selected_Clip_2_Media_Asset_ID": clips[1]["media_asset_record_id"] if len(clips) > 1 else None,
        "Selected_Clip_3_Media_Asset_ID": clips[2]["media_asset_record_id"] if len(clips) > 2 else None,
        "Selected_Clip_Count": package.get("clip_count") or 0,
        "Selected_Assets_JSON": package.get("selected_assets_json"),
        "Render_Clip_List_JSON": package.get("render_clip_list_json"),
        "Render_Total_Frames": package.get("total_frames") or 0,
        "Clip_1_Duration_Frames": per if clips else 0,
        "Clip_2_Duration_Frames": per if len(clips) > 1 else 0,
        "Clip_3_Duration_Frames": per if len(clips) > 2 else 0,
        "Voiceover_URL": field_str(parent or {}, "Voiceover_URL") or None if (
            directive_yes(package.get("effective", {}).get("voiceover_mode")) and not package.get("story")
        ) else None,
        "Music_URL": package.get("effective", {}).get("music_url") or None,
        "Preferred_Music_URL": package.get("effective", {}).get("music_url") or None,
        "Music_Volume": 1.0 if package.get("effective", {}).get("music_url") else 0,
        "Music_Start_Seconds": package.get("effective", {}).get("music_start_seconds") or 0,
        "Timing_Status": (
            "Pending"
            if (not native and _music_requested(package.get("effective") or {}))
            else ("Skipped" if not native else None)
        ),
        "Voiceover_Duration_Seconds": package.get("effective", {}).get("voiceover_duration_seconds") or None,
    }
    existing_record = existing if isinstance(existing, dict) and "fields" in existing else {"fields": existing or {}}
    existing_timing = field_str(existing_record, "Timing_Status")
    existing_timeline = field_str(existing_record, "Timing_Timeline_JSON")
    if existing_timing in {"Ready", "Skipped"} or existing_timeline:
        fields.pop("Render_Clip_List_JSON", None)
        fields.pop("Render_Total_Frames", None)
        if existing_timing in {"Ready", "Skipped"}:
            fields.pop("Timing_Status", None)
        elif existing_timeline:
            fields["Timing_Status"] = "Ready"
    if thumb:
        fields["Thumbnail_URL"] = thumb
    first_url = clips[0]["url"] if clips else None
    public = first_url if str(first_url or "").startswith("https://media.chicagoshining.com/") else None
    if package.get("finished"):
        video = package.get("finished_kind") == "finished-video"
        fields.update({
            "Output_Status": "Ready for Review",
            "Render_Status": "Rendered" if video else "Native Photo Route",
            "Asset_Selection_Status": None,
            "Studio_Preview_URL": first_url,
            "Final_File_URL": first_url if video else None,
            "Publish_Asset_URL": public,
            "Composition_ID": None,
            "Output_Filename": None,
            "Review_Status": None,
        })
        return fields
    if native:
        fields.update({
            "Output_Status": "Ready for Review",
            "Render_Status": "Native Photo Route",
            "Asset_Selection_Status": None,
            "Studio_Preview_URL": clips[0]["url"] if clips else None,
            "Composition_ID": None,
            "Output_Filename": None,
        })
    else:
        fields.update({
            "Output_Status": "In Production",
            "Render_Status": "Ready for Render",
            "Asset_Selection_Status": "Selected",
            "Composition_ID": "ChicagoShiningPhotoSequence",
            "Output_Filename": package.get("output_filename"),
            "Review_Status": None,
            "Review_Email_Sent_At": None,
            "Studio_Preview_URL": None,
        })
    return fields


def stamp_outputs(
    client: AirtableClient,
    request: dict[str, Any],
    outputs: list[dict[str, Any]],
    parent: dict[str, Any] | None,
) -> dict[str, Any]:
    stamped = 0
    missing = []
    for output in outputs:
        status = field_str(output, "Output_Status")
        if status in {"Ready for Review", "Approved for Publishing", "Published"} and (
            field_str(output, "Final_File_URL") or field_str(output, "Studio_Preview_URL") or field_str(output, "Render_Status") == "Native Photo Route"
        ):
            stamped += 1
            continue
        package = source_package(request, output, parent)
        if not package:
            missing.append(output["id"])
            continue
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], stamp_fields(package, parent, existing=output), typecast=True)
        stamped += 1
    return {"stamped": stamped, "missing": missing, "total": len(outputs)}
