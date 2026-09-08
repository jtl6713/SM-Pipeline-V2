"""Helpers to skip Drive intake files that already have a Media Asset."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from asset.constants import GDRIVE_FOLDERS, GDRIVE_INGESTION_FOLDER


def airtable_quote(value: str) -> str:
    return '"' + str(value or "").replace("\\", "\\\\").replace('"', '\\"') + '"'


def intake_name_key(name: str) -> str:
    raw = str(name or "").strip()
    stem = Path(raw).stem
    stem = re.sub(r" \(\d+\)$", "", stem)
    return f"{stem}{Path(raw).suffix}".strip()


def intake_duplicate_formulas(file_id: str, name: str, size: int | None) -> list[tuple[str, str]]:
    formulas: list[tuple[str, str]] = []
    drive_id = str(file_id or "").strip()
    exact = str(name or "").strip()
    key = intake_name_key(exact)
    if drive_id:
        formulas.append((f"{{Google Drive File ID}}={airtable_quote(drive_id)}", "drive_id"))
    if exact and size is not None:
        formulas.append((f"AND({{Asset Name}}={airtable_quote(exact)},{{File_Size_Bytes}}={int(size)})", "name_size"))
    if key and key != exact and size is not None:
        formulas.append((f"AND({{Asset Name}}={airtable_quote(key)},{{File_Size_Bytes}}={int(size)})", "name_size"))
    return formulas


def parent_ids(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def typed_folder_ids(folders: dict[str, str] | None = None) -> set[str]:
    src = folders if folders is not None else GDRIVE_FOLDERS
    return {str(item).strip() for item in src.values() if str(item).strip()}


def existing_drive_id(record: dict[str, Any] | None) -> str:
    fields = (record or {}).get("fields") if isinstance(record, dict) else {}
    if not isinstance(fields, dict):
        fields = {}
    return str(fields.get("Google Drive File ID") or "").strip()


def processed_residue_action(
    *,
    leftover_id: str,
    leftover_parents: list[str] | None,
    existing_drive_id: str,
    existing_parents: list[str] | None,
    duplicate_reason: str | None,
    ingestion_folder_id: str | None = None,
    typed_ids: set[str] | None = None,
) -> str:
    """Safe heal for a leftover that already has a Media Asset. Never trash the only copy."""
    leftover = str(leftover_id or "").strip()
    existing = str(existing_drive_id or "").strip()
    ingestion = str(ingestion_folder_id or GDRIVE_INGESTION_FOLDER).strip()
    typed = typed_ids if typed_ids is not None else typed_folder_ids()
    leftover_set = set(parent_ids(leftover_parents))
    existing_set = set(parent_ids(existing_parents))
    leftover_in_typed = bool(leftover_set & typed)
    existing_in_typed = bool(existing_set & typed)
    leftover_only_ingestion = leftover_set == {ingestion}
    extra_ingestion_parent = leftover == existing and ingestion in leftover_set and leftover_in_typed

    if extra_ingestion_parent:
        return "remove_ingestion_parent"
    if leftover and existing and leftover != existing and str(duplicate_reason or "") == "name_size":
        if existing_in_typed and leftover_only_ingestion and leftover:
            return "trash_leftover"
    if leftover == existing and leftover_only_ingestion:
        return "retry_move"
    return "none"
