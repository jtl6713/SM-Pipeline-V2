"""Helpers to skip Drive intake files that already have a Media Asset."""

from __future__ import annotations

import re
from pathlib import Path


def airtable_quote(value: str) -> str:
    return '"' + str(value or "").replace("\\", "\\\\").replace('"', '\\"') + '"'


def intake_name_key(name: str) -> str:
    raw = str(name or "").strip()
    stem = Path(raw).stem
    stem = re.sub(r" \(\d+\)$", "", stem)
    return f"{stem}{Path(raw).suffix}".strip()


def intake_duplicate_formulas(file_id: str, name: str, size: int | None) -> list[str]:
    formulas: list[str] = []
    drive_id = str(file_id or "").strip()
    exact = str(name or "").strip()
    key = intake_name_key(exact)
    if drive_id:
        formulas.append(f"{{Google Drive File ID}}={airtable_quote(drive_id)}")
    if exact and size is not None:
        formulas.append(f"AND({{Asset Name}}={airtable_quote(exact)},{{File_Size_Bytes}}={int(size)})")
    if key and key != exact and size is not None:
        formulas.append(f"AND({{Asset Name}}={airtable_quote(key)},{{File_Size_Bytes}}={int(size)})")
    return formulas
