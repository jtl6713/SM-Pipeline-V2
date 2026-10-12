"""A2B processor — backfill recent Video-folder files into Media Assets (Make 5568863)."""

from __future__ import annotations

from datetime import timedelta
from threading import Lock
from typing import Any, Iterable

from a2.dedupe import airtable_quote
from a2b.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from asset.chain import daisy_payload, trigger_next
from asset.constants import (
    A2B_DRIVE_PAGE_SIZE,
    GDRIVE_INGESTION_FOLDER,
    GDRIVE_VIDEO_FOLDER,
)
from asset.helpers import as_bool, parse_bytes, uc_download_url
from asset.routing import a2b_capture_source, a2b_route
from carousel.timeutil import chicago_now, iso_ms
from integrations.google_drive import GoogleDriveClient
from render.fields import field_str

# First fetch candidate IDs together; if the cap is reached, individually
# verify any unseen IDs so hundreds of copies of one file cannot mask another.
_A2B_EXISTING_LOOKUP_CHUNK = 20
_A2B_EXISTING_LOOKUP_LIMIT = 100
_A2B_CREATE_LOCK = Lock()  # Serialize the final check/write within this runner process.


def _unique_drive_ids(candidate_ids: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in candidate_ids:
        drive_id = str(raw or "").strip()
        if not drive_id or drive_id in seen:
            continue
        seen.add(drive_id)
        cleaned.append(drive_id)
    return cleaned


def existing_drive_id_formula(candidate_ids: Iterable[str]) -> str | None:
    """Airtable filter that matches any candidate Google Drive File ID."""
    cleaned = _unique_drive_ids(candidate_ids)
    if not cleaned:
        return None
    parts = [f"{{Google Drive File ID}}={airtable_quote(drive_id)}" for drive_id in cleaned]
    if len(parts) == 1:
        return parts[0]
    return f"OR({','.join(parts)})"


def _existing_drive_ids(client: AirtableClient, candidate_ids: Iterable[str]) -> set[str]:
    """Query candidate Drive IDs; verify unseen IDs if a shared query is capped.

    Ordinarily one OR query is enough for a 20-file Drive page. If legacy
    duplicate rows saturate its limit, exact one-ID lookups recover any IDs
    hidden past the cap. This avoids 20 Airtable calls in the healthy case.
    """
    cleaned = _unique_drive_ids(candidate_ids)
    found: set[str] = set()
    for index in range(0, len(cleaned), _A2B_EXISTING_LOOKUP_CHUNK):
        chunk = cleaned[index : index + _A2B_EXISTING_LOOKUP_CHUNK]
        if len(chunk) == 1:
            rows = client.list_records(
                MEDIA_ASSETS_TABLE,
                formula=existing_drive_id_formula(chunk),
                max_records=1,
                fields=["Google Drive File ID"],
            )
            if any(field_str(row, "Google Drive File ID") == chunk[0] for row in rows):
                found.add(chunk[0])
            continue
        rows = client.list_records(
            MEDIA_ASSETS_TABLE,
            formula=existing_drive_id_formula(chunk),
            max_records=_A2B_EXISTING_LOOKUP_LIMIT,
            fields=["Google Drive File ID"],
        )
        for row in rows:
            drive_id = field_str(row, "Google Drive File ID")
            if drive_id in chunk:
                found.add(drive_id)
        # Only capped results are potentially incomplete. Never treat an ID as
        # absent just because the older matching records fill the response.
        if len(rows) >= _A2B_EXISTING_LOOKUP_LIMIT:
            for file_id in chunk:
                if file_id in found:
                    continue
                exact_rows = client.list_records(
                    MEDIA_ASSETS_TABLE,
                    formula=existing_drive_id_formula([file_id]),
                    max_records=1,
                    fields=["Google Drive File ID"],
                )
                if any(field_str(row, "Google Drive File ID") == file_id for row in exact_rows):
                    found.add(file_id)
    return found


def _backfill_fields(file: dict[str, Any], *, batch_id: str) -> dict[str, Any]:
    file_id = str(file.get("id") or "")
    name = str(file.get("name") or "")
    return {
        "Asset Name": name,
        "Media_Class": "Video",
        "Google Drive URL": uc_download_url(file_id),
        "Google Drive File ID": file_id,
        "MIME_Type": str(file.get("mimeType") or ""),
        "File_Extension": str(file.get("fileExtension") or ""),
        "File_Size_Bytes": parse_bytes(file.get("size")),
        "Intake_Status": "Created",
        "Intake_Date": iso_ms(),
        "Intake_Batch_ID": batch_id,
        "Drive_Access_Status": "Public",
        "Classification_Status": "Needs Classification",
        "Asset_Status": "Available",
        "Active": True,
        "Do_Not_Use": False,
        "Capture_Source": a2b_capture_source(name),
        "Rights_Status": "Owned",
        "Asset_Role": "Raw Footage",
        "Raw_Source_Eligibility": "Needs Review",
        "Potential_Match_Notes": (
            "A2B backfilled this file from ChicagoShining / Assets / Video because it existed "
            "in the destination video folder instead of being processed through the Ingestion "
            "Folder. Send through A3 for classification before R2 uses it."
        ),
    }


def process_request(
    *,
    dry_run: bool = False,
    trigger_a3: bool = False,
    wait_for_next: bool = True,
    test_run_id: str | None = None,
    drain: bool = False,
) -> dict[str, Any]:
    batch_id = chicago_now().strftime("%Y-%m-%d-%H") + "-A2B-DriveVideoBackfill"
    since = (chicago_now() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "batch_id": batch_id,
        "modified_since": since,
        "test_run_id": test_run_id,
    }
    drive = GoogleDriveClient()
    files = drive.list_files(
        query=(
            f"'{GDRIVE_VIDEO_FOLDER}' in parents and trashed = false "
            f"and modifiedTime > '{since}'"
        ),
        page_size=A2B_DRIVE_PAGE_SIZE,
    )
    preview["file_ids"] = [str(item.get("id") or "") for item in files]
    preview["files_found"] = bool(files)
    client = AirtableClient()
    existing = _existing_drive_ids(client, preview["file_ids"])
    preview["existing_drive_id_count"] = len(existing)
    routes = []
    for item in files:
        file_id = str(item.get("id") or "")
        meta = drive.get_file(file_id) if file_id else item
        route = a2b_route(meta, existing)
        routes.append({"id": file_id, "name": meta.get("name"), "route": route, "size": parse_bytes(meta.get("size"))})
    preview["routes"] = routes
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    moved_oversize: list[str] = []
    created_ids: list[str] = []
    skipped: list[str] = []
    for item in routes:
        file_id = item["id"]
        route = item["route"]
        if route == "oversize":
            drive.move_file(file_id, GDRIVE_INGESTION_FOLDER, remove_parent_id=GDRIVE_VIDEO_FOLDER)
            moved_oversize.append(file_id)
            continue
        if route == "skip_existing":
            skipped.append(file_id)
            continue
        if route != "backfill":
            continue
        # Avoid same-process create races; atomic upsert also protects across hosts.
        with _A2B_CREATE_LOCK:
            # Recheck before any Drive write. A prior page item or concurrent run
            # may have created this record since the initial route decision.
            if file_id in existing or file_id in _existing_drive_ids(client, [file_id]):
                existing.add(file_id)
                skipped.append(file_id)
                continue
            meta = drive.get_file(file_id)
            drive.share_anyone_reader(file_id)
            try:
                # performUpsert is atomic at Airtable. Even concurrent A2B workers
                # cannot both insert the same Google Drive File ID.
                record, was_created = client.upsert_record(
                    MEDIA_ASSETS_TABLE,
                    _backfill_fields(meta, batch_id=batch_id),
                    merge_field="Google Drive File ID",
                    typecast=True,
                )
            except Exception:
                # If the write returned an ambiguous error after succeeding, or an
                # old duplicate already exists, fail closed rather than POSTing.
                if file_id in _existing_drive_ids(client, [file_id]):
                    existing.add(file_id)
                    skipped.append(file_id)
                    continue
                raise
            existing.add(file_id)
            if was_created:
                created_ids.append(record["id"])
            else:
                skipped.append(file_id)
    
    preview["moved_oversize_ids"] = moved_oversize
    preview["created_ids"] = created_ids
    preview["skipped_existing_ids"] = skipped
    next_result = None
    if trigger_a3:
        from a3.processor import process_request as process_a3

        next_result = trigger_next(
            "a3",
            daisy_payload("a3"),
            python_call=lambda: process_a3(
                dry_run=False,
                trigger_a4=True,
                wait_for_next=wait_for_next,
                drain=drain,
                test_run_id=test_run_id,
            ),
            wait=as_bool(wait_for_next, True),
        )
    return {
        "processed": True,
        "files_found": bool(files),
        "backfill_count": len(created_ids),
        "oversize_moved_count": len(moved_oversize),
        "skipped_existing_count": len(skipped),
        "a3": next_result,
        **preview,
    }
