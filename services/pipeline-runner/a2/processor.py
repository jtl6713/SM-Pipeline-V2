"""A2 processor — Drive ingestion folder intake + MIME routing (Make 5531974)."""

from __future__ import annotations

from typing import Any

from a2.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from a2.email_builder import intake_email_html, intake_subject
from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from asset.chain import daisy_payload, trigger_next
from asset.constants import (
    A2_DRIVE_PAGE_SIZE,
    DEFAULT_EMAIL_TO,
    GDRIVE_FOLDERS,
    GDRIVE_INGESTION_FOLDER,
    MAX_FILE_BYTES,
)
from asset.helpers import as_bool, parse_bytes
from asset.routing import a2_route_fields, classify_intake_file
from audio.leading_silence import STATUS_FAILED, apply_drive_leading_silence, is_voiceover_audio
from carousel.timeutil import chicago_now, iso_ms
from config import load_settings
from integrations.gmail import GmailClient
from integrations.google_drive import GoogleDriveClient

FOLDER_LABELS = {
    "video": "ChicagoShining / Assets / Video",
    "branding": "ChicagoShining / Assets / Branding",
    "image": "ChicagoShining / Assets / Photos / Ingestion Intake",
    "other": "ChicagoShining / Assets / Misc",
    "audio": "ChicagoShining / Assets / Music",
}


def _intake_fields(file: dict[str, Any], *, share_url: str, batch_id: str) -> dict[str, Any]:
    return {
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


def process_request(
    *,
    dry_run: bool = False,
    trigger_a2b: bool = True,
    wait_for_next: bool = True,
    test_run_id: str | None = None,
) -> dict[str, Any]:
    batch_id = chicago_now().strftime("%Y-%m-%d-%H") + "-AssetIntake"
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "intake_batch_id": batch_id,
        "test_run_id": test_run_id,
    }
    drive = GoogleDriveClient()
    files = drive.list_files(
        query=f"'{GDRIVE_INGESTION_FOLDER}' in parents and trashed = false",
        page_size=A2_DRIVE_PAGE_SIZE,
    )
    preview["file_ids"] = [str(item.get("id") or "") for item in files]
    preview["files_found"] = bool(files)
    if dry_run:
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

    intaken: list[str] = []
    skipped_oversize: list[str] = []
    if files:
        client = AirtableClient()
        gmail = GmailClient()
        settings = load_settings()
        to_addr = str(settings.get("a2_email_to") or DEFAULT_EMAIL_TO).strip()
        for item in files:
            file_id = str(item.get("id") or "")
            name = str(item.get("name") or "")
            mime = str(item.get("mimeType") or "")
            size = parse_bytes(item.get("size"))
            shared = drive.share_anyone_reader(file_id)
            share_url = str(shared.get("webContentLink") or shared.get("webViewLink") or "")
            if size >= MAX_FILE_BYTES:
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
    next_result = None
    if trigger_a2b:
        from a2b.processor import process_request as process_a2b

        next_result = trigger_next(
            "a2b",
            daisy_payload("a2b"),
            python_call=lambda: process_a2b(
                dry_run=False,
                trigger_a3=True,
                wait_for_next=wait_for_next,
                test_run_id=test_run_id,
            ),
            wait=as_bool(wait_for_next, True),
        )
    return {
        "processed": True,
        "files_found": bool(files),
        "intaken_count": len(intaken),
        "skipped_oversize_count": len(skipped_oversize),
        "a2b": next_result,
        **preview,
    }
