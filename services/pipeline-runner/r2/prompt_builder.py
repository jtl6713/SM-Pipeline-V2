"""Build R2 OpenAI prompt from Make module 7 template."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

_TEMPLATE_PATH = Path(__file__).with_name("prompt_template.txt")
_MARKER = "STUDIO_EXACT_SOURCE_AUTHORITY_V1"


def _field(record: dict[str, Any] | None, name: str) -> str:
    if not record:
        return ""
    return str(record.get("fields", {}).get(name) or "").strip()


def _dedupe_studio_guard(text: str) -> str:
    parts = text.split(_MARKER)
    if len(parts) <= 2:
        return text
    # Keep preamble + final guard block (uses {{3.*}} placeholders).
    return parts[0] + _MARKER + parts[-1]


def _aggregate_candidates(rows: list[dict[str, Any]], *, kind: str) -> str:
    blocks: list[str] = []
    for index, row in enumerate(rows, start=1):
        fields = row.get("fields", {})
        blocks.append(
            "\n".join(
                [
                    f"Candidate {index}",
                    f"media_asset_record_id: {row.get('id', '')}",
                    f"asset_name: {fields.get('Asset Name', '')}",
                    f"google_drive_url: {fields.get('Google Drive URL', '')}",
                    f"media_class: {fields.get('Media_Class', '')}",
                    f"asset_role: {fields.get('Asset_Role', '')}",
                    f"quality_score: {fields.get('Quality_Score', '')}",
                    f"usefulness_score: {fields.get('Usefulness_Score', '')}",
                    f"duration_seconds: {fields.get('Duration_Seconds', '')}",
                    f"topic: {fields.get('Topic', '')}",
                    f"location: {fields.get('Location', '')}",
                    f"mood: {fields.get('Mood', '')}",
                    f"ai_tags: {fields.get('AI_Tags', '')}",
                    f"asset_description: {fields.get('Asset_Description', '') or fields.get('Asset Description', '')}",
                    f"rotation_priority: {index if kind == 'music' else ''}",
                ]
            )
        )
    prefix = "VIDEO_CANDIDATES" if kind == "video" else "MUSIC_CANDIDATES"
    return f"{prefix}:\n\n" + ("\n\n".join(blocks) if blocks else "(none)")


def _resolve_ifempty(expr: str, output: dict[str, Any], content: dict[str, Any] | None) -> str:
    match = re.fullmatch(r'ifempty\(([^;]+);\s*"([^"]*)"\)', expr.strip())
    if not match:
        return expr
    inner, default = match.group(1).strip(), match.group(2)
    value = _resolve_ref(inner, output, content, "", "")
    return value if value else default


def _resolve_if_contains(expr: str, output: dict[str, Any], content: dict[str, Any] | None) -> str:
    match = re.fullmatch(
        r'if\(contains\(ifempty\(([^)]+)\);\s*"([^"]*)"\);\s*"([^"]*)";\s*([^)]+)\)',
        expr.strip(),
    )
    if not match:
        return expr
    field_expr, needle, true_val, false_expr = match.groups()
    haystack = _resolve_ref(field_expr, output, content, "", "")
    if needle in haystack:
        return true_val
    return _resolve_ref(false_expr, output, content, "", "")


def _resolve_ref(
    ref: str,
    output: dict[str, Any],
    content: dict[str, Any] | None,
    video_text: str,
    music_text: str,
) -> str:
    ref = ref.strip()
    if ref == "6.text":
        return video_text
    if ref == "11.text":
        return music_text
    if ref.startswith("1."):
        return _field(output, ref[2:])
    if ref.startswith("3."):
        return _field(content, ref[2:])
    if ref.startswith("ifempty("):
        return _resolve_ifempty(ref, output, content)
    if ref.startswith("if("):
        return _resolve_if_contains(ref, output, content)
    return ref


def _substitute(template: str, output: dict[str, Any], content: dict[str, Any] | None, video_text: str, music_text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        inner = match.group(1).strip()
        if inner == "6.text":
            return video_text
        if inner == "11.text":
            return music_text
        if inner.startswith("1."):
            return _field(output, inner[2:])
        if inner.startswith("3."):
            return _field(content, inner[2:])
        if inner.startswith("ifempty("):
            return _resolve_ifempty(inner, output, content)
        if inner.startswith("if("):
            return _resolve_if_contains(inner, output, content)
        return ""

    return re.sub(r"\{\{([^}]+)\}\}", repl, template)


def build_prompt(
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    video_candidates: list[dict[str, Any]],
    music_candidates: list[dict[str, Any]],
) -> str:
    template = _dedupe_studio_guard(_TEMPLATE_PATH.read_text(encoding="utf-8"))
    video_text = _aggregate_candidates(video_candidates, kind="video")
    music_text = _aggregate_candidates(music_candidates, kind="music")

    selected_json = _field(output, "Selected_Assets_JSON")
    if "studio_owner_uploaded_exact_source" in selected_json:
        studio_status = "Ready"
        studio_package = selected_json
    else:
        studio_status = _field(content_item, "Studio_Source_Authority_Status")
        studio_package = _field(content_item, "Studio_Source_Selected_Assets_JSON")

    prompt = _substitute(template, output, content_item, video_text, music_text)
    prompt = prompt.replace(
        "Studio exact-source status: {{3.Studio_Source_Authority_Status}}",
        f"Studio exact-source status: {studio_status}",
    )
    prompt = prompt.replace(
        "Studio locked visual package: {{3.Studio_Source_Selected_Assets_JSON}}",
        f"Studio locked visual package: {studio_package}",
    )
    return prompt
