"""Strict, read-only discovery of explicitly named Studio library photos.

Names are suggestions from the saved user conversation, never media authority.
Only the source output's Chicago profile, rights and master Drive proof can make
a library photo eligible for a subsequent, separately authorized link operation.
"""
from __future__ import annotations

import re

MAX_REQUESTED_NAMES = 16
_ALLOWED = re.compile(r"[A-Za-z][A-Za-z0-9 &().,'-]{2,100}\Z")
_BARE_ASSET = re.compile(r"[A-Za-z][A-Za-z0-9 &().,'-]{2,90}\s+\d{1,3}\Z")
_BATCH = re.compile(
    r"\b(?P<base>(?:[A-Z][A-Za-z0-9'&-]+\s+){1,5})"
    r"(?P<first>\d{1,3})(?P<tail>(?:\s*,\s*\d{1,3}){1,15})"
)
_LEADING_INSTRUCTION = {"Please", "Remove", "Replace", "Keep", "Use",
                        "Include", "Then", "Add", "Photos", "Images"}


def _clean_name(value):
    name = " ".join(str(value or "").strip().strip('"\u201c\u201d\x60').split())
    if not _ALLOWED.fullmatch(name) or not _BARE_ASSET.fullmatch(name):
        return ""
    return name


def latest_explicit_photo_list(messages):
    """Newest complete named-photo selection, not a union of superseded turns.

    A later user's explicit list replaces earlier lists. Incidental references
    to removed photos in prose cannot reintroduce them into a V3 proposal.
    Only human messages participate; no model text is allowed here.
    """
    if not isinstance(messages, list):
        return []
    for message in reversed(messages[-30:]):
        if not isinstance(message, dict) or message.get("role") != "user":
            continue
        content = str(message.get("content") or "")[:3000]
        current, seen = [], set()

        def add(value):
            name = _clean_name(value)
            key = name.casefold()
            if name and key not in seen and len(current) < MAX_REQUESTED_NAMES:
                current.append(name)
                seen.add(key)

        for line in content.splitlines():
            stripped = line.strip()
            # A marked list has higher authority than incidental names in prose.
            if stripped.startswith(("-", "*", "\u2022")):
                add(stripped.lstrip("-*\u2022 ").strip())
            for match in _BATCH.finditer(line):
                base = match.group("base").strip().split()
                while len(base) > 2 and base[0] in _LEADING_INSTRUCTION:
                    base.pop(0)
                stem = " ".join(base)
                for number in [match.group("first"), *re.findall(r"\d{1,3}", match.group("tail"))]:
                    add(f"{stem} {number}")
        if len(current) >= 2:
            return current
    return []


def requested_library_names(messages):
    """Discover the current requested list without resurrecting deleted images.

    A complete newer selection is authoritative for discovery. A single-name
    casual remark is not a replacement for an earlier multi-image selection.
    """
    explicit = latest_explicit_photo_list(messages)
    if explicit:
        return explicit
    return []


def exact_library_name_formula(names):
    """Only allowlist-validated exact strings enter an Airtable formula.

    Never query another profile by user-selected navigation context. The caller
    must also independently validate returned rights, Drive and profile fields.
    """
    safe = []
    for name in names[:MAX_REQUESTED_NAMES]:
        clean = _clean_name(name)
        if clean:
            safe.append('LOWER({Asset Name}&"")="' + clean.casefold() + '"')
    if not safe:
        return None
    return ('AND({Asset_Status}="Available",'
            '{Rights_Status}="Owned",{Active}=1,NOT({Do_Not_Use}),'
            + ('OR(' + ",".join(safe) + ')' if len(safe) > 1 else safe[0]) + ')'
           )
