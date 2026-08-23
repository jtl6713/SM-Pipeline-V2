from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import MEDIA_TRANSFER_QUEUE_TABLE
from integrations.google_drive import GoogleDriveClient
from integrations.r2_upload import R2UploadClient
from integrations.variant_service import VariantServiceClient
from item4.constants import BROWSER_MASTER_EXTENSIONS, VARIANT_RECIPE_VERSION
from item4.formulas import smv1_exact_request_formula
from item4.media_assets import ensure_media_asset
from item4.settings import PipelineSettings, field, pipeline_settings
from item4.sources import resolve_master_source


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fail_row(client: AirtableClient, record_id: str, message: str, *, preview: bool = False) -> None:
    if preview:
        client.update_record(
            MEDIA_TRANSFER_QUEUE_TABLE,
            record_id,
            {
                "Preview_Status": "Failed",
                "Preview_Error": message[:10000],
            },
        )
    else:
        client.update_record(
            MEDIA_TRANSFER_QUEUE_TABLE,
            record_id,
            {
                "Transfer_Status": "Failed",
                "Error_Message": message[:10000],
            },
        )


def _claim_row(client: AirtableClient, record_id: str, fields: dict[str, Any]) -> None:
    attempts = int(fields.get("Attempt_Count") or 0) + 1
    patch = {
        "Transfer_Status": "Processing",
        "Attempt_Count": attempts,
        "Error_Message": None,
        "Last_Attempt_At": _now_iso(),
    }
    client.update_record(MEDIA_TRANSFER_QUEUE_TABLE, record_id, patch)


def select_next_row(
    client: AirtableClient,
    *,
    production_request_record_id: str | None = None,
    test_run_id: str | None = None,
) -> dict | None:
    if production_request_record_id:
        formula = smv1_exact_request_formula(production_request_record_id, test_run_id or "")
    else:
        from item4.constants import SMV1_PRODUCTION_FORMULA

        formula = SMV1_PRODUCTION_FORMULA
    rows = client.list_records(MEDIA_TRANSFER_QUEUE_TABLE, formula=formula, max_records=1)
    return rows[0] if rows else None


def _gravity_token(fields: dict[str, Any]) -> str:
    style = str(fields.get("Variant_Style") or "center").strip()
    return style if style else "center"


def _process_master_pending(
    client: AirtableClient,
    drive: GoogleDriveClient,
    row: dict,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    transfer_id = str(fields.get("Transfer_ID") or "").strip()
    folder_id = str(fields.get("Target_Drive_Folder_ID") or "").strip()
    filename = str(fields.get("Target_File_Name") or fields.get("Source_Name") or "photo")
    if not folder_id:
        raise RuntimeError("Master queue row is missing Target_Drive_Folder_ID")

    _claim_row(client, record_id, fields)
    content, mime = resolve_master_source(fields)
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


def _process_variant_pending(
    client: AirtableClient,
    drive: GoogleDriveClient,
    variant: VariantServiceClient,
    row: dict,
) -> dict[str, Any]:
    record_id = row["id"]
    fields = row.get("fields", {})
    transfer_id = str(fields.get("Transfer_ID") or "").strip()
    folder_id = str(fields.get("Target_Drive_Folder_ID") or "").strip()
    filename = str(fields.get("Target_File_Name") or "variant.jpg")
    source_drive_id = str(fields.get("Source_Drive_File_ID") or "").strip()
    ratio = str(fields.get("Aspect_Ratio") or "").strip()
    if not folder_id or not source_drive_id or not ratio:
        raise RuntimeError("Platform variant row is missing folder, source drive id, or aspect ratio")

    _claim_row(client, record_id, fields)
    source_bytes, _ = drive.download_file(source_drive_id)
    rendered = variant.render(source_bytes, ratio, _gravity_token(fields))
    uploaded = drive.upload_file(folder_id, filename, rendered, "image/jpeg")
    drive_id = str(uploaded.get("id") or "")
    drive_url = str(uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{drive_id}/view")
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
    return {
        "route": "variant_pending",
        "queue_record_id": record_id,
        "transfer_id": transfer_id,
        "drive_file_id": drive_id,
        "media_asset_id": media_asset_id,
        "recipe": VARIANT_RECIPE_VERSION,
        "ratio": ratio,
    }


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
    ext = str(fields.get("Source_Extension") or "").lower()
    if not drive_id or not production_request_id or not transfer_id:
        raise RuntimeError("Preview row is missing drive id, production request, or transfer id")

    source_bytes, source_mime = drive.download_file(drive_id)
    if kind == "Platform Variant":
        preview_bytes = source_bytes
        content_type = "image/jpeg"
        suffix = f"-{drive_id}.jpg"
    elif ext in {"heic", "heif"}:
        preview_bytes = variant.render(source_bytes, "4:5", "center")
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
        return _process_master_pending(client, drive, row)

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
            _fail_row(client, row["id"], message, preview=preview)
        except Exception:
            pass
        raise
