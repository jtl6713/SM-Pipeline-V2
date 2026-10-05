"""ITS1 processor — idea timed-script from a library still catalog."""

from __future__ import annotations

from typing import Any

from its1.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from its1.openai_script import generate_timed_script
from its1.prompt import build_timed_script_prompt


def _still_id(item: dict[str, Any] | None) -> str:
    if not isinstance(item, dict):
        return ""
    return str(item.get("id") or item.get("media_asset_id") or "").strip()


def _still_name(item: dict[str, Any] | None) -> str:
    if not isinstance(item, dict):
        return ""
    return str(item.get("name") or item.get("asset_name") or "").strip()


def _name_key(value: str) -> str:
    import re

    text = re.sub(r"\.[a-z0-9]{2,4}$", "", str(value or "").strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _match_catalog(scene: dict[str, Any], catalog: list[dict[str, Any]], used: set[str]) -> dict[str, Any] | None:
    hinted = str(scene.get("media_asset_id") or scene.get("asset_id") or "").strip()
    if hinted:
        for item in catalog:
            item_id = _still_id(item)
            if item_id == hinted and item_id not in used:
                return item
    key = _name_key(str(scene.get("suggested_visual") or ""))
    if not key:
        return None
    exact = [item for item in catalog if _name_key(_still_name(item)) == key and _still_id(item) not in used]
    if exact:
        return exact[0]
    contains = [
        item
        for item in catalog
        if _still_id(item) not in used
        and (_name_key(_still_name(item)).find(key) >= 0 or key.find(_name_key(_still_name(item))) >= 0)
        and min(len(_name_key(_still_name(item))), len(key)) >= 8
    ]
    if len(contains) == 1:
        return contains[0]
    return None


def normalize_scenes(parsed: dict[str, Any] | None, catalog: list[dict[str, Any]]) -> list[dict[str, str]]:
    raw = parsed.get("scenes") if isinstance(parsed, dict) else None
    if not isinstance(raw, list):
        raw = parsed.get("slide_voiceovers") if isinstance(parsed, dict) else None
    rows: list[dict[str, str]] = []
    used: set[str] = set()
    leftover = [item for item in catalog if _still_id(item)]
    index = 0
    for item in raw or []:
        scene: dict[str, Any]
        if isinstance(item, str):
            scene = {"voiceover_text": item}
        elif isinstance(item, dict):
            scene = item
        else:
            continue
        matched = _match_catalog(scene, catalog, used)
        if not matched and index < len(leftover):
            candidate = leftover[index]
            index += 1
            while candidate and _still_id(candidate) in used and index < len(leftover):
                candidate = leftover[index]
                index += 1
            matched = candidate if candidate and _still_id(candidate) not in used else None
        if not matched:
            continue
        item_id = _still_id(matched)
        used.add(item_id)
        voice = str(scene.get("voiceover_text") or scene.get("line") or "").strip()
        rows.append(
            {
                "voiceover_text": voice,
                "suggested_visual": _still_name(matched),
                "media_asset_id": item_id,
            }
        )
    return rows


def process_request(
    *,
    title: str,
    summary: str = "",
    location: str = "",
    market: str = "Chicago",
    catalog: list[dict[str, Any]] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    stills = [item for item in (catalog or []) if isinstance(item, dict) and _still_id(item) and _still_name(item)]
    prompt = build_timed_script_prompt(
        title=title,
        summary=summary,
        location=location,
        market=market or "Chicago",
        catalog=stills,
    )
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "title": title,
        "market": str(market or "Chicago").strip() or "Chicago",
        "catalog_count": len(stills),
        "prompt_chars": len(prompt),
    }
    if dry_run:
        return {"processed": False, "dry_run": True, "scenes": [], **preview}
    if not str(title or "").strip():
        return {"processed": False, "reason": "missing_title", "scenes": [], **preview}
    if len(stills) < 2:
        return {"processed": False, "reason": "not_enough_stills", "scenes": [], **preview}

    generated = generate_timed_script(prompt)
    scenes = normalize_scenes(generated["parsed"], stills)
    if len(scenes) < 2:
        return {"processed": False, "reason": "empty_scenes", "scenes": scenes, **preview}
    return {"processed": True, "scenes": scenes, **preview}
