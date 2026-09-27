from __future__ import annotations

from typing import TYPE_CHECKING, Any

from item4.constants import VARIANT_RECIPE_VERSION
from item4.formulas import queue_row_is_outstanding
from render.fields import field, field_str
from studio_produce.constants import (
    MEDIA_TRANSFER_QUEUE_TABLE,
    PIPELINE_SETTINGS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
    RATIO_SPECS,
    VARIANT_RECIPE,
)
from studio_produce.job import parse_json, utc_now
from studio_produce.media import asset_is_video, playable_url

if TYPE_CHECKING:
    from airtable.client import AirtableClient


def pipeline_setting(client: AirtableClient, name: str) -> str:
    escaped = name.replace("\\", "\\\\").replace("'", "\\'")
    rows = client.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula=f"AND({{Active}}=1,{{Setting_Name}}='{escaped}')",
        max_records=1,
    )
    if not rows:
        return ""
    return str(rows[0].get("fields", {}).get("Setting_Value") or "").strip()


def plan_ratios(plan: dict[str, Any] | None) -> list[str]:
    items = plan.get("items") if isinstance(plan, dict) else []
    ratios: list[str] = []
    for item in items or []:
        ratio = str((item or {}).get("aspect_ratio") or "").strip()
        if ratio and ratio not in ratios:
            ratios.append(ratio)
    if "9:16" not in ratios:
        ratios.insert(0, "9:16")
    return ratios


def cover_extra_ratios(plan: dict[str, Any] | None) -> list[str]:
    extras: list[str] = []
    items = plan.get("items") if isinstance(plan, dict) else []
    platforms = [str((item or {}).get("platform") or "") for item in (items or [])]
    if any(name.lower() == "youtube" for name in platforms) and "16:9" not in plan_ratios(plan):
        extras.append("16:9")
    return extras


def required_ratios(plan: dict[str, Any] | None) -> list[str]:
    ratios = plan_ratios(plan)
    for extra in cover_extra_ratios(plan):
        if extra not in ratios:
            ratios.append(extra)
    return ratios


def cover_hero_asset(assets: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not assets:
        return None
    return sorted(assets, key=lambda asset: int(asset.get("order") or 0))[0]


def ratios_for_asset(
    plan: dict[str, Any] | None,
    asset: dict[str, Any],
    assets: list[dict[str, Any]],
) -> list[str]:
    planned = plan_ratios(plan)
    extras = [ratio for ratio in cover_extra_ratios(plan) if ratio not in planned]
    hero = cover_hero_asset(assets)
    is_hero = bool(hero and str(asset.get("id") or "") == str(hero.get("id") or ""))
    if is_hero:
        return [*planned, *extras]
    return planned


def variant_transfer_id(request_id: str, asset_id: str, ratio: str) -> str:
    return f"ITEM4-VARIANT-{VARIANT_RECIPE}-{request_id}-{asset_id}-{ratio.replace(':', 'x')}"


def master_transfer_id(request_id: str, asset_id: str) -> str:
    return f"ITEM4-MASTER-{request_id}-{asset_id}"


def upsert_master_queue(client: AirtableClient, request_id: str, assets: list[dict[str, Any]], *, test_run_id: str = "") -> int:
    folder = pipeline_setting(client, "STUDIO_MASTER_DRIVE_FOLDER_ID")
    if not folder:
        raise RuntimeError("STUDIO_MASTER_DRIVE_FOLDER_ID is not configured")
    existing = {
        field_str(row, "Transfer_ID"): row
        for row in client.list_records(
            MEDIA_TRANSFER_QUEUE_TABLE,
            formula=f'AND({{Production_Request_Record_ID}}="{request_id}",{{Asset_Kind}}="Master Original")',
            max_records=100,
        )
    }
    created = 0
    for asset in assets:
        if str(asset.get("google_drive_file_id") or "").strip() and str(asset.get("media_asset_record_id") or "").strip():
            continue
        source_url = str(asset.get("url") or "").strip()
        r2_key = str(asset.get("r2_key") or "").strip()
        if not source_url and not r2_key:
            continue
        transfer_id = master_transfer_id(request_id, str(asset.get("id")))
        fields = {
            "Transfer_ID": transfer_id,
            "Production_Request_Record_ID": request_id,
            "Test_Run_ID": test_run_id or None,
            "Asset_Kind": "Master Original",
            "Source_Asset_ID": str(asset.get("id")),
            "Source_Name": str(asset.get("name") or "photo"),
            "Source_R2_Key": r2_key or None,
            "Source_URL": source_url,
            "Source_MIME_Type": str(asset.get("mime_type") or "image/jpeg"),
            "Source_Extension": str(asset.get("source_format") or "jpg").lower(),
            "Source_Order": int(asset.get("order") or 0) or None,
            "Target_Drive_Folder_ID": folder,
            "Target_File_Name": str(asset.get("name") or "photo.jpg"),
            "Transfer_Status": "Pending",
            "Preview_Status": "Pending",
        }
        current = existing.get(transfer_id)
        if current:
            status = field_str(current, "Transfer_Status")
            if status not in {"Ready", "Drive Uploaded", "Processing"}:
                client.update_record(MEDIA_TRANSFER_QUEUE_TABLE, current["id"], fields, typecast=True)
                created += 1
            continue
        client.create_records(MEDIA_TRANSFER_QUEUE_TABLE, [fields], typecast=True)
        created += 1
    return created


def upsert_variant_queue(
    client: AirtableClient,
    request_id: str,
    assets: list[dict[str, Any]],
    ratios: list[str],
    *,
    test_run_id: str = "",
    plan: dict[str, Any] | None = None,
) -> int:
    folder = pipeline_setting(client, "STUDIO_VARIANT_DRIVE_FOLDER_ID")
    if not folder:
        raise RuntimeError("STUDIO_VARIANT_DRIVE_FOLDER_ID is not configured")
    existing = {
        field_str(row, "Transfer_ID"): row
        for row in client.list_records(
            MEDIA_TRANSFER_QUEUE_TABLE,
            formula=f'AND({{Production_Request_Record_ID}}="{request_id}",{{Asset_Kind}}="Platform Variant")',
            max_records=100,
        )
    }
    creates: list[dict[str, Any]] = []
    updates: list[dict[str, Any]] = []
    for asset in assets:
        if asset_is_video(asset):
            continue
        drive_id = str(asset.get("source_google_drive_file_id") or asset.get("google_drive_file_id") or "").strip()
        media_id = str(asset.get("media_asset_record_id") or "").strip()
        if not drive_id or not media_id:
            raise RuntimeError(f"{asset.get('name') or 'Master photo'} is missing Drive authority")
        asset_ratios = ratios_for_asset(plan, asset, assets) if plan is not None else ratios
        for ratio in asset_ratios:
            spec = RATIO_SPECS.get(ratio)
            if not spec:
                continue
            transfer_id = variant_transfer_id(request_id, str(asset.get("id")), ratio)
            filename = f"{str(asset.get('name') or 'photo').rsplit('.', 1)[0]}__{ratio.replace(':', 'x')}__{VARIANT_RECIPE}.jpg"
            fields = {
                "Transfer_ID": transfer_id,
                "Production_Request_Record_ID": request_id,
                "Test_Run_ID": test_run_id or None,
                "Asset_Kind": "Platform Variant",
                "Source_Asset_ID": str(asset.get("id")),
                "Source_Name": str(asset.get("name") or "photo"),
                "Source_MIME_Type": str(asset.get("mime_type") or "image/jpeg"),
                "Source_Extension": str(asset.get("source_format") or "jpg").lower(),
                "Source_Order": int(asset.get("order") or 0) or None,
                "Aspect_Ratio": ratio,
                "Width": spec["width"],
                "Height": spec["height"],
                "Target_Drive_Folder_ID": folder,
                "Target_File_Name": filename,
                "Source_Drive_File_ID": drive_id,
                "Source_Media_Asset": [media_id],
                "Variant_Style": "center",
                "Transfer_Status": "Pending",
                "Preview_Status": "Pending",
            }
            current = existing.get(transfer_id)
            if current:
                status = field_str(current, "Transfer_Status")
                if status not in {"Ready", "Drive Uploaded", "Processing"}:
                    updates.append({"id": current["id"], "fields": fields})
                continue
            creates.append(fields)
    keep = set()
    for asset in assets:
        asset_ratios = ratios_for_asset(plan, asset, assets) if plan is not None else ratios
        for ratio in asset_ratios:
            keep.add(variant_transfer_id(request_id, str(asset.get("id")), ratio))
    drops: list[dict[str, Any]] = []
    for transfer_id, row in existing.items():
        if transfer_id in keep:
            continue
        status = field_str(row, "Transfer_Status")
        if status not in {"Pending", "Processing"}:
            continue
        drops.append(
            {
                "id": row["id"],
                "fields": {
                    "Transfer_Status": "Error",
                    "Error_Message": "Dropped — this ratio is not required for the current plan or cover.",
                },
            }
        )
    if updates:
        client.update_records(MEDIA_TRANSFER_QUEUE_TABLE, updates, typecast=True)
    if creates:
        client.create_records(MEDIA_TRANSFER_QUEUE_TABLE, creates, typecast=True)
    if drops:
        client.update_records(MEDIA_TRANSFER_QUEUE_TABLE, drops, typecast=True)
    return len(creates) + len(updates)


def outstanding_count(rows: list[dict[str, Any]]) -> int:
    return sum(1 for row in rows if queue_row_is_outstanding(row.get("fields") or {}))


def rebuild_variant_manifest(
    request_id: str,
    assets: list[dict[str, Any]],
    ratios: list[str],
    queue_rows: list[dict[str, Any]],
    plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    by_transfer = {field_str(row, "Transfer_ID"): row for row in queue_rows}
    plan_list = plan_ratios(plan) if plan is not None else [ratio for ratio in ratios if ratio != "16:9"] or list(ratios)
    extras = [ratio for ratio in (cover_extra_ratios(plan) if plan is not None else ratios) if ratio not in plan_list]
    hero = cover_hero_asset(assets)
    manifest = {
        "schema_version": "item4.variant-manifest.2",
        "recipe_version": VARIANT_RECIPE_VERSION,
        "production_request_record_id": request_id,
        "authoritative_storage": "google_drive",
        "source_asset_count": len(assets),
        "required_ratios": ratios,
        "plan_ratios": plan_list,
        "target_count": 0,
        "plan_target_count": len(assets) * max(1, len(plan_list)),
        "ready_count": 0,
        "plan_ready_count": 0,
        "assets": [],
        "plan_complete": False,
        "complete": False,
    }
    for asset in assets:
        is_hero = bool(hero and str(asset.get("id") or "") == str(hero.get("id") or ""))
        asset_ratios = [*plan_list, *(extras if is_hero else [])]
        manifest["target_count"] += len(asset_ratios)
        row = {
            "id": asset.get("id"),
            "order": asset.get("order"),
            "name": asset.get("name"),
            "google_drive_file_id": asset.get("google_drive_file_id"),
            "media_asset_record_id": asset.get("media_asset_record_id"),
            "preview_url": asset.get("url"),
            "caption": asset.get("caption") or "",
            "variants": {},
        }
        for ratio in asset_ratios:
            if asset_is_video(asset):
                media_id = str(asset.get("media_asset_record_id") or "").strip()
                drive_id = str(asset.get("google_drive_file_id") or "").strip()
                if not media_id.startswith("rec") or not drive_id:
                    continue
                playable = playable_url(asset) or playable_url(row)
                spec = RATIO_SPECS[ratio]
                row["media_kind"] = "video"
                row["variants"][ratio] = {
                    "aspect_ratio": ratio,
                    "recipe_version": "video-passthrough",
                    "media_kind": "video",
                    "width": spec["width"],
                    "height": spec["height"],
                    "google_drive_file_id": drive_id,
                    "google_drive_url": str(asset.get("google_drive_url") or "").strip() or (
                        f"https://drive.google.com/file/d/{drive_id}/view" if drive_id else ""
                    ),
                    "media_asset_record_id": media_id,
                    "preview_url": playable or f"/api/media-assets/{media_id}/stream",
                    "preview_status": "Ready",
                    "file_name": str(asset.get("name") or "clip.mp4"),
                    "duration_seconds": asset.get("duration_seconds"),
                    "in_seconds": asset.get("in_seconds") or 0,
                    "out_seconds": asset.get("out_seconds"),
                }
                manifest["ready_count"] += 1
                if ratio in plan_list:
                    manifest["plan_ready_count"] += 1
                continue
            transfer_id = variant_transfer_id(request_id, str(asset.get("id")), ratio)
            queue = by_transfer.get(transfer_id)
            if not queue or field_str(queue, "Transfer_Status") != "Ready":
                continue
            drive_id = field_str(queue, "Drive_File_ID") or field_str(queue, "Source_Drive_File_ID")
            media_links = field(queue, "Source_Media_Asset") or field(queue, "Media_Asset") or []
            media_id = media_links[0] if isinstance(media_links, list) and media_links else ""
            preview_ready = field_str(queue, "Preview_Status") == "Ready"
            preview_url = field_str(queue, "Preview_URL") if preview_ready else ""
            if not drive_id or not media_id or not preview_url:
                continue
            spec = RATIO_SPECS[ratio]
            row["variants"][ratio] = {
                "aspect_ratio": ratio,
                "recipe_version": VARIANT_RECIPE,
                "width": spec["width"],
                "height": spec["height"],
                "google_drive_file_id": drive_id,
                "google_drive_url": field_str(queue, "Drive_URL") or f"https://drive.google.com/file/d/{drive_id}/view",
                "media_asset_record_id": media_id,
                "preview_url": preview_url,
                "preview_status": "Ready",
                "file_name": field_str(queue, "Target_File_Name"),
            }
            manifest["ready_count"] += 1
            if ratio in plan_list:
                manifest["plan_ready_count"] += 1
        manifest["assets"].append(row)
    plan_target = int(manifest["plan_target_count"] or 0)
    manifest["plan_complete"] = plan_target > 0 and int(manifest["plan_ready_count"] or 0) >= plan_target
    manifest["complete"] = int(manifest["ready_count"] or 0) >= int(manifest["target_count"] or 0)
    return manifest


def persist_variant_manifest(
    client: AirtableClient,
    request_id: str,
    manifest: dict[str, Any],
    *,
    error: str | None = None,
) -> dict[str, Any]:
    import json

    status = "Preparing"
    if error:
        status = "Error"
    elif manifest.get("plan_complete") or manifest.get("complete"):
        status = "Ready"
    media_ids = []
    for asset in manifest.get("assets") or []:
        for variant in (asset.get("variants") or {}).values():
            media_id = str((variant or {}).get("media_asset_record_id") or "").strip()
            if media_id:
                media_ids.append(media_id)
    fields = {
        "Studio_Variant_Manifest_JSON": json.dumps(manifest),
        "Studio_Variant_Status": status,
        "Studio_Variant_Updated_At": utc_now() if status == "Ready" else None,
        "Studio_Variant_Error": error,
        "Studio_Platform_Variant_Assets": list(dict.fromkeys(media_ids)),
        "Studio_Item4_State": "Error" if status == "Error" else "Plan Ready",
        "Updated_At": utc_now(),
    }
    return client.update_record(PRODUCTION_REQUESTS_TABLE, request_id, fields, typecast=True)


def reconcile_master_authority(
    client: AirtableClient,
    request_id: str,
    request: dict[str, Any],
) -> dict[str, Any]:
    import json

    from studio_produce.context import master_assets

    assets = master_assets(request)
    if not assets:
        return request
    rows = client.list_records(
        MEDIA_TRANSFER_QUEUE_TABLE,
        formula=f'AND({{Production_Request_Record_ID}}="{request_id}",{{Asset_Kind}}="Master Original")',
        max_records=100,
    )
    by_transfer = {field_str(row, "Transfer_ID"): row for row in rows}
    next_assets = []
    media_ids = []
    ready = 0
    failed = None
    for asset in assets:
        transfer_id = master_transfer_id(request_id, str(asset.get("id")))
        queue = by_transfer.get(transfer_id)
        drive_id = str(asset.get("google_drive_file_id") or "").strip()
        source_drive_id = str(asset.get("source_google_drive_file_id") or "").strip()
        drive_url = str(asset.get("google_drive_url") or "").strip()
        media_id = str(asset.get("media_asset_record_id") or "").strip()
        preview_url = str(asset.get("preview_url") or asset.get("url") or "").strip()
        if queue:
            source_drive_id = source_drive_id or field_str(queue, "Source_Drive_File_ID")
            preview_url = field_str(queue, "Preview_URL") or preview_url
            status = field_str(queue, "Transfer_Status")
            if status == "Failed" and not failed:
                failed = field_str(queue, "Error_Message") or f"{asset.get('name') or 'Master photo'} failed Drive handoff"
            if status in {"Drive Uploaded", "Ready"}:
                drive_id = drive_id or field_str(queue, "Drive_File_ID")
                drive_url = drive_url or field_str(queue, "Drive_URL")
                if drive_id and not drive_url:
                    drive_url = f"https://drive.google.com/file/d/{drive_id}/view"
                if not media_id:
                    linked = field(queue, "Generated_Media_Asset") or field(queue, "Source_Media_Asset") or []
                    if isinstance(linked, list) and linked:
                        media_id = str(linked[0])
                    media_id = media_id or field_str(queue, "Media_Asset_Record_ID")
        authoritative = bool(drive_id and media_id)
        if authoritative:
            ready += 1
            media_ids.append(media_id)
        next_assets.append({
            **asset,
            "google_drive_file_id": drive_id or None,
            "source_google_drive_file_id": source_drive_id or None,
            "google_drive_url": drive_url or None,
            "media_asset_record_id": media_id or None,
            "preview_url": preview_url or None,
            "authoritative_storage": "google_drive" if authoritative else asset.get("authoritative_storage"),
            "url": drive_url if authoritative else (asset.get("url") or preview_url),
        })
    status = "Error" if failed else ("Ready" if ready == len(assets) else "Uploading")
    updated = client.update_record(
        PRODUCTION_REQUESTS_TABLE,
        request_id,
        {
            "Studio_Master_Assets_JSON": json.dumps(next_assets),
            "Studio_Master_Asset_Count": len(next_assets),
            "Studio_Master_Asset_Status": status,
            "Studio_Master_Media_Assets": list(dict.fromkeys(media_ids)),
            "Studio_Item4_State": "Error" if failed else ("Assets Ready" if ready == len(assets) else "Draft"),
            "Updated_At": utc_now(),
        },
        typecast=True,
    )
    return updated
