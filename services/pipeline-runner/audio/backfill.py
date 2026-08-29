"""Reprocess existing Media Assets audio so leading silence is capped at 0.5s."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from audio.leading_silence import (
    STATUS_CAPPED,
    STATUS_FAILED,
    STATUS_NOT_NEEDED,
    apply_drive_leading_silence,
    is_voiceover_audio,
)
from integrations.google_drive import GoogleDriveClient
from render.fields import field, field_str

AUDIO_FIELDS = [
    "Asset Name",
    "Media_Class",
    "Asset_Role",
    "Google Drive File ID",
    "MIME_Type",
    "File_Extension",
    "File_Size_Bytes",
    "Do_Not_Use",
    "Leading_Silence_Status",
    "Leading_Silence_Removed_Seconds",
    "Leading_Silence_Processed_At",
]


def _pending_formula(*, force: bool) -> str:
    base = (
        "AND({Media_Class}='Audio',{Asset_Role}!='Voiceover',"
        "{Google Drive File ID}!='',NOT({Do_Not_Use}))"
    )
    if force:
        return base
    return (
        f"AND({base},"
        "OR({Leading_Silence_Status}=BLANK(),{Leading_Silence_Status}='Failed')"
        ")"
    )


def _record_ids_formula(record_ids: list[str], *, force: bool) -> str:
    ors = ",".join(f"RECORD_ID()='{item}'" for item in record_ids)
    return f"AND({_pending_formula(force=force)},OR({ors}))"


def process_request(
    *,
    dry_run: bool = False,
    force: bool = False,
    record_ids: list[str] | None = None,
    max_records: int = 200,
) -> dict[str, Any]:
    wanted = [str(item or "").strip() for item in (record_ids or []) if str(item or "").strip()]
    formula = _record_ids_formula(wanted, force=force) if wanted else _pending_formula(force=force)
    client = AirtableClient()
    records = client.list_records(
        MEDIA_ASSETS_TABLE,
        formula=formula,
        max_records=max_records,
        fields=AUDIO_FIELDS,
    )
    drive = GoogleDriveClient() if not dry_run else None
    results: list[dict[str, Any]] = []
    capped = 0
    not_needed = 0
    failed = 0
    skipped = 0

    for record in records:
        record_id = str(record.get("id") or "")
        name = field_str(record, "Asset Name") or "track.mp3"
        file_id = field_str(record, "Google Drive File ID")
        mime = field_str(record, "MIME_Type") or "audio/mpeg"
        status = field_str(record, "Leading_Silence_Status")
        role = field_str(record, "Asset_Role")
        if is_voiceover_audio(filename=name, role=role):
            skipped += 1
            results.append({"record_id": record_id, "status": "skipped", "reason": "voiceover"})
            continue
        if not file_id:
            skipped += 1
            results.append({"record_id": record_id, "status": "skipped", "reason": "missing_drive_id"})
            continue
        if not force and status in {STATUS_NOT_NEEDED, STATUS_CAPPED}:
            skipped += 1
            results.append({"record_id": record_id, "status": "skipped", "reason": "already_processed"})
            continue
        if dry_run:
            results.append({
                "record_id": record_id,
                "asset_name": name,
                "google_drive_file_id": file_id,
                "status": "would_process",
                "current_status": status or None,
            })
            continue
        assert drive is not None
        try:
            trim = apply_drive_leading_silence(drive, file_id, filename=name, mime_type=mime)
            fields = {
                **trim.airtable_fields(),
                "File_Size_Bytes": len(trim.content) or field(record, "File_Size_Bytes"),
            }
            client.update_record(MEDIA_ASSETS_TABLE, record_id, fields, typecast=True)
            if trim.status == STATUS_CAPPED:
                capped += 1
            elif trim.status == STATUS_NOT_NEEDED:
                not_needed += 1
            else:
                failed += 1
            results.append({
                "record_id": record_id,
                "asset_name": name,
                "google_drive_file_id": file_id,
                **trim.public_dict(),
            })
        except Exception as exc:
            failed += 1
            try:
                client.update_record(
                    MEDIA_ASSETS_TABLE,
                    record_id,
                    {
                        "Leading_Silence_Status": STATUS_FAILED,
                        "Leading_Silence_Removed_Seconds": 0,
                    },
                    typecast=True,
                )
            except Exception:
                pass
            results.append({
                "record_id": record_id,
                "asset_name": name,
                "google_drive_file_id": file_id,
                "leading_silence_status": STATUS_FAILED,
                "leading_silence_error": str(exc),
            })

    return {
        "ok": True,
        "dry_run": dry_run,
        "force": force,
        "matched": len(records),
        "capped": capped,
        "not_needed": not_needed,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }
