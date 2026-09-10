from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import MEDIA_TRANSFER_QUEUE_TABLE
from integrations.google_drive import GoogleDriveClient
from integrations.r2_upload import R2UploadClient
from integrations.variant_service import VariantServiceClient, rasterize_still_bytes
from item4.clip_poster import clip_poster_bytes, is_video_preview_row, stamp_request_clip_poster
from item4.constants import BROWSER_MASTER_EXTENSIONS, STALE_PROCESSING_MS, VARIANT_RECIPE_VERSION
from item4.formulas import airtable_quote, smv1_exact_request_formula, smv1_pending_crop_formula
from item4.media_assets import ensure_media_asset
from item4.settings import PipelineSettings, field, pipeline_settings
from item4.sources import resolve_master_source


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _media_asset_id(fields: dict[str, Any] | None) -> str:
    fields = fields or {}
    generated = fields.get("Generated_Media_Asset") or []
    if isinstance(generated, list) and generated:
        first = generated[0]
        if isinstance(first, dict):
            return str(first.get("id") or "").strip()
        return str(first or "").strip()
    return str(fields.get("Media_Asset_Record_ID") or "").strip()


def _row_has_authority(fields: dict[str, Any] | None) -> bool:
    fields = fields or {}
    drive_id = str(fields.get("Drive_File_ID") or "").strip()
    return bool(drive_id and _media_asset_id(fields))


def _fail_row(
    client: AirtableClient,
    record_id: str,
    message: str,
    *,
    preview: bool = False,
    retryable: bool = False,
    existing_fields: dict[str, Any] | None = None,
) -> None:
    if preview:
        client.update_record(
            MEDIA_TRANSFER_QUEUE_TABLE,
            record_id,
            {
                "Preview_Status": "Failed",
                "Preview_Error": message[:10000],
            },
        )
        return
    current = existing_fields
    if current is None:
        try:
            record = client.get_record(MEDIA_TRANSFER_QUEUE_TABLE, record_id)
            current = record.get("fields") or {}
        except Exception:
            current = {}
    if _row_has_authority(current):
        # A later 503/retry must not hide a crop that already landed in Drive.
        client.update_record(
            MEDIA_TRANSFER_QUEUE_TABLE,
            record_id,
            {
                "Transfer_Status": "Ready",
                "Error_Message": None,
            },
        )
        return
    # Transfer_Status choices are Pending / Processing / Drive Uploaded / Ready / Error.
    # "Failed" is not a choice; Airtable silently drops it and the row stays Processing.
    client.update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        record_id,
        {
            "Transfer_Status": "Pending" if retryable else "Error",
            "Error_Message": message[:10000],
        },
    )


def _parse_stamp_ms(value: Any) -> int:
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return int(datetime.fromisoformat(text).timestamp() * 1000)
    except ValueError:
        return 0


def _row_stamp_ms(row: dict) -> int:
    fields = row.get("fields") or {}
    for key in ("Last_Attempt_At", "Updated_At", "Started_At", "Created_At"):
        stamp = _parse_stamp_ms(fields.get(key))
        if stamp:
            return stamp
    return _parse_stamp_ms(row.get("createdTime"))


def requeue_stale_processing(
    client: AirtableClient,
    *,
    production_request_record_id: str | None = None,
    test_run_id: str | None = None,
) -> int:
    """Return Processing rows older than 90s to Pending so the SMV1 selector can see them."""
    clauses = ['{Transfer_Status}="Processing"']
    if production_request_record_id:
        clauses.append(
            f'{{Production_Request_Record_ID}}="{airtable_quote(production_request_record_id)}"'
        )
    if test_run_id:
        clauses.append(f'{{Test_Run_ID}}="{airtable_quote(test_run_id)}"')
    else:
        clauses.append("{Test_Run_ID}=BLANK()")
    formula = f"AND({','.join(clauses)})" if len(clauses) > 1 else clauses[0]
    rows = client.list_records(MEDIA_TRANSFER_QUEUE_TABLE, formula=formula, max_records=20)
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    requeued = 0
    for row in rows:
        fields = row.get("fields") or {}
        stamp = _row_stamp_ms(row)
        if stamp and (now_ms - stamp) < STALE_PROCESSING_MS:
            continue
        attempts = int(fields.get("Attempt_Count") or 0)
        if _row_has_authority(fields):
            client.update_record(
                MEDIA_TRANSFER_QUEUE_TABLE,
                row["id"],
                {
                    "Transfer_Status": "Ready",
                    "Error_Message": None,
                },
            )
        elif attempts >= 6:
            client.update_record(
                MEDIA_TRANSFER_QUEUE_TABLE,
                row["id"],
                {
                    "Transfer_Status": "Error",
                    "Error_Message": (
                        f"Parked after {attempts} stalled Processing claims so SMV1 can "
                        "drain other crops."
                    ),
                },
            )
        else:
            client.update_record(
                MEDIA_TRANSFER_QUEUE_TABLE,
                row["id"],
                {
                    "Transfer_Status": "Pending",
                    "Error_Message": (
                        "Requeued after a stalled Processing claim so SMV1 can pick the row up again."
                    ),
                },
            )
        requeued += 1
    return requeued


def is_retryable_master_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if "404" in message or "not found" in message or "timed out" in message or "timeout" in message:
        return True
    if "503" in message or "resource limits" in message or "worker exceeded" in message:
        return True
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return status in {404, 408, 429, 500, 502, 503, 504}


def _claim_row(client: AirtableClient, record_id: str, fields: dict[str, Any]) -> None:
    attempts = int(fields.get("Attempt_Count") or 0) + 1
    patch = {
        "Transfer_Status": "Processing",
        "Attempt_Count": attempts,
        "Error_Message": None,
        "Last_Attempt_At": _now_iso(),
    }
    client.update_record(MEDIA_TRANSFER_QUEUE_TABLE, record_id, patch)


def select_eligible_rows(
    client: AirtableClient,
    *,
    production_request_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = 40,
    crops_only: bool = False,
) -> list[dict]:
    """Select SMV1 work. Prefer unfinished crops so Ready+Preview rows cannot starve them."""
    limit = max(1, min(int(max_records or 1), 40))
    if production_request_record_id:
        crop_formula = smv1_pending_crop_formula(production_request_record_id, test_run_id or "")
        crop_rows = client.list_records(
            MEDIA_TRANSFER_QUEUE_TABLE,
            formula=crop_formula,
            max_records=limit,
        )
        if crop_rows or crops_only:
            return crop_rows
        formula = smv1_exact_request_formula(production_request_record_id, test_run_id or "")
    else:
        from item4.constants import SMV1_PENDING_CROP_FORMULA, SMV1_PRODUCTION_FORMULA

        crop_rows = client.list_records(
            MEDIA_TRANSFER_QUEUE_TABLE,
            formula=f'AND({{Test_Run_ID}}=BLANK(),{SMV1_PENDING_CROP_FORMULA})',
            max_records=limit,
        )
        if crop_rows or crops_only:
            return crop_rows
        formula = SMV1_PRODUCTION_FORMULA
    return client.list_records(
        MEDIA_TRANSFER_QUEUE_TABLE,
        formula=formula,
        max_records=limit,
    )



def select_next_row(
    client: AirtableClient,
    *,
    production_request_record_id: str | None = None,
    test_run_id: str | None = None,
) -> dict | None:
    rows = select_eligible_rows(
        client,
        production_request_record_id=production_request_record_id,
        test_run_id=test_run_id,
        max_records=1,
    )
    return rows[0] if rows else None


def group_pending_variant_rows(rows: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
    """Group Platform Variant Pending rows by source Drive file so one download can crop all ratios."""
    groups: dict[str, list[dict]] = {}
    leftover: list[dict] = []
    for row in rows or []:
        fields = row.get("fields") or {}
        kind = str(fields.get("Asset_Kind") or "").strip()
        status = str(fields.get("Transfer_Status") or "").strip()
        source_id = str(fields.get("Source_Drive_File_ID") or "").strip()
        if kind == "Platform Variant" and status == "Pending" and source_id:
            groups.setdefault(source_id, []).append(row)
            continue
        leftover.append(row)
    return groups, leftover


def _gravity_token(fields: dict[str, Any]) -> str:
    style = str(fields.get("Variant_Style") or "center").strip()
    return style if style else "center"


def _process_master_pending(
    client: AirtableClient,
    drive: GoogleDriveClient,
    row: dict,
    settings: PipelineSettings,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    transfer_id = str(fields.get("Transfer_ID") or "").strip()
    folder_id = str(fields.get("Target_Drive_Folder_ID") or "").strip()
    filename = str(fields.get("Target_File_Name") or fields.get("Source_Name") or "photo")
    if not folder_id:
        raise RuntimeError("Master queue row is missing Target_Drive_Folder_ID")

    _claim_row(client, record_id, fields)
    content, mime = resolve_master_source(fields, settings)
    uploaded = drive.upload_file(folder_id, filename, content, mime)
    drive_id = str(uploaded.get("id") or "")
    drive_url = str(uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{drive_id}/view")
    media_asset_id = ensure_media_asset(
        client, fields, drive_id, drive_url, transfer_id, kind="Master Original"
    )
    client.update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        record_id,
        {
            "Transfer_Status": "Ready",
            "Drive_File_ID": drive_id,
            "Drive_URL": drive_url,
            "Media_Asset_Record_ID": media_asset_id,
            "Generated_Media_Asset": [media_asset_id],
            "Completed_At": _now_iso(),
            "Error_Message": None,
            "Preview_Status": "Pending",
        },
    )
    return {
        "route": "master_pending",
        "queue_record_id": record_id,
        "transfer_id": transfer_id,
        "drive_file_id": drive_id,
        "media_asset_id": media_asset_id,
    }


def _complete_variant_upload(
    client: AirtableClient,
    drive: GoogleDriveClient,
    row: dict,
    rendered: bytes,
    *,
    airtable_lock: threading.Lock | None = None,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    transfer_id = str(fields.get("Transfer_ID") or "").strip()
    folder_id = str(fields.get("Target_Drive_Folder_ID") or "").strip()
    filename = str(fields.get("Target_File_Name") or "variant.jpg")
    ratio = str(fields.get("Aspect_Ratio") or "").strip()
    uploaded = drive.upload_file(folder_id, filename, rendered, "image/jpeg")
    drive_id = str(uploaded.get("id") or "")
    drive_url = str(uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{drive_id}/view")

    def _write() -> str:
        media_asset_id = ensure_media_asset(
            client, fields, drive_id, drive_url, transfer_id, kind="Platform Variant"
        )
        client.update_record(
            MEDIA_TRANSFER_QUEUE_TABLE,
            record_id,
            {
                "Transfer_Status": "Ready",
                "Drive_File_ID": drive_id,
                "Drive_URL": drive_url,
                "Media_Asset_Record_ID": media_asset_id,
                "Generated_Media_Asset": [media_asset_id],
                "Completed_At": _now_iso(),
                "Error_Message": None,
                "Preview_Status": "Pending",
            },
        )
        return media_asset_id

    if airtable_lock:
        with airtable_lock:
            media_asset_id = _write()
    else:
        media_asset_id = _write()
    return {
        "route": "variant_pending",
        "queue_record_id": record_id,
        "transfer_id": transfer_id,
        "drive_file_id": drive_id,
        "media_asset_id": media_asset_id,
        "recipe": VARIANT_RECIPE_VERSION,
        "ratio": ratio,
    }


def _process_variant_pending(
    client: AirtableClient,
    drive: GoogleDriveClient,
    variant: VariantServiceClient,
    row: dict,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    folder_id = str(fields.get("Target_Drive_Folder_ID") or "").strip()
    source_drive_id = str(fields.get("Source_Drive_File_ID") or "").strip()
    ratio = str(fields.get("Aspect_Ratio") or "").strip()
    if not folder_id or not source_drive_id or not ratio:
        raise RuntimeError("Platform variant row is missing folder, source drive id, or aspect ratio")

    if _row_has_authority(fields):
        client.update_record(
            MEDIA_TRANSFER_QUEUE_TABLE,
            record_id,
            {"Transfer_Status": "Ready", "Error_Message": None},
        )
        return {
            "route": "variant_authority_reuse",
            "queue_record_id": record_id,
            "transfer_id": str(fields.get("Transfer_ID") or "").strip(),
            "drive_file_id": str(fields.get("Drive_File_ID") or "").strip(),
            "media_asset_id": _media_asset_id(fields),
            "recipe": VARIANT_RECIPE_VERSION,
            "ratio": ratio,
        }

    _claim_row(client, record_id, fields)
    source_bytes, _ = drive.download_file(source_drive_id)
    source_ext = str(fields.get("Source_Extension") or "")
    source_bytes = rasterize_still_bytes(
        source_bytes,
        drive=drive,
        drive_id=source_drive_id,
        ext=source_ext,
    )
    rendered = variant.render(
        source_bytes,
        ratio,
        _gravity_token(fields),
        drive=drive,
        drive_id=source_drive_id,
        ext=source_ext,
    )
    return _complete_variant_upload(client, drive, row, rendered)


def process_variant_group(
    client: AirtableClient,
    drive: GoogleDriveClient,
    variant: VariantServiceClient,
    rows: list[dict],
    *,
    airtable_lock: threading.Lock | None = None,
) -> list[dict[str, Any]]:
    """Download a master once, then crop and upload every pending ratio for that photo."""
    if not rows:
        return []
    source_drive_id = str((rows[0].get("fields") or {}).get("Source_Drive_File_ID") or "").strip()
    if not source_drive_id:
        raise RuntimeError("Platform variant group is missing Source_Drive_File_ID")

    pending_rows: list[dict] = []
    results: list[dict[str, Any]] = []
    for row in rows:
        fields = row.get("fields") or {}
        folder_id = str(fields.get("Target_Drive_Folder_ID") or "").strip()
        ratio = str(fields.get("Aspect_Ratio") or "").strip()
        if not folder_id or not ratio:
            raise RuntimeError("Platform variant row is missing folder or aspect ratio")
        if _row_has_authority(fields):
            patch = {"Transfer_Status": "Ready", "Error_Message": None}
            if airtable_lock:
                with airtable_lock:
                    client.update_record(MEDIA_TRANSFER_QUEUE_TABLE, row["id"], patch)
            else:
                client.update_record(MEDIA_TRANSFER_QUEUE_TABLE, row["id"], patch)
            results.append({
                "route": "variant_authority_reuse",
                "queue_record_id": row["id"],
                "transfer_id": str(fields.get("Transfer_ID") or "").strip(),
                "drive_file_id": str(fields.get("Drive_File_ID") or "").strip(),
                "media_asset_id": _media_asset_id(fields),
                "recipe": VARIANT_RECIPE_VERSION,
                "ratio": ratio,
            })
            continue
        pending_rows.append(row)
        if airtable_lock:
            with airtable_lock:
                _claim_row(client, row["id"], fields)
        else:
            _claim_row(client, row["id"], fields)

    if not pending_rows:
        return results

    source_bytes, _ = drive.download_file(source_drive_id)
    source_ext = str((pending_rows[0].get("fields") or {}).get("Source_Extension") or "")
    source_bytes = rasterize_still_bytes(
        source_bytes,
        drive=drive,
        drive_id=source_drive_id,
        ext=source_ext,
    )
    def _crop_one(row: dict) -> dict[str, Any]:
        fields = row.get("fields") or {}
        ratio = str(fields.get("Aspect_Ratio") or "").strip()
        # Per-ratio Drive/variant clients: concurrent uploads must not share one Session.
        # Keep injected fakes (unit tests) on the caller's objects.
        local_drive = (
            GoogleDriveClient() if isinstance(drive, GoogleDriveClient) else drive
        )
        local_variant = (
            VariantServiceClient(getattr(variant, "_settings", None))
            if isinstance(variant, VariantServiceClient)
            else variant
        )
        try:
            rendered = local_variant.render(
                source_bytes,
                ratio,
                _gravity_token(fields),
                drive=local_drive,
                drive_id=source_drive_id,
                ext=str(fields.get("Source_Extension") or source_ext),
            )
            return _complete_variant_upload(
                client, local_drive, row, rendered, airtable_lock=airtable_lock
            )
        except Exception as exc:
            try:
                if airtable_lock:
                    with airtable_lock:
                        _fail_row(
                            client,
                            row["id"],
                            str(exc),
                            retryable=is_retryable_master_error(exc),
                            existing_fields=fields,
                        )
                else:
                    _fail_row(
                        client,
                        row["id"],
                        str(exc),
                        retryable=is_retryable_master_error(exc),
                        existing_fields=fields,
                    )
            except Exception:
                pass
            raise

    first_error: Exception | None = None
    ratio_workers = max(1, min(4, len(pending_rows)))
    if ratio_workers == 1:
        try:
            results.append(_crop_one(pending_rows[0]))
        except Exception as exc:
            first_error = exc
    else:
        with ThreadPoolExecutor(max_workers=ratio_workers) as pool:
            futures = {pool.submit(_crop_one, row): row for row in pending_rows}
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as exc:
                    first_error = first_error or exc
    if first_error and not results:
        raise first_error
    return results



def _process_variant_drive_uploaded(
    client: AirtableClient,
    row: dict,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    transfer_id = str(fields.get("Transfer_ID") or "").strip()
    drive_id = str(fields.get("Drive_File_ID") or "").strip()
    drive_url = str(fields.get("Drive_URL") or f"https://drive.google.com/file/d/{drive_id}/view")
    if not drive_id:
        raise RuntimeError("Drive Uploaded variant row is missing Drive_File_ID")

    _claim_row(client, record_id, fields)
    media_asset_id = ensure_media_asset(
        client, fields, drive_id, drive_url, transfer_id, kind="Platform Variant"
    )
    client.update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        record_id,
        {
            "Transfer_Status": "Ready",
            "Media_Asset_Record_ID": media_asset_id,
            "Generated_Media_Asset": [media_asset_id],
            "Completed_At": _now_iso(),
            "Error_Message": None,
            "Preview_Status": "Pending",
        },
    )
    return {
        "route": "variant_drive_uploaded",
        "queue_record_id": record_id,
        "transfer_id": transfer_id,
        "media_asset_id": media_asset_id,
    }


def _process_preview_pending(
    client: AirtableClient,
    drive: GoogleDriveClient,
    variant: VariantServiceClient,
    r2: R2UploadClient,
    row: dict,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    kind = str(fields.get("Asset_Kind") or "").strip()
    drive_id = str(fields.get("Drive_File_ID") or "").strip()
    production_request_id = str(fields.get("Production_Request_Record_ID") or "").strip()
    transfer_id = str(fields.get("Transfer_ID") or "").strip()
    ext = str(fields.get("Source_Extension") or "").lower().lstrip(".")
    if not drive_id or not production_request_id or not transfer_id:
        raise RuntimeError("Preview row is missing drive id, production request, or transfer id")

    if is_video_preview_row(fields):
        preview_bytes, content_type = clip_poster_bytes(drive, drive_id, ext)
        suffix = ".jpg"
    else:
        source_bytes, source_mime = drive.download_file(drive_id)
        if kind == "Platform Variant":
            preview_bytes = source_bytes
            content_type = "image/jpeg"
            suffix = f"-{drive_id}.jpg"
        elif ext in {"heic", "heif"}:
            preview_bytes = variant.render(
                source_bytes,
                "4:5",
                "center",
                drive=drive,
                drive_id=drive_id,
                ext=ext,
            )
            content_type = "image/jpeg"
            suffix = ".jpg"
        elif ext in BROWSER_MASTER_EXTENSIONS:
            preview_bytes = source_bytes
            content_type = source_mime or f"image/{ext}"
            suffix = f".{ext}" if ext else ".jpg"
        else:
            preview_bytes = source_bytes
            content_type = source_mime or "application/octet-stream"
            suffix = f".{ext}" if ext else ".bin"

    key = r2.preview_key(production_request_id, transfer_id, suffix)
    r2.put_object(key, preview_bytes, content_type)
    preview_url = r2.preview_url(key)
    client.update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        record_id,
        {
            "Preview_Status": "Ready",
            "Preview_R2_Key": key,
            "Preview_URL": preview_url,
            "Preview_Error": None,
            "Preview_Ready_At": _now_iso(),
        },
    )
    if is_video_preview_row(fields):
        try:
            stamp_request_clip_poster(
                client,
                production_request_id,
                str(fields.get("Source_Asset_ID") or "").strip(),
                preview_url,
                key,
            )
        except Exception:
            pass
    return {
        "route": "preview_pending",
        "queue_record_id": record_id,
        "transfer_id": transfer_id,
        "preview_url": preview_url,
        "preview_r2_key": key,
    }


def process_queue_row(client: AirtableClient, row: dict) -> dict[str, Any]:
    settings = pipeline_settings(client)
    drive = GoogleDriveClient()
    variant = VariantServiceClient(settings)
    r2 = R2UploadClient(settings)

    fields = row.get("fields", {})
    kind = str(fields.get("Asset_Kind") or "").strip()
    transfer_status = str(fields.get("Transfer_Status") or "").strip()
    preview_status = str(fields.get("Preview_Status") or "").strip()

    if transfer_status == "Ready" and preview_status == "Pending":
        return _process_preview_pending(client, drive, variant, r2, row)

    if kind == "Master Original" and transfer_status == "Pending":
        return _process_master_pending(client, drive, row, settings)

    if kind == "Platform Variant" and transfer_status == "Pending":
        return _process_variant_pending(client, drive, variant, row)

    if kind == "Platform Variant" and transfer_status == "Drive Uploaded":
        return _process_variant_drive_uploaded(client, row)

    raise RuntimeError(
        f"Unsupported SMV1 queue state: kind={kind}, transfer={transfer_status}, preview={preview_status}"
    )


def _assert_test_mode_boundary(client: AirtableClient, record_id: str, test_run_id: str) -> None:
    quoted = record_id.replace("'", "\\'")
    rows = client.list_records(
        MEDIA_TRANSFER_QUEUE_TABLE,
        formula=f"{{Production_Request_Record_ID}}='{quoted}'",
        max_records=100,
    )
    for candidate in rows:
        row_test = str(field(candidate, "Test_Run_ID") or "").strip()
        if row_test != test_run_id:
            raise RuntimeError("SMV1 Test Mode queue contains a blank or mismatched Test_Run_ID")


def process_one(
    *,
    production_request_record_id: str | None = None,
    test_run_id: str | None = None,
) -> dict[str, Any]:
    client = AirtableClient()
    if production_request_record_id and test_run_id:
        _assert_test_mode_boundary(client, production_request_record_id, test_run_id)

    requeue_stale_processing(
        client,
        production_request_record_id=production_request_record_id,
        test_run_id=test_run_id,
    )

    row = select_next_row(
        client,
        production_request_record_id=production_request_record_id,
        test_run_id=test_run_id,
    )
    if not row:
        return {"processed": False, "reason": "no_eligible_queue_row"}

    try:
        result = process_queue_row(client, row)
        return {"processed": True, **result}
    except Exception as exc:
        message = str(exc)
        preview = (
            str(field(row, "Transfer_Status") or "") == "Ready"
            and str(field(row, "Preview_Status") or "") == "Pending"
        )
        try:
            _fail_row(
                client,
                row["id"],
                message,
                preview=preview,
                retryable=not preview and is_retryable_master_error(exc),
            )
        except Exception:
            pass
        raise


def process_drain(
    *,
    production_request_record_id: str | None = None,
    test_run_id: str | None = None,
    photo_workers: int = 8,
    max_followup: int = 8,
) -> dict[str, Any]:
    """Process pending variant photos in parallel (one Drive download per photo).

    Unfinished Platform Variant crops are selected before Ready+Preview rows so
    preview uploads cannot fill the Airtable window and stall the last crops.
    Leftover preview/master rows run in parallel and no longer abort the drain.
    """
    client = AirtableClient()
    if production_request_record_id and test_run_id:
        _assert_test_mode_boundary(client, production_request_record_id, test_run_id)

    requeue_stale_processing(
        client,
        production_request_record_id=production_request_record_id,
        test_run_id=test_run_id,
    )

    airtable_lock = threading.Lock()
    results: list[dict[str, Any]] = []
    settings = pipeline_settings(client)
    groups: dict[str, list[dict]] = {}

    def _run_group(group_rows: list[dict]) -> list[dict[str, Any]]:
        drive = GoogleDriveClient()
        variant = VariantServiceClient(settings)
        return process_variant_group(
            client,
            drive,
            variant,
            group_rows,
            airtable_lock=airtable_lock,
        )

    def _safe_leftover(row: dict) -> dict[str, Any] | None:
        try:
            return process_queue_row(client, row)
        except Exception as exc:
            preview = (
                str(field(row, "Transfer_Status") or "") == "Ready"
                and str(field(row, "Preview_Status") or "") == "Pending"
            )
            try:
                _fail_row(
                    client,
                    row["id"],
                    str(exc),
                    preview=preview,
                    retryable=not preview and is_retryable_master_error(exc),
                )
            except Exception:
                pass
            return {
                "processed": False,
                "route": "leftover_error",
                "queue_record_id": row.get("id"),
                "error": str(exc),
            }

    # Prefer crop waves first; one final wave accepts previews/masters.
    for wave in range(5):
        crops_only = wave < 4
        rows = select_eligible_rows(
            client,
            production_request_record_id=production_request_record_id,
            test_run_id=test_run_id,
            max_records=40,
            crops_only=crops_only,
        )
        if not rows:
            if crops_only:
                continue
            if results:
                break
            return {"processed": False, "reason": "no_eligible_queue_row", "processed_count": 0}

        groups, leftover = group_pending_variant_rows(rows)
        if not groups and not leftover:
            if crops_only:
                continue
            break

        workers = max(1, min(int(photo_workers or 1), 10, max(1, len(groups) or 1)))
        if groups:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = [pool.submit(_run_group, group_rows) for group_rows in groups.values()]
                first_error: Exception | None = None
                for future in as_completed(futures):
                    try:
                        results.extend(future.result() or [])
                    except Exception as exc:
                        first_error = first_error or exc
                if first_error and not results:
                    raise first_error

        # Defer leftover (previews) while unfinished crop groups still exist.
        if crops_only and groups:
            leftover = []

        if leftover:
            leftover_workers = max(1, min(6, len(leftover)))
            with ThreadPoolExecutor(max_workers=leftover_workers) as pool:
                futures = [pool.submit(_safe_leftover, row) for row in leftover]
                for future in as_completed(futures):
                    row_result = future.result()
                    if row_result:
                        results.append(row_result)

    followup = 0
    while followup < max(0, int(max_followup or 0)):
        nxt = process_one(
            production_request_record_id=production_request_record_id,
            test_run_id=test_run_id,
        )
        if not nxt.get("processed"):
            break
        results.append(nxt)
        followup += 1

    return {
        "processed": bool(results),
        "processed_count": len(results),
        "route": "variant_drain",
        "photo_groups": len(groups),
        "results": results,
    }
