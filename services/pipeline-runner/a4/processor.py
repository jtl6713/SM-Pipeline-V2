"""A4 processor — deleted Drive reconciliation (Make 5578180)."""

from __future__ import annotations

from typing import Any

import requests

from a4.constants import HEALTHY_NOTES, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, MISSING_NOTES
from a4.formulas import linked_record_mentions, output_r2b_reset_fields, unpublished_outputs_using_asset_formula
from airtable.client import AirtableClient
from airtable.constants import (
    ASSET_REQUEST_SHOTS_TABLE,
    ASSET_REQUESTS_TABLE,
    CONTENT_ITEMS_TABLE,
    MEDIA_ASSETS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
)
from asset.constants import A4_DOWNSTREAM_MAX_RECORDS, A4_MAX_RECORDS, A4_ORPHAN_VIEW
from asset.helpers import parse_int, uc_download_url
from asset.routing import a4_is_healthy, a4_is_missing
from carousel.timeutil import chicago_now
from integrations.google_drive import GoogleDriveClient
from render.fields import field, field_str, first_linked_id


def _head_status(file_id: str) -> int | None:
    if not file_id:
        return None
    try:
        response = requests.head(
            uc_download_url(file_id),
            allow_redirects=True,
            timeout=30,
        )
        return int(response.status_code)
    except requests.RequestException:
        return 599


def _reset_outputs(client: AirtableClient, drive: GoogleDriveClient, asset: dict[str, Any]) -> list[str]:
    asset_id = asset["id"]
    drive_id = field_str(asset, "Google Drive File ID")
    name = field_str(asset, "Asset Name")
    outputs = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=unpublished_outputs_using_asset_formula(asset_id, drive_id),
        max_records=A4_DOWNSTREAM_MAX_RECORDS,
    )
    reset_ids: list[str] = []
    for output in outputs:
        final_id = field_str(output, "Final_File_ID")
        if final_id:
            try:
                drive.trash_file(final_id)
            except Exception:
                pass
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], output_r2b_reset_fields(), typecast=True)
        content_id = first_linked_id(field(output, "Content_Item"))
        if content_id:
            client.update_record(
                CONTENT_ITEMS_TABLE,
                content_id,
                {
                    "Asset_Match_Status": "Partial Match",
                    "Content_Status": "Needs Assets",
                    "Internal_Notes": (
                        f"A4 reset this Content Item to Needs Assets because raw Media Asset "
                        f"{asset_id} / {name} / Drive file {drive_id} is no longer available in Google Drive."
                    ),
                    "Missing_Asset_Summary": (
                        "A4 detected that a selected/raw media asset was moved to Google Drive Trash, "
                        "removed, or became inaccessible. This content item was moved back to Needs Assets "
                        "/ Partial Match so R2 can reprocess asset matching."
                    ),
                    "Review_Status": None,
                    "Render_Status": None,
                },
                typecast=True,
            )
        reset_ids.append(output["id"])
    return reset_ids


def _reset_requests(client: AirtableClient, asset: dict[str, Any]) -> list[str]:
    asset_id = asset["id"]
    name = field_str(asset, "Asset Name")
    drive_id = field_str(asset, "Google Drive File ID")
    rows = client.list_records(ASSET_REQUESTS_TABLE, max_records=A4_DOWNSTREAM_MAX_RECORDS)
    reset_ids: list[str] = []
    for row in rows:
        if not (
            linked_record_mentions(field(row, "Uploaded_Fulfillment_Assets"), asset_id, name)
            or linked_record_mentions(field(row, "Existing_Matching_Assets"), asset_id, name)
        ):
            continue
        client.update_record(
            ASSET_REQUESTS_TABLE,
            row["id"],
            {
                "Request_Status": "Open",
                "Capture_Status": "Needs Capture",
                "Missing_Asset_Summary": (
                    f"A4 detected that fulfillment Media Asset {asset_id} / {name} / Drive File ID "
                    f"{drive_id} is no longer available. This request was reopened so replacement "
                    "footage can be captured or matched."
                ),
                "Notes": (
                    "A4 reset this Asset Request because one of its uploaded fulfillment assets "
                    "was moved to Google Drive Trash, removed, or became inaccessible."
                ),
            },
            typecast=True,
        )
        reset_ids.append(row["id"])
    return reset_ids


def _reset_shots(client: AirtableClient, asset: dict[str, Any]) -> list[str]:
    asset_id = asset["id"]
    name = field_str(asset, "Asset Name")
    drive_id = field_str(asset, "Google Drive File ID")
    rows = client.list_records(ASSET_REQUEST_SHOTS_TABLE, max_records=A4_DOWNSTREAM_MAX_RECORDS)
    reset_ids: list[str] = []
    for row in rows:
        if not (
            linked_record_mentions(field(row, "Fulfillment_Assets"), asset_id, name)
            or linked_record_mentions(field_str(row, "Uploaded_URL"), drive_id, asset_id)
        ):
            continue
        client.update_record(
            ASSET_REQUEST_SHOTS_TABLE,
            row["id"],
            {
                "Shot_Status": "Open",
                "Uploaded_URL": None,
                "Notes": (
                    f"A4 reset this Asset Request Shot because fulfillment Media Asset {asset_id} / "
                    f"{name} / Drive File ID {drive_id} was moved to Google Drive Trash, removed, "
                    "or became inaccessible."
                ),
            },
            typecast=True,
        )
        reset_ids.append(row["id"])
    return reset_ids


def process_request(
    *,
    dry_run: bool = False,
    test_run_id: str | None = None,
    max_records: int | None = None,
) -> dict[str, Any]:
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "test_run_id": test_run_id,
    }
    client = AirtableClient()
    drive = GoogleDriveClient()
    rows = client.list_records(
        MEDIA_ASSETS_TABLE,
        view=A4_ORPHAN_VIEW,
        max_records=parse_int(max_records, A4_MAX_RECORDS) or A4_MAX_RECORDS,
    )
    preview["candidate_ids"] = [row["id"] for row in rows]
    checks: list[dict[str, Any]] = []
    for row in rows:
        drive_id = field_str(row, "Google Drive File ID")
        name = field_str(row, "Asset Name")
        trash = drive.search_trash_by_name(name) if name else []
        trash_ids = {str(item.get("id") or "") for item in trash if item.get("id")}
        head_status = _head_status(drive_id)
        missing = a4_is_missing(trash_ids=trash_ids, drive_file_id=drive_id, head_status=head_status)
        healthy = a4_is_healthy(trash_ids=trash_ids, drive_file_id=drive_id, head_status=head_status)
        checks.append(
            {
                "id": row["id"],
                "drive_id": drive_id,
                "head_status": head_status,
                "missing": missing,
                "healthy": healthy,
            }
        )
    preview["checks"] = checks
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    deleted: list[str] = []
    healthy_ids: list[str] = []
    for row, check in zip(rows, checks):
        if check["missing"]:
            client.update_record(
                MEDIA_ASSETS_TABLE,
                row["id"],
                {
                    "Do_Not_Use": True,
                    "Active": False,
                    "Asset_Status": "Do Not Use",
                    "Potential_Match_Notes": MISSING_NOTES,
                },
                typecast=True,
            )
            _reset_outputs(client, drive, row)
            _reset_requests(client, row)
            _reset_shots(client, row)
            client.delete_record(MEDIA_ASSETS_TABLE, row["id"])
            deleted.append(row["id"])
            continue
        if check["healthy"]:
            client.update_record(
                MEDIA_ASSETS_TABLE,
                row["id"],
                {
                    "Potential_Match_Notes": HEALTHY_NOTES,
                    "Last_Match_Checked_On": chicago_now().strftime("%Y-%m-%d"),
                },
            )
            healthy_ids.append(row["id"])
    return {
        "processed": True,
        "checked_count": len(rows),
        "deleted_count": len(deleted),
        "healthy_count": len(healthy_ids),
        "deleted_ids": deleted,
        "healthy_ids": healthy_ids,
        **preview,
    }
