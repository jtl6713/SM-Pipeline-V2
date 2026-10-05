from __future__ import annotations

import json
import logging
import re
from typing import Any

from a3.metadata_merge import parse_filename_metadata
from airtable.client import AirtableClient
from studio_produce.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE, PRODUCTION_REQUESTS_TABLE
from item4.processor import process_drain as process_smv1_drain
from p3.helpers import caption_with_hashtags
from render.fields import field, field_str
from studio_produce.context import (
    expected_photo_count,
    master_assets,
    slide_image_url,
    variant_manifest,
)
from studio_produce.job import finished_origin_kind, is_finished_route, parse_json, utc_now
from studio_produce.queue import (
    outstanding_count,
    persist_variant_manifest,
    rebuild_variant_manifest,
    reconcile_master_authority,
    required_ratios,
    upsert_master_queue,
    upsert_variant_queue,
)
from studio_produce.stamp import directive_yes, is_native_photo, stamp_outputs
from studio_produce.thumbnail import is_designed_cover_url, needs_grid_cover

logger = logging.getLogger("pipeline-runner.studio-produce")


class StepBlocked(RuntimeError):
    pass


class StepWait(RuntimeError):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def source_kind(route: str) -> str:
    return str(route or "").split(":", 1)[0] or "uploaded"


def is_finished(ctx: dict[str, Any]) -> bool:
    route = str((ctx.get("job") or {}).get("route") or "")
    if is_finished_route(route):
        return True
    return bool(finished_origin_kind((ctx.get("request") or {}).get("fields") or {}))


def caption_locked(request: dict[str, Any]) -> bool:
    return "force exact" in field_str(request, "Caption_Mode").lower()


def script_locked(request: dict[str, Any]) -> bool:
    if "force exact" in field_str(request, "Script_Mode").lower():
        return True
    from studio_produce.timed_script import timed_script_from_request

    return timed_script_from_request(request) is not None


def exact_requested_script(request: dict[str, Any]) -> str:
    from studio_produce.timed_script import exact_voiceover_text, timed_script_from_request

    timeline = timed_script_from_request(request)
    if timeline:
        # Suggested-still descriptions stay out of narration even if Script_Mode was left on AI decides.
        return exact_voiceover_text(timeline)
    if not script_locked(request):
        return ""
    return field_str(request, "Requested_Script").strip()


def enforce_exact_voiceover_script(
    client: AirtableClient,
    request: dict[str, Any],
    parent: dict[str, Any],
) -> dict[str, Any]:
    """Make Force exact script the canonical P2 input before any AI script generation."""
    exact = exact_requested_script(request)
    if not exact:
        return parent

    current = field_str(parent, "Voiceover_Script").strip()
    stale_audio = bool(field_str(parent, "Voiceover_URL")) and current != exact
    patch: dict[str, Any] = {}
    if current != exact:
        patch["Voiceover_Script"] = exact
    if field_str(parent, "Script_Status") != "Generated":
        patch["Script_Status"] = "Generated"
    if stale_audio:
        patch.update({
            "Voiceover_URL": None,
            "Voiceover_Google_Drive_File_ID": None,
            "Voiceover_Normalization_Status": None,
            "Voiceover_Normalization_Details": None,
            "Voiceover_Normalized_At": None,
            "Voiceover_Duration_Seconds": None,
        })
    if field_str(parent, "Voiceover_Status") != "Ready" or stale_audio:
        patch["Voiceover_Status"] = "Ready"
    if field_str(parent, "Content_Status") != "Ready for Voiceover" or stale_audio:
        patch["Content_Status"] = "Ready for Voiceover"
    if patch:
        client.update_record(CONTENT_ITEMS_TABLE, parent["id"], patch, typecast=True)
        parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    return parent


def voiceover_required(request: dict[str, Any], parent: dict[str, Any] | None) -> bool:
    status = field_str(parent or {}, "Voiceover_Status")
    if status in {"Not Needed", "Skipped"}:
        return False
    return directive_yes(field_str(request, "Voiceover_Mode"))


def voiceover_missing(request: dict[str, Any], parent: dict[str, Any] | None) -> bool:
    """True when the request wants narration but the parent has no Voiceover_URL yet."""
    if not parent:
        return False
    if finished_origin_kind((request or {}).get("fields") or {}):
        return False
    return voiceover_required(request, parent) and not field_str(parent, "Voiceover_URL")


def rearm_voiceover_parent(client: AirtableClient, request: dict[str, Any], parent: dict[str, Any]) -> dict[str, Any]:
    """Put the Content Item back on the P2 voiceover selector.

    P2 only runs when Content_Status is "Ready for Voiceover", Script_Status is
    "Generated", Voiceover_Status is "Ready", and a script exists. Cover staging
    (Worker or thumbnail.py) used to overwrite Content_Status with "Thumbnail
    Ready" while Voiceover_URL was still blank, which silently switched P2 off
    and left R4 returning waiting_for_voiceover forever (Output 432).
    """
    parent = enforce_exact_voiceover_script(client, request, parent)
    if not field_str(parent, "Voiceover_Script"):
        ensure_voiceover_script(client, request, parent)
        parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    patch: dict[str, Any] = {}
    if field_str(parent, "Script_Status") != "Generated" and field_str(parent, "Voiceover_Script"):
        patch["Script_Status"] = "Generated"
    if field_str(parent, "Voiceover_Status") not in {"Ready", "Generated"}:
        patch["Voiceover_Status"] = "Ready"
    if field_str(parent, "Content_Status") != "Ready for Voiceover":
        patch["Content_Status"] = "Ready for Voiceover"
    if patch:
        client.update_record(CONTENT_ITEMS_TABLE, parent["id"], patch, typecast=True)
        parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    return parent


def run_voiceover_p2(client: AirtableClient, ctx: dict[str, Any]) -> dict[str, Any]:
    """Re-arm the parent and run P2. Returns the refreshed parent once Voiceover_URL exists.

    Raises StepWait while P2 is still working and StepBlocked when P2 refuses the item.
    """
    from p2.processor import process_request

    request = ctx["request"]
    parent = rearm_voiceover_parent(client, request, ctx["parent"])
    ctx["parent"] = parent
    result = process_request(
        content_item_record_id=parent["id"],
        test_run_id=field_str(request, "Test_Run_ID") or None,
    )
    refreshed = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    ctx["parent"] = refreshed
    if not field_str(refreshed, "Voiceover_URL"):
        if result.get("processed"):
            raise StepWait("Waiting for voiceover")
        raise StepBlocked(result.get("reason") or "P2 did not generate voiceover")
    return refreshed


def copy_voiceover_to_outputs(client: AirtableClient, parent: dict[str, Any], outputs: list[dict[str, Any]]) -> int:
    vo = field_str(parent or {}, "Voiceover_URL")
    if not vo:
        return 0
    copied = 0
    for output in outputs or []:
        effective_mode = field_str(output, "Studio_Effective_Voiceover_Mode").strip().lower()
        if effective_mode in {"no", "false", "0"}:
            continue
        if field_str(output, "Voiceover_URL"):
            continue
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], {"Voiceover_URL": vo}, typecast=True)
        output.setdefault("fields", {})["Voiceover_URL"] = vo
        copied += 1
    return copied


RENDERED_VIDEO_OUTPUTS = {
    "Reel",
    "Short",
    "Video Draft",
    "Standard Video",
    "Slideshow Reel",
    "Slideshow Video",
}


def _output_type(row: dict[str, Any]) -> str:
    record = row if isinstance(row, dict) and "fields" in row else {"fields": row or {}}
    return field_str(record, "Studio_Output_Type") or field_str(record, "Output_Type")


def has_rendered_video(request: dict[str, Any] | None = None, outputs: list[dict[str, Any]] | None = None) -> bool:
    for row in outputs or []:
        if _output_type(row) in RENDERED_VIDEO_OUTPUTS:
            return True
    plan = parse_json(field(request or {}, "Studio_Output_Plan_JSON"), {}) or {}
    for item in plan.get("items") or []:
        kind = str((item or {}).get("output_type") or (item or {}).get("studio_output_type") or "").strip()
        if kind in RENDERED_VIDEO_OUTPUTS:
            return True
    return False


def thumbnail_required(request: dict[str, Any], outputs: list[dict[str, Any]] | None = None) -> bool:
    if has_rendered_video(request, outputs):
        return True
    mode = field_str(request, "Thumbnail_Mode")
    return mode not in {"No", "Use Photo Frame", "Photo Frame", "Use photo frame"}


def pick_resume_step(
    request: dict[str, Any],
    outputs: list[dict[str, Any]] | None = None,
    parent: dict[str, Any] | None = None,
    route: str | None = None,
) -> str:
    rows = outputs or []
    if rows and all(_output_file_ready(row) for row in rows):
        if any(_output_missing_review_cover(row) for row in rows):
            return "stamp"
        return "done"
    # Narration is a render input. Resuming at stamp/render with no Voiceover_URL
    # makes R4 return waiting_for_voiceover on every loop.
    if not is_finished_route(route or "") and voiceover_missing(request, parent):
        return "audio"
    if any(field_str(row, "Remotion_Job_ID") or field_str(row, "Render_Status").lower() == "rendering" for row in rows):
        return "render"
    if any(field_str(row, "Asset_Selection_Status") == "Selected" for row in rows):
        return "stamp"
    manifest = variant_manifest(request)
    if manifest.get("plan_complete") or field_str(request, "Studio_Variant_Status") == "Ready":
        return "stamp"
    if master_assets(request):
        return "queue_crops"
    return "themes"


def theme_title(request: dict[str, Any], parent: dict[str, Any] | None) -> str:
    return (
        field_str(request, "Requested_Title")
        or field_str(parent or {}, "Content_Title")
        or field_str(parent or {}, "Hook")
    )


def drain_smv1(request_id: str, test_run_id: str | None, max_runs: int = 8) -> int:
    result = process_smv1_drain(
        production_request_record_id=request_id,
        test_run_id=test_run_id or None,
        photo_workers=8,
        max_followup=max(1, min(max_runs, 20)),
    )
    return int(result.get("processed_count") or 0)


def persist_masters(client: AirtableClient, request_id: str, assets: list[dict[str, Any]]) -> dict[str, Any]:
    return client.update_record(
        PRODUCTION_REQUESTS_TABLE,
        request_id,
        {
            "Studio_Master_Assets_JSON": json.dumps(assets),
            "Studio_Master_Asset_Count": len(assets),
            "Studio_Master_Asset_Status": "Uploading",
            "Studio_Variant_Status": "None",
            "Studio_Variant_Manifest_JSON": None,
            "Studio_Item4_State": "Assets Ready",
            "Updated_At": utc_now(),
        },
        typecast=True,
    )


def apply_caption(client: AirtableClient, parent: dict[str, Any], outputs: list[dict[str, Any]], themes: dict[str, Any]) -> None:
    generated_caption = str(themes.get("post_caption") or "").strip()
    generated_hashtags = str(themes.get("hashtags") or "").strip()
    parent_caption = field_str(parent, "Caption") or generated_caption
    parent_hashtags = field_str(parent, "Hashtags") or generated_hashtags
    if not parent_caption and not parent_hashtags:
        return

    parent_patch: dict[str, Any] = {}
    if generated_caption and not field_str(parent, "Caption"):
        parent_patch["Caption"] = generated_caption
    if generated_hashtags and not field_str(parent, "Hashtags"):
        parent_patch["Hashtags"] = generated_hashtags
    if parent_patch:
        client.update_record(CONTENT_ITEMS_TABLE, parent["id"], parent_patch, typecast=True)

    for output in outputs:
        output_caption = field_str(output, "Output_Caption") or parent_caption
        output_hashtags = field_str(output, "Output_Hashtags") or parent_hashtags
        patch: dict[str, Any] = {}
        canonical_caption = caption_with_hashtags(output_caption, output_hashtags)
        if canonical_caption and canonical_caption != field_str(output, "Output_Caption"):
            patch["Output_Caption"] = canonical_caption
        if output_hashtags and not field_str(output, "Output_Hashtags"):
            patch["Output_Hashtags"] = output_hashtags
        if patch:
            client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], patch, typecast=True)


def apply_voiceover_script(
    client: AirtableClient,
    parent: dict[str, Any],
    themes: dict[str, Any] | None,
    *,
    locked: bool = False,
) -> None:
    # Timed Script / Force exact narration is already on the parent. Theme
    # generation must not replace those words with an AI script.
    if locked:
        return
    script = str((themes or {}).get("voiceover_script") or "").strip()
    if not script or field_str(parent, "Voiceover_URL"):
        return
    client.update_record(
        CONTENT_ITEMS_TABLE,
        parent["id"],
        {
            "Voiceover_Script": script,
            "Script_Status": "Generated",
            "Voiceover_Status": "Ready",
            "Content_Status": "Ready for Voiceover",
        },
        typecast=True,
    )
    parent.setdefault("fields", {})["Voiceover_Script"] = script
    parent["fields"]["Script_Status"] = "Generated"
    parent["fields"]["Voiceover_Status"] = "Ready"
    parent["fields"]["Content_Status"] = "Ready for Voiceover"


def seed_ai_slides(
    client: AirtableClient,
    request: dict[str, Any],
    parent: dict[str, Any],
    slides: list[dict[str, Any]],
    needed: int,
    themes: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    live = [row for row in slides if not field(row, "Deleted From Carousel")]
    covering = [row for row in live if not slide_image_url(row) or not any(
        str(asset.get("carousel_slide_id") or "") == row["id"] for asset in master_assets(request)
    )]
    missing = max(0, needed - len(covering))
    created = []
    title = theme_title(request, parent) or field_str(request, "Production_Request_ID") or "Chicago"
    caption = field_str(request, "Requested_Caption")
    for index in range(missing):
        theme = ((themes or {}).get("slides") or [None])[index] if themes else None
        theme = theme if isinstance(theme, dict) else {}
        number = len(live) + len(created) + 1
        prompt = str(theme.get("image_prompt") or "").strip() or (
            f'Photorealistic Chicago travel photograph for ChicagoShining, complementary to "{title}". '
            + (f"Context: {caption[:400]}" if caption else "")
            + " No logos, no watermarks, no burned-in text."
        )
        fields = {
            "Slide Name": str(theme.get("caption") or f"Studio AI {number}"),
            "Slide Number": number,
            "Current Order": number,
            "AI Prompt": prompt,
            "Image Generation Mode": "Make AI Generated",
            "Image Source": "Make AI Generated",
            "Content Item": [parent["id"]],
        }
        if theme.get("caption"):
            fields["Studio_Slide_Caption"] = theme["caption"]
        created.extend(client.create_records(CAROUSEL_SLIDES_TABLE, [fields], typecast=True))
    if created:
        pin_ids = [row["id"] for row in live + created]
        client.update_record(CONTENT_ITEMS_TABLE, parent["id"], {"Carousel Slides": pin_ids}, typecast=True)
    apply_voiceover_script(client, parent, themes, locked=script_locked(request))
    return live + created


def _ordered_photo_assets(request: dict[str, Any]) -> list[dict[str, Any]] | None:
    """Photo masters in slide order. None when any master is footage."""
    from studio_produce.media import asset_is_video

    assets = master_assets(request)
    if any(asset_is_video(asset) for asset in assets):
        return None
    return sorted(assets, key=lambda item: int(item.get("order") or 0))


def _normalize_label_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _is_placeholder_slide_label(value: str) -> bool:
    return bool(re.fullmatch(r"photo\s*\d+", str(value or "").strip(), flags=re.I))


def _asset_display_name(asset: dict[str, Any]) -> str:
    raw = str(
        asset.get("name")
        or asset.get("file_name")
        or asset.get("filename")
        or asset.get("asset_name")
        or ""
    ).strip()
    if not raw:
        return ""
    phrase = str(parse_filename_metadata(raw).get("filename_phrase") or raw).strip()
    return phrase or raw


def _slide_captions(assets: list[dict[str, Any]], *, title: str = "") -> list[str]:
    """Labels for SAI1 ALREADY COVERED / post-caption featuring lines.

    Prefer operator slide captions, then the real photo filename. Never invent
    "Photo 2" when a library still already has a name — that leaked into
    published captions (Content 329 Roosevelt Island Tram Plan).
    """
    captions = []
    title_key = _normalize_label_key(title)
    for index, asset in enumerate(assets):
        caption = str(asset.get("caption") or "").strip()
        name = _asset_display_name(asset)
        caption_key = _normalize_label_key(caption)
        # Title leaked onto the first still as caption_mode=ai text; use the
        # photo name instead so Featuring lists stills, not the package title.
        if (
            caption
            and not _is_placeholder_slide_label(caption)
            and caption_key
            and caption_key != title_key
        ):
            text = caption
        elif name:
            text = name
        elif caption:
            text = caption
        else:
            text = f"Photo {index + 1}"
        captions.append(text)
    return captions


def ensure_slide_voiceover_timeline(
    client: AirtableClient,
    request: dict[str, Any],
    parent: dict[str, Any],
    themes: dict[str, Any] | None = None,
    *,
    total: int | None = None,
) -> None:
    """Store per-still timing only for explicit per-slide narration.

    Operator timed scripts are left alone. Ordinary continuous narration must
    stay a single TTS track; photo timing is distributed under that measured
    audio. Footage and finished video keep the media file's length.
    """
    from studio_produce.timed_script import (
        SLIDE_VOICEOVER_SOURCE,
        exact_voiceover_text,
        notes_with_timed_script,
        slide_lines_from_themes,
        strip_timed_script_directive,
        timed_script_from_request,
        timeline_from_slide_lines,
    )

    if not parent or not voiceover_required(request, parent):
        return
    if finished_origin_kind((request or {}).get("fields") or {}):
        return
    if field_str(parent, "Voiceover_URL"):
        return
    existing = timed_script_from_request(request)
    if existing and existing.get("source") != SLIDE_VOICEOVER_SOURCE:
        return
    photos = _ordered_photo_assets(request)
    if photos is None:
        return
    intended = max(0, int(total or 0))
    count = max(len(photos), expected_photo_count(request, photos), intended)
    if count < 1:
        return

    # Ordinary narration is one continuous spoken track. Do not manufacture a
    # timed-script scene per photo: when photos outnumber words/sentences that
    # path turns words into isolated TTS clips and empty photo slots into
    # silence (Content 322/325). Timed-script mode is reserved for an operator
    # timed script or an explicit one-line-per-slide narration list.
    raw_slide_voiceovers = (themes or {}).get("slide_voiceovers") if isinstance(themes, dict) else None
    explicit_slide_voiceovers = isinstance(raw_slide_voiceovers, list) and len(raw_slide_voiceovers) == count
    if not explicit_slide_voiceovers:
        if existing and existing.get("source") == SLIDE_VOICEOVER_SOURCE:
            notes = strip_timed_script_directive(field_str(request, "Production_Notes"))
            # The old slide-voiceover path forced the tail to zero. Once that
            # stale auto timeline is removed and narration returns to the
            # continuous-voiceover path, restore the configured/default tail
            # instead of propagating the stale zero into every platform output.
            try:
                restored_tail = float(field(parent, "Voiceover_Tail_Seconds") or 0)
            except (TypeError, ValueError):
                restored_tail = 0.0
            if restored_tail <= 0:
                restored_tail = 2.0
            patch = {
                "Production_Notes": notes,
                "Voiceover_Tail_Seconds": restored_tail,
            }
            client.update_record(
                PRODUCTION_REQUESTS_TABLE,
                request["id"],
                patch,
                typecast=True,
            )
            request.setdefault("fields", {}).update(patch)
        return

    lines = slide_lines_from_themes(themes, count)
    if len(lines) != count:
        return
    timeline = timeline_from_slide_lines(lines, photos)
    if not timeline:
        return
    notes = notes_with_timed_script(field_str(request, "Production_Notes"), timeline)
    client.update_record(
        PRODUCTION_REQUESTS_TABLE,
        request["id"],
        {"Production_Notes": notes, "Voiceover_Tail_Seconds": 0},
        typecast=True,
    )
    request.setdefault("fields", {})["Production_Notes"] = notes
    request["fields"]["Voiceover_Tail_Seconds"] = 0
    joined = exact_voiceover_text(timeline)
    if joined and not field_str(parent, "Voiceover_Script"):
        apply_voiceover_script(client, parent, {"voiceover_script": joined}, locked=False)


def ensure_voiceover_script(client: AirtableClient, request: dict[str, Any], parent: dict[str, Any], themes: dict[str, Any] | None = None) -> dict[str, Any]:
    """SAI1 for voiceover script when uploaded photos skipped themes (caption already set)."""
    parent = enforce_exact_voiceover_script(client, request, parent)
    exact = exact_requested_script(request)
    if exact:
        ensure_slide_voiceover_timeline(client, request, parent, themes)
        return themes or {}
    if field_str(parent, "Voiceover_URL") or field_str(parent, "Voiceover_Script"):
        ensure_slide_voiceover_timeline(client, request, parent, themes)
        return themes or {}
    if themes and str(themes.get("voiceover_script") or "").strip():
        apply_voiceover_script(client, parent, themes)
        ensure_slide_voiceover_timeline(client, request, parent, themes)
        return themes
    from sai1.processor import process_request

    title = theme_title(request, parent)
    if not title:
        raise StepBlocked("No title available for voiceover script")
    photos = _ordered_photo_assets(request) or []
    covered = _slide_captions(photos, title=title)
    result = process_request(
        title=title,
        covered_text="\n".join(f"{index + 1}. {text}" for index, text in enumerate(covered)) or "(none)",
        needed=0,
        total=max(1, len(covered)),
    )
    next_themes = result.get("themes") or {}
    if not str(next_themes.get("voiceover_script") or "").strip():
        raise StepBlocked(result.get("reason") or "SAI1 did not return a voiceover script")
    apply_voiceover_script(client, parent, next_themes)
    ensure_slide_voiceover_timeline(client, request, parent, next_themes, total=max(1, len(covered)))
    return next_themes


def step_themes(client: AirtableClient, ctx: dict[str, Any]) -> str:
    request = ctx["request"]
    parent = ctx["parent"]
    route = source_kind(ctx["job"].get("route"))
    if is_finished(ctx):
        if not parent:
            raise StepBlocked("Finished files need a promoted Content Item before the 3D thumbnail can be generated")
        if not caption_locked(request) and not field_str(parent, "Caption"):
            from sai1.processor import process_request

            title = theme_title(request, parent) or field_str(request, "Production_Request_ID") or "Chicago"
            result = process_request(
                title=title,
                covered_text="(none)",
                needed=0,
                total=1,
            )
            themes = result.get("themes") or {}
            apply_caption(client, parent, ctx["outputs"], themes)
            parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
            ctx["parent"] = parent
        from studio_produce.thumbnail import ensure_platform_thumbnails

        ensure_platform_thumbnails(client, request, parent, ctx.get("outputs") or [])
        ctx["parent"] = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
        return "ingest"
    if not parent:
        if route == "uploaded":
            return "audio"
        raise StepBlocked("Production Request has no promoted Content Item")
    assets = master_assets(request)
    expected = expected_photo_count(request, assets)
    needed = max(0, expected - len(assets)) if route in {"ai", "mixed"} else 0
    parent = enforce_exact_voiceover_script(client, request, parent)
    ctx["parent"] = parent
    need_caption = not caption_locked(request) and not field_str(parent, "Caption")
    need_script = voiceover_required(request, parent) and not field_str(parent, "Voiceover_Script") and not field_str(parent, "Voiceover_URL")
    photos = _ordered_photo_assets(request)
    slide_total = (len(photos) if photos is not None else len(assets)) + needed
    if not needed and not need_caption and not need_script:
        ensure_slide_voiceover_timeline(client, request, parent, total=slide_total)
        return "audio"
    from sai1.processor import process_request

    title = theme_title(request, parent)
    if not title:
        raise StepBlocked("No title available for slide themes")
    covered = _slide_captions(
        photos if photos is not None else sorted(assets, key=lambda item: int(item.get("order") or 0)),
        title=title,
    )
    result = process_request(
        title=title,
        covered_text="\n".join(f"{index + 1}. {text}" for index, text in enumerate(covered)) or "(none)",
        needed=needed,
        total=max(slide_total, len(covered) + needed),
    )
    if needed and not result.get("processed"):
        raise StepBlocked(result.get("reason") or "SAI1 did not return slide themes")
    themes = result.get("themes") or {}
    if needed:
        slides = ctx["slides"]
        ctx["slides"] = seed_ai_slides(client, request, parent, slides, needed, themes)
    else:
        apply_voiceover_script(client, parent, themes, locked=script_locked(request))
    if not caption_locked(request):
        apply_caption(client, parent, ctx["outputs"], themes)
    if script_locked(request):
        parent = enforce_exact_voiceover_script(client, request, parent)
        ctx["parent"] = parent
    ensure_slide_voiceover_timeline(
        client,
        request,
        ctx.get("parent") or parent,
        themes,
        total=max(slide_total, len(covered) + needed),
    )
    if need_script and not field_str(parent, "Voiceover_Script") and not field_str(ctx.get("parent") or parent, "Voiceover_Script"):
        parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
        ctx["parent"] = parent
        if not field_str(parent, "Voiceover_Script"):
            raise StepBlocked("SAI1 did not return a voiceover script")
    return "audio"


def step_audio(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx):
        return "ingest"
    parent = ctx["parent"]
    request = ctx["request"]
    if not parent:
        return "images"
    want_voice = voiceover_required(request, parent)
    want_thumb = thumbnail_required(request, ctx.get("outputs"))
    has_voice = bool(field_str(parent, "Voiceover_URL"))
    has_thumb = is_designed_cover_url(field_str(parent, "Thumbnail_URL"))
    if (not want_voice or has_voice) and (not want_thumb or has_thumb):
        return "images"
    if want_voice and not has_voice:
        # P2 requires Ready for Voiceover + Generated script + Ready VO status.
        parent = rearm_voiceover_parent(client, request, parent)
        ctx["parent"] = parent
        patch = {}
        if want_thumb and not field_str(parent, "Thumbnail_URL") and field_str(parent, "Thumbnail_Status") != "Ready":
            patch["Thumbnail_Status"] = "Ready"
        elif field_str(parent, "Thumbnail_Status") in {"", "Not Started", "None"} and not want_thumb:
            patch["Thumbnail_Status"] = "Not Needed"
        if patch:
            client.update_record(CONTENT_ITEMS_TABLE, parent["id"], patch, typecast=True)
            parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
            ctx["parent"] = parent
    from p2.processor import process_request

    result = process_request(
        content_item_record_id=parent["id"],
        test_run_id=field_str(request, "Test_Run_ID") or None,
    )
    refreshed = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    ctx["parent"] = refreshed
    still_voice = want_voice and not field_str(refreshed, "Voiceover_URL")
    still_thumb = want_thumb and not is_designed_cover_url(field_str(refreshed, "Thumbnail_URL"))
    if still_voice:
        if result.get("processed"):
            raise StepWait("Waiting for voiceover")
        raise StepBlocked(result.get("reason") or "P2 did not generate voiceover")
    if still_thumb:
        # Native grid cover: generate 3D block-letter after VO when P2 skipped thumb.
        from studio_produce.thumbnail import ensure_platform_thumbnails

        try:
            ensure_platform_thumbnails(client, request, refreshed, ctx.get("outputs") or [])
            refreshed = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
            ctx["parent"] = refreshed
        except Exception as exc:
            if result.get("reason") == "no_eligible_p2_route":
                raise StepBlocked(f"Thumbnail required but not generated: {exc}") from exc
            raise StepWait("Waiting for thumbnail")
        if not is_designed_cover_url(field_str(refreshed, "Thumbnail_URL")):
            raise StepWait("Waiting for thumbnail")
    return "images"


def step_images(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx) or source_kind(ctx["job"].get("route")) == "uploaded":
        return "ingest"
    parent = ctx["parent"]
    if not parent:
        return "ingest"
    from carousel.parent import load_linked_slides

    slides = load_linked_slides(client, parent)
    ctx["slides"] = slides
    missing = [row for row in slides if not slide_image_url(row) and not field(row, "Deleted From Carousel")]
    if not missing:
        return "ingest"
    from c2.processor import process_request

    result = process_request(
        content_item_record_id=parent["id"],
        test_run_id=field_str(ctx["request"], "Test_Run_ID") or None,
        trigger_c3=False,
    )
    slides = load_linked_slides(client, parent)
    ctx["slides"] = slides
    still = [row for row in slides if not slide_image_url(row) and not field(row, "Deleted From Carousel")]
    if still:
        if result.get("reason") == "already_running":
            raise StepWait("C2 is already generating images")
        raise StepBlocked(result.get("reason") or f"{len(still)} slide(s) still missing an image URL")
    return "ingest"


def step_ingest(client: AirtableClient, ctx: dict[str, Any]) -> str:
    request = ctx["request"]
    parent = ctx["parent"]
    request_id = ctx["request_id"]
    assets = master_assets(request)
    if is_finished(ctx):
        if not assets:
            raise StepBlocked("Upload the finished file before review")
        upsert_master_queue(client, request_id, assets, test_run_id=field_str(request, "Test_Run_ID"))
        drain_smv1(request_id, field_str(request, "Test_Run_ID"), max_runs=max(2, len(assets) + 2))
        client.update_record(
            PRODUCTION_REQUESTS_TABLE,
            request_id,
            {
                "Studio_Variant_Status": "Not Needed",
                "Studio_Variant_Error": None,
                "Updated_At": utc_now(),
            },
            typecast=True,
        )
        ctx["request"] = client.get_record(PRODUCTION_REQUESTS_TABLE, request_id)
        return "stamp"
    expected = expected_photo_count(request, assets)
    slides = ctx.get("slides") or []
    if parent and not slides:
        from carousel.parent import load_linked_slides

        slides = load_linked_slides(client, parent)
        ctx["slides"] = slides
    next_assets = list(assets)
    for slide in slides:
        if len(next_assets) >= expected > 0:
            break
        url = slide_image_url(slide)
        if not url:
            continue
        if any(str(asset.get("carousel_slide_id") or "") == slide["id"] for asset in next_assets):
            continue
        next_assets.append({
            "id": f"ai{slide['id'].replace('rec', '')[:16]}",
            "order": len(next_assets) + 1,
            "name": f"studio-ai-{len(next_assets) + 1}.jpg",
            "mime_type": "image/jpeg",
            "source_format": "JPG",
            "url": url,
            "source": "studio_ai",
            "carousel_slide_id": slide["id"],
            "caption_mode": "ai",
            "caption": field_str(slide, "Studio_Slide_Caption"),
        })
    if len(next_assets) > len(assets):
        request = persist_masters(client, request_id, next_assets)
        ctx["request"] = request
        assets = next_assets
    if expected and len(assets) < expected:
        waiting = [row for row in slides if not slide_image_url(row)]
        if waiting:
            raise StepWait(f"Waiting for {expected - len(assets)} AI image(s) before ingest")
        raise StepBlocked(f"Need {expected} source photo(s); only {len(assets)} ingested")
    if assets:
        upsert_master_queue(client, request_id, assets, test_run_id=field_str(request, "Test_Run_ID"))
        drain_smv1(request_id, field_str(request, "Test_Run_ID"), max_runs=max(2, len(assets) + 2))
        request = reconcile_master_authority(client, request_id, client.get_record(PRODUCTION_REQUESTS_TABLE, request_id))
        ctx["request"] = request
    return "queue_crops"


def step_queue_crops(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx):
        return "stamp"
    request_id = ctx["request_id"]
    request = reconcile_master_authority(client, request_id, client.get_record(PRODUCTION_REQUESTS_TABLE, request_id))
    ctx["request"] = request
    assets = master_assets(request)
    if not assets:
        raise StepBlocked("No Studio master photos to crop")
    missing = [
        asset for asset in assets
        if not str(asset.get("google_drive_file_id") or "").strip() or not str(asset.get("media_asset_record_id") or "").strip()
    ]
    if missing:
        upsert_master_queue(client, request_id, assets, test_run_id=field_str(request, "Test_Run_ID"))
        drained = drain_smv1(request_id, field_str(request, "Test_Run_ID"), max_runs=max(2, len(missing) + 2))
        request = reconcile_master_authority(client, request_id, client.get_record(PRODUCTION_REQUESTS_TABLE, request_id))
        ctx["request"] = request
        assets = master_assets(request)
        missing = [
            asset for asset in assets
            if not str(asset.get("google_drive_file_id") or "").strip() or not str(asset.get("media_asset_record_id") or "").strip()
        ]
        if missing:
            if drained:
                raise StepWait(f"{len(missing)} master(s) still missing Drive authority")
            raise StepBlocked(f"{missing[0].get('name') or 'Master photo'} is missing Drive authority")
    plan = parse_json(field(request, "Studio_Output_Plan_JSON"), {}) or {}
    ratios = required_ratios(plan)
    upsert_variant_queue(
        client,
        request_id,
        assets,
        ratios,
        test_run_id=field_str(request, "Test_Run_ID"),
        plan=plan,
    )
    from studio_produce.context import load_queue_rows

    rows = load_queue_rows(client, request_id)
    manifest = rebuild_variant_manifest(request_id, assets, ratios, rows, plan=plan)
    persist_variant_manifest(client, request_id, manifest)
    ctx["request"] = client.get_record(PRODUCTION_REQUESTS_TABLE, request_id)
    return "crops"


def step_crops(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx):
        return "stamp"
    from studio_produce.context import load_queue_rows

    request_id = ctx["request_id"]
    request = ctx["request"]
    assets = master_assets(request)
    plan = parse_json(field(request, "Studio_Output_Plan_JSON"), {}) or {}
    ratios = required_ratios(plan)
    drain_smv1(request_id, field_str(request, "Test_Run_ID"), max_runs=8)
    rows = load_queue_rows(client, request_id)
    manifest = rebuild_variant_manifest(request_id, assets, ratios, rows, plan=plan)
    persist_variant_manifest(client, request_id, manifest)
    ctx["request"] = client.get_record(PRODUCTION_REQUESTS_TABLE, request_id)
    ready = int(manifest.get("plan_ready_count") or 0)
    target = int(manifest.get("plan_target_count") or 0)
    if manifest.get("plan_complete") or (target and ready >= target):
        return "stamp"
    outstanding = outstanding_count(rows)
    if outstanding:
        raise StepWait(f"Cropping {ready}/{target or manifest.get('target_count') or 0}")
    raise StepBlocked("Platform crops finished without a complete plan-ready manifest")


def step_stamp(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if not ctx.get("outputs"):
        raise StepBlocked("No Platform Outputs found for this Production Request")
    if is_finished(ctx) and finished_origin_kind((ctx.get("request") or {}).get("fields") or ctx.get("request") or {}) == "finished-video":
        from studio_produce.public_preview import ensure_finished_preview_masters

        ctx["request"] = ensure_finished_preview_masters(client, ctx["request"])
    cover_only = all(_output_file_ready(row) for row in ctx["outputs"])
    if ctx.get("parent") and (
        is_finished(ctx)
        or thumbnail_required(ctx["request"], ctx.get("outputs"))
        or any(_output_missing_review_cover(row) for row in ctx["outputs"])
    ):
        from studio_produce.thumbnail import ensure_platform_thumbnails

        ensure_platform_thumbnails(client, ctx["request"], ctx["parent"], ctx.get("outputs") or [])
        ctx["parent"] = client.get_record(CONTENT_ITEMS_TABLE, ctx["parent"]["id"])
        ctx["outputs"] = [client.get_record(PLATFORM_OUTPUTS_TABLE, row["id"]) for row in ctx["outputs"]]
    if cover_only:
        if any(_output_missing_review_cover(row) for row in ctx["outputs"]):
            raise StepWait("Waiting for thumbnail")
        return "done"
    result = stamp_outputs(client, ctx["request"], ctx["outputs"], ctx["parent"])
    if result["missing"]:
        raise StepBlocked(f"{len(result['missing'])} output(s) are missing a complete source package")
    if is_finished(ctx):
        return "done"
    return "render"


def _output_file_ready(output: dict[str, Any]) -> bool:
    status = field_str(output, "Output_Status")
    if status in {"Ready for Review", "Approved for Publishing", "Published"}:
        if field_str(output, "Final_File_URL") or field_str(output, "Studio_Preview_URL"):
            return True
        if field_str(output, "Render_Status") == "Native Photo Route":
            return True
    return False


def _output_missing_review_cover(output: dict[str, Any]) -> bool:
    if not needs_grid_cover(output):
        return False
    return not is_designed_cover_url(field_str(output, "Thumbnail_URL"))


def _output_ready(output: dict[str, Any]) -> bool:
    return _output_file_ready(output)


def render_progress_detail(outputs: list[dict[str, Any]] | None = None) -> str:
    rows = [row for row in (outputs or []) if row]
    total = len(rows)
    if total <= 0:
        return "Rendering"
    ready = sum(1 for row in rows if _output_ready(row))
    return f"Rendering {ready}/{total}"


def _is_transient_render_error(exc: BaseException) -> bool:
    text = str(exc or "").lower()
    needles = (
        "timed out",
        "timeout",
        "temporarily unavailable",
        "connection reset",
        "connection aborted",
        "remote disconnected",
        "connectionpool",
        "read timed out",
        "503",
        "502",
        "504",
    )
    return any(n in text for n in needles)


def _is_delay_render_failure(output: dict[str, Any]) -> bool:
    text = " ".join(
        (
            field_str(output, "Remotion_Error_Message"),
            field_str(output, "Final_File_Error_Message"),
        )
    ).lower()
    needles = (
        "delayrender",
        "delay-render",
        "request closed",
        "could not extract frame",
        "exit code 1",
    )
    return any(needle in text for needle in needles)


def _requeue_failed_render(client: AirtableClient, output_id: str) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output_id,
        {
            "Render_Status": "Ready for Render",
            "Remotion_Job_ID": "",
            "Remotion_Status_URL": "",
            "Remotion_Error_Message": "",
            "Final_File_Error_Message": "",
            "Remotion_Props_JSON": "",
        },
        typecast=True,
    )


def step_render(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx):
        return "done"
    from r3.processor import process_one as process_r3
    from r4.processor import process_one as process_r4
    from r5.processor import process_one as process_r5
    from t1.processor import process_one as process_t1
    from lettering.processor import process_one as process_letter

    if not ctx.get("outputs"):
        raise StepBlocked("No Platform Outputs found for this Production Request")
    if voiceover_missing(ctx["request"], ctx.get("parent")):
        # R4 refuses to start without narration. Generate it here instead of
        # looping on "Rendering 0/N" with no Remotion job.
        run_voiceover_p2(client, ctx)
    copy_voiceover_to_outputs(client, ctx.get("parent") or {}, ctx["outputs"])
    from studio_produce.shared_render import (
        build_shared_render_plan,
        propagate_render_result,
        sort_outputs_for_shared_render,
    )

    test_run_id = field_str(ctx["request"], "Test_Run_ID") or None
    shared_plan = build_shared_render_plan(ctx["outputs"])
    ordered_outputs = sort_outputs_for_shared_render(ctx["outputs"], shared_plan)
    remaining = []
    transient = False
    started_r4 = False
    busy_rendering = any(
        field_str(row, "Render_Status").lower() == "rendering" and field_str(row, "Remotion_Job_ID")
        for row in ctx["outputs"]
    )
    for output in ordered_outputs:
        fresh = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
        meta = shared_plan.get(fresh["id"], {"role": "solo", "canonical_id": fresh["id"], "sibling_ids": []})
        if meta.get("role") == "sibling":
            canonical = client.get_record(PLATFORM_OUTPUTS_TABLE, meta["canonical_id"])
            if _output_ready(fresh):
                continue
            if _output_ready(canonical):
                propagate_render_result(client, canonical, [fresh["id"]])
                continue
            remaining.append(fresh["id"])
            continue
        if _output_ready(fresh):
            if meta.get("role") == "canonical" and meta.get("sibling_ids"):
                propagate_render_result(client, fresh, meta["sibling_ids"])
            continue
        render_status = field_str(fresh, "Render_Status")
        native = is_native_photo(
            field_str(fresh, "Platform"),
            field_str(fresh, "Studio_Output_Type") or field_str(fresh, "Output_Type"),
            field_str(fresh, "Platform_Output_Type"),
        )
        try:
            if native or render_status == "Native Photo Route":
                if render_status != "Native Photo Route":
                    remaining.append(fresh["id"])
                    continue
                process_letter(output_record_id=fresh["id"], test_run_id=test_run_id)
                if field_str(fresh, "Output_Status") != "Ready for Review":
                    client.update_record(
                        PLATFORM_OUTPUTS_TABLE,
                        fresh["id"],
                        {"Output_Status": "Ready for Review", "Render_Status": "Native Photo Route"},
                        typecast=True,
                    )
                continue
            # Failed + Remotion_Job_ID usually means harvest timed out after Remotion
            # already finished — keep polling R5 instead of abandoning the package.
            if render_status.lower() in {"rendering", "failed"} and field_str(fresh, "Remotion_Job_ID"):
                if render_status.lower() == "failed" and _is_delay_render_failure(fresh):
                    _requeue_failed_render(client, fresh["id"])
                    remaining.append(fresh["id"])
                    continue
                result = process_r5(output_record_id=fresh["id"], test_run_id=test_run_id)
                harvested = client.get_record(PLATFORM_OUTPUTS_TABLE, fresh["id"])
                if result.get("processed") and _output_ready(harvested):
                    if meta.get("role") == "canonical" and meta.get("sibling_ids"):
                        propagate_render_result(client, harvested, meta["sibling_ids"])
                    continue
                if field_str(harvested, "Render_Status").lower() == "failed" and _is_delay_render_failure(harvested):
                    _requeue_failed_render(client, harvested["id"])
                    remaining.append(harvested["id"])
                    continue
                remaining.append(fresh["id"])
                continue
            if render_status == "Ready for Render":
                if busy_rendering or started_r4:
                    remaining.append(fresh["id"])
                    continue
                timing = field_str(fresh, "Timing_Status")
                if timing not in {"Ready", "Skipped"}:
                    process_t1(output_record_id=fresh["id"], test_run_id=test_run_id)
                r4 = process_r4(output_record_id=fresh["id"], test_run_id=test_run_id) or {}
                if r4.get("processed"):
                    started_r4 = True
                    busy_rendering = True
                elif r4.get("reason") == "waiting_for_voiceover":
                    raise StepWait("Waiting for voiceover")
                remaining.append(fresh["id"])
                continue
            if field_str(fresh, "Asset_Selection_Status") == "Selected" and not render_status:
                process_r3(output_record_id=fresh["id"], test_run_id=test_run_id)
                process_t1(output_record_id=fresh["id"], test_run_id=test_run_id)
                process_r4(output_record_id=fresh["id"], test_run_id=test_run_id)
                remaining.append(fresh["id"])
                continue
            remaining.append(fresh["id"])
        except Exception as exc:
            if _is_transient_render_error(exc):
                transient = True
                remaining.append(fresh["id"])
                continue
            raise
    ctx["outputs"] = [client.get_record(PLATFORM_OUTPUTS_TABLE, row["id"]) for row in ctx["outputs"]]
    if all(_output_file_ready(row) for row in ctx["outputs"]):
        if any(_output_missing_review_cover(row) for row in ctx["outputs"]) and ctx.get("parent"):
            from studio_produce.thumbnail import ensure_platform_thumbnails

            ensure_platform_thumbnails(client, ctx["request"], ctx["parent"], ctx.get("outputs") or [])
            ctx["parent"] = client.get_record(CONTENT_ITEMS_TABLE, ctx["parent"]["id"])
            ctx["outputs"] = [client.get_record(PLATFORM_OUTPUTS_TABLE, row["id"]) for row in ctx["outputs"]]
        if not any(_output_missing_review_cover(row) for row in ctx["outputs"]):
            return "done"
    if remaining or transient:
        raise StepWait(render_progress_detail(ctx["outputs"]))
    raise StepBlocked("Outputs are stamped but none are eligible for R3/R4/letter")


STEP_HANDLERS = {
    "themes": step_themes,
    "audio": step_audio,
    "images": step_images,
    "ingest": step_ingest,
    "queue_crops": step_queue_crops,
    "crops": step_crops,
    "stamp": step_stamp,
    "render": step_render,
}
