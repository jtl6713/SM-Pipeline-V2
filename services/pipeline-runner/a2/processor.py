"""A2 processor — Drive ingestion folder intake + MIME routing (Make 5531974)."""

from __future__ import annotations

import logging
import threading
from typing import Any

from a2.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from a2.dedupe import intake_duplicate_formulas
from a2.email_builder import intake_email_html, intake_subject
from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from asset.chain import daisy_payload, trigger_next
from asset.constants import (
    A2_DRAIN_MAX_PASSES,
    A2_DRIVE_PAGE_SIZE,
    DEFAULT_EMAIL_TO,
    GDRIVE_FOLDERS,
    GDRIVE_INGESTION_FOLDER,
    MAX_FILE_BYTES,
)
from asset.helpers import as_bool, drive_video_duration_seconds, parse_bytes
from asset.routing import a2_route_fields, classify_intake_file
from audio.leading_silence import STATUS_FAILED, apply_drive_leading_silence, is_voiceover_audio
from audio.wav_to_mp3 import apply_drive_wav_to_mp3
from carousel.timeutil import chicago_now, iso_ms
from config import load_settings
from integrations.gmail import GmailClient
from integrations.google_drive import GoogleDriveClient

logger = logging.getLogger(__name__)

FOLDER_LABELS = {
    "video": "ChicagoShining / Assets / Video",
    "branding": "ChicagoShining / Assets / Branding",
    "image": "ChicagoShining / Assets / Photos / Ingestion Intake",
    "other": "ChicagoShining / Assets / Misc",
    "audio": "ChicagoShining / Assets / Music",
}

_INTAKE_LOCK = threading.Lock()


def existing_intake_record(
    client: AirtableClient,
    *,
    file_id: str,
    name: str,
    size: int | None,
) -> dict[str, Any] | None:
    fields = ["Asset Name", "Google Drive File ID", "File_Size_Bytes"]
    for formula in intake_duplicate_formulas(file_id, name, size):
        rows = client.list_records(
            MEDIA_ASSETS_TABLE,
            formula=formula,
            max_records=1,
            fields=fields,
        )
        if rows:
            return rows[0]
    return None


def _intake_fields(file: dict[str, Any], *, share_url: str, batch_id: str) -> dict[str, Any]:
    fields = {
        "Asset Name": str(file.get("name") or "").strip(),
        "Google Drive File ID": str(file.get("id") or ""),
        "Google Drive URL": share_url,
        "MIME_Type": str(file.get("mimeType") or ""),
        "File_Extension": str(file.get("fileExtension") or ""),
        "File_Size_Bytes": parse_bytes(file.get("size")),
        "Intake_Status": "Created",
        "Intake_Date": iso_ms(),
        "Intake_Batch_ID": batch_id,
        "Classification_Status": "Needs Classification",
        "Active": True,
        "Do_Not_Use": False,
        "Capture_Source": "Self Filmed",
        "Rights_Status": "Owned",
        "Drive_Access_Status": "Public",
        "Asset_Status": "Available",
    }
    duration = drive_video_duration_seconds(file)
    if duration:
        fields["Duration_Seconds"] = duration
    return fields


def _list_ingestion_files(drive: GoogleDriveClient) -> list[dict[str, Any]]:
    return drive.list_files(
        query=f"'{GDRIVE_INGESTION_FOLDER}' in parents and trashed = false",
        page_size=A2_DRIVE_PAGE_SIZE,
        fields="files(id,name,mimeType,size,fileExtension,webContentLink,webViewLink,createdTime,modifiedTime,parents,videoMediaMetadata)",
    )


def _preview_base(*, test_run_id: str | None = None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "intake_batch_id": chicago_now().strftime("%Y-%m-%d-%H") + "-AssetIntake",
        "test_run_id": test_run_id,
    }


def _start_oversize_compression() -> dict[str, Any]:
    from a1s.processor import process_request as process_a1s

    return process_a1s()


def _daisy_a2b(*, wait_for_next: bool, test_run_id: str | None) -> dict[str, Any]:
    from a2b.processor import process_request as process_a2b

    return trigger_next(
        "a2b",
        daisy_payload("a2b"),
        python_call=lambda: process_a2b(
            dry_run=False,
            trigger_a3=True,
            wait_for_next=wait_for_next,
            drain=True,
            test_run_id=test_run_id,
        ),
        wait=as_bool(wait_for_next, True),
    )


def _intake_pass(
    *,
    trigger_a2b: bool = False,
    wait_for_next: bool = True,
    test_run_id: str | None = None,
) -> dict[str, Any]:
    preview = _preview_base(test_run_id=test_run_id)
    drive = GoogleDriveClient()
    files = _list_ingestion_files(drive)
    preview["file_ids"] = [str(item.get("id") or "") for item in files]
    preview["files_found"] = bool(files)

    intaken: list[str] = []
    skipped_oversize: list[str] = []
    skipped_existing: list[str] = []
    if files:
        client = AirtableClient()
        gmail = GmailClient()
        settings = load_settings()
        to_addr = str(settings.get("a2_email_to") or DEFAULT_EMAIL_TO).strip()
        batch_id = str(preview["intake_batch_id"])
        for item in files:
            file_id = str(item.get("id") or "")
            name = str(item.get("name") or "")
            mime = str(item.get("mimeType") or "")
            size = parse_bytes(item.get("size"))
            existing = existing_intake_record(client, file_id=file_id, name=name, size=size)
            if existing:
                skipped_existing.append(file_id)
                if file_id:
                    try:
                        drive.trash_file(file_id)
                    except Exception:
                        pass
                continue
            shared = drive.share_anyone_reader(file_id)
            share_url = str(shared.get("webContentLink") or shared.get("webViewLink") or "")
            if size > MAX_FILE_BYTES:
                skipped_oversize.append(file_id)
                continue
            created = client.create_records(
                MEDIA_ASSETS_TABLE,
                [_intake_fields(item, share_url=share_url, batch_id=batch_id)],
                typecast=True,
            )
            record_id = created[0]["id"] if created else ""
            route = classify_intake_file(name, mime)
            dest = GDRIVE_FOLDERS[route]
            moved = drive.move_file(file_id, dest, remove_parent_id=GDRIVE_INGESTION_FOLDER)
            moved_id = str(moved.get("id") or file_id)
            overlay = a2_route_fields(route, name, moved_id)
            if route == "audio":
                try:
                    converted = apply_drive_wav_to_mp3(drive, moved_id, filename=name, mime_type=mime)
                    if converted.changed:
                        name = converted.filename
                        mime = converted.mime_type
                        overlay["Asset Name"] = name
                        overlay["MIME_Type"] = converted.mime_type
                        overlay["File_Extension"] = "mp3"
                        overlay["File_Size_Bytes"] = converted.file_size_bytes
                        size = converted.file_size_bytes
                except Exception:
                    pass
            if route == "audio" and not is_voiceover_audio(filename=name, role=str(overlay.get("Asset_Role") or "")):
                try:
                    silence = apply_drive_leading_silence(drive, moved_id, filename=name, mime_type=mime)
                    overlay.update(silence.airtable_fields())
                    if silence.content:
                        overlay["File_Size_Bytes"] = len(silence.content)
                        size = len(silence.content)
                except Exception:
                    overlay["Leading_Silence_Status"] = STATUS_FAILED
                    overlay["Leading_Silence_Removed_Seconds"] = 0
            client.update_record(MEDIA_ASSETS_TABLE, record_id, overlay, typecast=True)
            size_mb = round(size / 1048576, 2)
            gmail.send_html(
                to=to_addr,
                subject=intake_subject(route, name),
                html_body=intake_email_html(
                    route=route,
                    name=name,
                    media_class=str(overlay["Media_Class"]),
                    asset_role=str(overlay["Asset_Role"]),
                    eligibility=str(overlay["Raw_Source_Eligibility"]),
                    folder_label=FOLDER_LABELS[route],
                    size_mb=size_mb,
                    mime=mime,
                    drive_link=str(moved.get("webContentLink") or share_url),
                    record_id=record_id,
                    batch_id=batch_id,
                ),
            )
            intaken.append(record_id)

    preview["intaken_ids"] = intaken
    preview["skipped_oversize_ids"] = skipped_oversize
    preview["skipped_existing_ids"] = skipped_existing
    next_result = None
    if trigger_a2b:
        next_result = _daisy_a2b(wait_for_next=wait_for_next, test_run_id=test_run_id)
    return {
        "processed": True,
        "files_found": bool(files),
        "intaken_count": len(intaken),
        "skipped_oversize_count": len(skipped_oversize),
        "skipped_existing_count": len(skipped_existing),
        "a2b": next_result,
        **preview,
    }


def _merge_pass(total: dict[str, Any], result: dict[str, Any]) -> None:
    total["intaken_ids"].extend(result.get("intaken_ids") or [])
    total["skipped_oversize_ids"].extend(result.get("skipped_oversize_ids") or [])
    total["skipped_existing_ids"].extend(result.get("skipped_existing_ids") or [])
    total["file_ids"] = list(result.get("file_ids") or [])
    total["files_found"] = bool(total["files_found"] or result.get("files_found"))
    total["intake_passes"] = int(total.get("intake_passes") or 0) + 1


def drain_until_idle(
    *,
    trigger_a2b: bool = True,
    wait_for_next: bool = True,
    test_run_id: str | None = None,
) -> dict[str, Any]:
    preview = _preview_base(test_run_id=test_run_id)
    total: dict[str, Any] = {
        **preview,
        "intaken_ids": [],
        "skipped_oversize_ids": [],
        "skipped_existing_ids": [],
        "file_ids": [],
        "files_found": False,
        "intake_passes": 0,
        "compression_started": False,
        "a1s": None,
        "a2b": None,
    }
    started_a1s = False
    for _pass in range(A2_DRAIN_MAX_PASSES):
        result = _intake_pass(trigger_a2b=False, wait_for_next=False, test_run_id=test_run_id)
        _merge_pass(total, result)
        if result.get("skipped_oversize_count") and not started_a1s:
            try:
                total["a1s"] = _start_oversize_compression()
                started_a1s = True
                total["compression_started"] = True
            except Exception:
                logger.exception("A2 drain could not start oversized compression")
        if not result.get("intaken_count"):
            break
    if trigger_a2b:
        total["a2b"] = _daisy_a2b(wait_for_next=True, test_run_id=test_run_id)
    return {
        "processed": True,
        "drained": True,
        "files_found": bool(total["files_found"]),
        "intaken_count": len(total["intaken_ids"]),
        "skipped_oversize_count": len(total["skipped_oversize_ids"]),
        "skipped_existing_count": len(total["skipped_existing_ids"]),
        **total,
    }


def process_request(
    *,
    dry_run: bool = False,
    trigger_a2b: bool = True,
    wait_for_next: bool = True,
    test_run_id: str | None = None,
    drain: bool = False,
    wait: bool = False,
) -> dict[str, Any]:
    preview = _preview_base(test_run_id=test_run_id)
    if dry_run:
        drive = GoogleDriveClient()
        files = _list_ingestion_files(drive)
        preview["file_ids"] = [str(item.get("id") or "") for item in files]
        preview["files_found"] = bool(files)
        preview["routes"] = [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "mime": item.get("mimeType"),
                "route": classify_intake_file(str(item.get("name") or ""), str(item.get("mimeType") or "")),
                "size": parse_bytes(item.get("size")),
            }
            for item in files
        ]
        return {"processed": False, "dry_run": True, **preview}

    if drain:
        if not _INTAKE_LOCK.acquire(blocking=False):
            return {
                "processed": False,
                "reason": "intake_already_running",
                "intaken_count": 0,
                "skipped_oversize_count": 0,
                "skipped_existing_count": 0,
                "files_found": False,
                **preview,
            }
        drive = GoogleDriveClient()
        try:
            files = _list_ingestion_files(drive)
        except Exception:
            _INTAKE_LOCK.release()
            raise
        preview["file_ids"] = [str(item.get("id") or "") for item in files]
        preview["files_found"] = bool(files)

        def _run() -> None:
            try:
                drain_until_idle(
                    trigger_a2b=False,
                    wait_for_next=False,
                    test_run_id=test_run_id,
                )
            except Exception:
                logger.exception("A2 intake drain failed")
            finally:
                _INTAKE_LOCK.release()
            if trigger_a2b:
                try:
                    _daisy_a2b(wait_for_next=True, test_run_id=test_run_id)
                except Exception:
                    logger.exception("A2 drain could not daisy-chain A2B")

        thread = threading.Thread(target=_run, daemon=True, name="a2-intake-drain")
        thread.start()
        if wait:
            thread.join()
        return {
            "processed": True,
            "draining": True,
            "files_found": bool(files),
            "intaken_count": 0,
            "skipped_oversize_count": 0,
            "skipped_existing_count": 0,
            **preview,
        }

    acquired = _INTAKE_LOCK.acquire(blocking=True, timeout=15 * 60)
    if not acquired:
        return {
            "processed": False,
            "reason": "intake_already_running",
            "intaken_count": 0,
            "skipped_oversize_count": 0,
            "skipped_existing_count": 0,
            "files_found": False,
            **preview,
        }
    try:
        return _intake_pass(
            trigger_a2b=trigger_a2b,
            wait_for_next=wait_for_next,
            test_run_id=test_run_id,
        )
    finally:
        _INTAKE_LOCK.release()
