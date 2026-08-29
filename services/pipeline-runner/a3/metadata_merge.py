"""Merge embedded photo metadata, smart filenames, and A3 AI tags onto Media Assets."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from asset.helpers import join_list

_FILENAME_STOPWORDS = {
    "a", "an", "the",
    "img", "image", "photo", "pic", "jpeg", "jpg", "png", "webp", "heic", "dsc", "copy", "final",
}


def parse_filename_metadata(name: str) -> dict[str, Any]:
    raw = str(name or "").strip()
    stem = Path(raw).stem if raw else ""
    phrase = re.sub(r"[_\-]+", " ", stem).strip()
    phrase = re.sub(r"\s+", " ", phrase)
    tokens: list[str] = []
    for part in re.split(r"[\s_\-]+", stem):
        token = re.sub(r"[^a-z0-9]+", "", part.lower())
        if len(token) < 2 or token in _FILENAME_STOPWORDS:
            continue
        if token not in tokens:
            tokens.append(token)
    return {
        "filename": raw,
        "filename_phrase": phrase,
        "filename_tokens": tokens,
    }


def split_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    if not text:
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


def unique_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        cleaned = re.sub(r"\s+", " ", str(item or "")).strip()
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out


def authoritative_metadata_terms(meta: dict[str, Any] | None, asset_name: str) -> tuple[list[str], list[str], str]:
    payload = meta if isinstance(meta, dict) else {}
    filename = parse_filename_metadata(str(payload.get("filename") or asset_name or ""))
    phrase = str(payload.get("filename_phrase") or filename.get("filename_phrase") or "").strip()
    filename_tokens = [
        str(item).strip()
        for item in (payload.get("filename_tokens") or filename.get("filename_tokens") or [])
        if str(item).strip()
    ]
    embedded_keywords = [
        str(item).strip()
        for item in (payload.get("keywords") or [])
        if str(item).strip()
    ]
    description = str(payload.get("description") or "").strip()
    if not description:
        descriptions = payload.get("descriptions") or []
        if isinstance(descriptions, list) and descriptions:
            description = str(descriptions[0] or "").strip()

    search_terms: list[str] = []
    ai_terms: list[str] = []
    if phrase:
        search_terms.append(phrase)
        ai_terms.append(phrase)
    search_terms.extend(filename_tokens)
    search_terms.extend(embedded_keywords)
    ai_terms.extend(filename_tokens)
    ai_terms.extend(embedded_keywords)
    return unique_preserve_order(search_terms), unique_preserve_order(ai_terms), description


def merge_photo_metadata_fields(
    fields: dict[str, Any],
    meta: dict[str, Any] | None,
    asset_name: str,
) -> dict[str, Any]:
    merged = dict(fields)
    search_authority, ai_authority, embedded_description = authoritative_metadata_terms(meta, asset_name)

    merged["Search_Keywords"] = join_list(
        unique_preserve_order(search_authority + split_list(merged.get("Search_Keywords")))
    )
    merged["AI_Tags"] = join_list(
        unique_preserve_order(ai_authority + split_list(merged.get("AI_Tags")))
    )

    if embedded_description:
        current_description = str(merged.get("Asset_Description") or "").strip()
        if not current_description:
            merged["Asset_Description"] = embedded_description
        elif embedded_description.casefold() not in current_description.casefold():
            merged["Asset_Description"] = f"{embedded_description} {current_description}".strip()

    evidence_parts: list[str] = []
    phrase = parse_filename_metadata(asset_name).get("filename_phrase") or ""
    if phrase:
        evidence_parts.append(f"Smart filename: {phrase}")
    if search_authority:
        evidence_parts.append(f"Metadata keywords: {', '.join(search_authority[:24])}")
    if embedded_description:
        evidence_parts.append(f"Embedded description: {embedded_description[:240]}")
    if isinstance(meta, dict) and meta.get("sources"):
        evidence_parts.append(f"Metadata sources: {', '.join(str(item) for item in meta.get('sources') or [])}")
    if isinstance(meta, dict) and meta.get("error"):
        evidence_parts.append(f"Embedded metadata unavailable: {meta.get('error')}")

    prior_evidence = str(merged.get("Evidence_From_Metadata") or "").strip()
    if evidence_parts:
        merged_evidence = "; ".join(evidence_parts)
        merged["Evidence_From_Metadata"] = f"{merged_evidence}; {prior_evidence}".strip("; ").strip()
    merged["Metadata_Used"] = True
    return merged
