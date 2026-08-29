"""Extract embedded photo metadata and smart filename tokens for A3."""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image
from PIL.ExifTags import TAGS

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


def _decode_exif_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        for encoding in ("utf-8", "utf-16-le", "latin-1"):
            try:
                return value.decode(encoding).strip("\x00").strip()
            except UnicodeDecodeError:
                continue
        return ""
    if isinstance(value, tuple):
        return " ".join(_decode_exif_value(item) for item in value if _decode_exif_value(item))
    return str(value).strip()


def _exif_fields(image: Image.Image) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        exif = image.getexif()
    except Exception:
        return out
    if not exif:
        return out
    for tag_id, raw in exif.items():
        tag = TAGS.get(tag_id, str(tag_id))
        text = _decode_exif_value(raw)
        if text:
            out[str(tag)] = text
    return out


def _xmp_strings(data: bytes) -> dict[str, list[str]]:
    text = data.decode("utf-8", errors="ignore")
    keywords: list[str] = []
    descriptions: list[str] = []

    for block in re.findall(r"<dc:subject[^>]*>.*?</dc:subject>", text, flags=re.S):
        keywords.extend(re.findall(r"<rdf:li>([^<]+)</rdf:li>", block, flags=re.I))

    for tag in ("dc:description", "dc:title", "photoshop:Headline", "Iptc4xmpCore:Location"):
        for match in re.findall(rf"<{tag}[^>]*>([^<]+)</{tag}>", text, flags=re.I):
            descriptions.append(match.strip())

    for match in re.findall(r"<rdf:li>([^<]+)</rdf:li>", text, flags=re.I):
        candidate = match.strip()
        if candidate and candidate not in keywords and len(candidate) <= 120:
            keywords.append(candidate)

    def unique(items: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for item in items:
            cleaned = re.sub(r"\s+", " ", item).strip()
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(cleaned)
        return out

    return {
        "keywords": unique(keywords),
        "descriptions": unique(descriptions),
    }


def _collect_keywords(exif: dict[str, str], xmp: dict[str, list[str]]) -> list[str]:
    keywords: list[str] = []
    for key in ("XPKeywords", "Keywords", "Subject"):
        if exif.get(key):
            keywords.extend(part.strip() for part in re.split(r"[;,]", exif[key]) if part.strip())
    keywords.extend(xmp.get("keywords") or [])

    seen: set[str] = set()
    out: list[str] = []
    for item in keywords:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def extract_image_metadata(content: bytes, *, asset_name: str = "") -> dict[str, Any]:
    filename_meta = parse_filename_metadata(asset_name)
    xmp = _xmp_strings(content)
    description = ""
    width = None
    height = None
    exif: dict[str, str] = {}

    try:
        with Image.open(BytesIO(content)) as image:
            width, height = image.size
            exif = _exif_fields(image)
    except Exception as exc:
        return {
            **filename_meta,
            "ok": False,
            "error": str(exc),
            "keywords": filename_meta["filename_tokens"],
            "descriptions": [],
            "location": "",
            "datetime_original": "",
            "width": width,
            "height": height,
            "exif": exif,
            "xmp": xmp,
            "sources": ["filename"],
        }

    for key in ("ImageDescription", "XPComment", "UserComment"):
        if exif.get(key):
            description = exif[key]
            break
    if not description and xmp.get("descriptions"):
        description = xmp["descriptions"][0]

    embedded_keywords = _collect_keywords(exif, xmp)
    sources = []
    if filename_meta["filename_phrase"] or filename_meta["filename_tokens"]:
        sources.append("filename")
    if embedded_keywords or description:
        sources.append("embedded")
    if xmp.get("keywords") or xmp.get("descriptions"):
        sources.append("xmp")
    if exif:
        sources.append("exif")

    return {
        **filename_meta,
        "ok": True,
        "keywords": embedded_keywords,
        "descriptions": xmp.get("descriptions") or ([description] if description else []),
        "description": description,
        "location": exif.get("GPSInfo") or "",
        "datetime_original": exif.get("DateTimeOriginal") or exif.get("DateTime") or "",
        "width": width,
        "height": height,
        "exif": exif,
        "xmp": xmp,
        "sources": sources,
    }
