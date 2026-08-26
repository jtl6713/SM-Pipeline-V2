from __future__ import annotations

import json
import logging
from typing import Any

from airtable.client import AirtableClient
from studio_produce.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE, PRODUCTION_REQUESTS_TABLE
from item4.processor import process_one as process_smv1
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


def voiceover_required(request: dict[str, Any], parent: dict[str, Any] | None) -> bool:
    status = field_str(parent or {}, "Voiceover_Status")
    if status in {"Not Needed", "Skipped"}:
        return False
    return directive_yes(field_str(request, "Voiceover_Mode"))


def thumbnail_required(request: dict[str, Any]) -> bool:
    return field_str(request, "Thumbnail_Mode") not in {"No", "Use Photo Frame", "Photo Frame"}


def pick_resume_step(request: dict[str, Any], outputs: list[dict[str, Any]] | None = None) -> str:
    rows = outputs or []
    if rows and all(_output_ready(row) for row in rows):
        return "done"
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
    processed = 0
    for _ in range(max(1, min(max_runs, 20))):
        result = process_smv1(
            production_request_record_id=request_id,
            test_run_id=test_run_id or None,
        )
        if not result.get("processed"):
            break
        processed += 1
    return processed


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
    caption = str(themes.get("post_caption") or "").strip()
    if not caption or field_str(parent, "Caption"):
        return
    fields = {"Caption": caption}
    hashtags = str(themes.get("hashtags") or "").strip()
    if hashtags and not field_str(parent, "Hashtags"):
        fields["Hashtags"] = hashtags
    client.update_record(CONTENT_ITEMS_TABLE, parent["id"], fields, typecast=True)
    for output in outputs:
        if field_str(output, "Output_Caption"):
            continue
        patch = {"Output_Caption": caption}
        if hashtags and not field_str(output, "Output_Hashtags"):
            patch["Output_Hashtags"] = hashtags
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], patch, typecast=True)


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
    script = str((themes or {}).get("voiceover_script") or "").strip()
    if script and not field_str(parent, "Voiceover_URL"):
        client.update_record(
            CONTENT_ITEMS_TABLE,
            parent["id"],
            {"Voiceover_Script": script, "Script_Status": "Generated"},
            typecast=True,
        )
    return live + created


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
        from studio_produce.thumbnail import ensure_finished_thumbnail

        ensure_finished_thumbnail(client, request, parent, ctx.get("outputs") or [])
        ctx["parent"] = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
        return "ingest"
    if not parent:
        if route == "uploaded":
            return "audio"
        raise StepBlocked("Production Request has no promoted Content Item")
    assets = master_assets(request)
    expected = expected_photo_count(request, assets)
    needed = max(0, expected - len(assets)) if route in {"ai", "mixed"} else 0
    need_caption = not caption_locked(request) and not field_str(parent, "Caption")
    if not needed and not need_caption:
        return "audio"
    from sai1.processor import process_request

    title = theme_title(request, parent)
    if not title:
        raise StepBlocked("No title available for slide themes")
    covered = [
        str(asset.get("caption") or "").strip()
        for asset in sorted(assets, key=lambda item: int(item.get("order") or 0))
        if str(asset.get("caption") or "").strip()
    ]
    result = process_request(
        title=title,
        covered_text="\n".join(f"{index + 1}. {text}" for index, text in enumerate(covered)) or "(none)",
        needed=needed,
        total=len(covered) + needed,
    )
    if needed and not result.get("processed"):
        raise StepBlocked(result.get("reason") or "SAI1 did not return slide themes")
    themes = result.get("themes") or {}
    if needed:
        slides = ctx["slides"]
        ctx["slides"] = seed_ai_slides(client, request, parent, slides, needed, themes)
    if not caption_locked(request):
        apply_caption(client, parent, ctx["outputs"], themes)
    return "audio"


def step_audio(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx):
        return "ingest"
    parent = ctx["parent"]
    request = ctx["request"]
    if not parent:
        return "images"
    want_voice = voiceover_required(request, parent)
    want_thumb = thumbnail_required(request)
    has_voice = bool(field_str(parent, "Voiceover_URL"))
    has_thumb = bool(field_str(parent, "Thumbnail_URL"))
    if (not want_voice or has_voice) and (not want_thumb or has_thumb):
        return "images"
    from p2.processor import process_request

    result = process_request(
        content_item_record_id=parent["id"],
        test_run_id=field_str(request, "Test_Run_ID") or None,
    )
    refreshed = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    ctx["parent"] = refreshed
    still_voice = want_voice and not field_str(refreshed, "Voiceover_URL")
    still_thumb = want_thumb and not field_str(refreshed, "Thumbnail_URL")
    if still_voice or still_thumb:
        if result.get("processed"):
            raise StepWait("Waiting for voiceover or thumbnail")
        # P2 has no work when VO is Not Needed and the 3D cover is not staged.
        # Blocking here left 268-273 on fake Rendering with no Remotion job.
        if result.get("reason") == "no_eligible_p2_route":
            return "images"
        raise StepBlocked(result.get("reason") or "P2 did not generate voiceover or thumbnail")
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
    )
    from studio_produce.context import load_queue_rows

    rows = load_queue_rows(client, request_id)
    manifest = rebuild_variant_manifest(request_id, assets, ratios, rows)
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
    manifest = rebuild_variant_manifest(request_id, assets, ratios, rows)
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
    if is_finished(ctx) and ctx.get("parent"):
        from studio_produce.thumbnail import ensure_finished_thumbnail

        ensure_finished_thumbnail(client, ctx["request"], ctx["parent"], ctx.get("outputs") or [])
        ctx["parent"] = client.get_record(CONTENT_ITEMS_TABLE, ctx["parent"]["id"])
    result = stamp_outputs(client, ctx["request"], ctx["outputs"], ctx["parent"])
    if result["missing"]:
        raise StepBlocked(f"{len(result['missing'])} output(s) are missing a complete source package")
    if is_finished(ctx):
        return "done"
    return "render"


def _output_ready(output: dict[str, Any]) -> bool:
    status = field_str(output, "Output_Status")
    if status in {"Ready for Review", "Approved for Publishing", "Published"}:
        if field_str(output, "Final_File_URL") or field_str(output, "Studio_Preview_URL"):
            return True
        if field_str(output, "Render_Status") == "Native Photo Route":
            return True
    return False


def step_render(client: AirtableClient, ctx: dict[str, Any]) -> str:
    if is_finished(ctx):
        return "done"
    from r3.processor import process_one as process_r3
    from r4.processor import process_one as process_r4
    from r5.processor import process_one as process_r5
    from lettering.processor import process_one as process_letter

    if not ctx.get("outputs"):
        raise StepBlocked("No Platform Outputs found for this Production Request")
    test_run_id = field_str(ctx["request"], "Test_Run_ID") or None
    remaining = []
    for output in ctx["outputs"]:
        fresh = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
        if _output_ready(fresh):
            continue
        render_status = field_str(fresh, "Render_Status")
        native = is_native_photo(
            field_str(fresh, "Platform"),
            field_str(fresh, "Studio_Output_Type") or field_str(fresh, "Output_Type"),
            field_str(fresh, "Platform_Output_Type"),
        )
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
        if render_status.lower() == "rendering" and field_str(fresh, "Remotion_Job_ID"):
            result = process_r5(output_record_id=fresh["id"], test_run_id=test_run_id)
            if result.get("processed") and _output_ready(client.get_record(PLATFORM_OUTPUTS_TABLE, fresh["id"])):
                continue
            remaining.append(fresh["id"])
            continue
        if render_status == "Ready for Render":
            process_r4(output_record_id=fresh["id"], test_run_id=test_run_id)
            remaining.append(fresh["id"])
            continue
        if field_str(fresh, "Asset_Selection_Status") == "Selected" and not render_status:
            process_r3(output_record_id=fresh["id"], test_run_id=test_run_id)
            process_r4(output_record_id=fresh["id"], test_run_id=test_run_id)
            remaining.append(fresh["id"])
            continue
        remaining.append(fresh["id"])
    ctx["outputs"] = [client.get_record(PLATFORM_OUTPUTS_TABLE, row["id"]) for row in ctx["outputs"]]
    if all(_output_ready(row) for row in ctx["outputs"]):
        return "done"
    if remaining:
        raise StepWait(f"Rendering {len(ctx['outputs']) - len(remaining)}/{len(ctx['outputs'])}")
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
