"""SAI1 processor — request/response slide themer (Make 6023816)."""

from __future__ import annotations

from typing import Any
import re

from sai1.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from sai1.openai_themes import generate_themes
from sai1.prompt import build_themer_prompt


def _sanitize_post_caption(value: str) -> str:
    lines = [line.strip() for line in str(value or "").splitlines()]
    # Asset inventory is production metadata, never audience-facing copy. Drop
    # the whole line instead of trying to edit filenames into usable prose.
    lines = [
        line
        for line in lines
        if not re.match(r"^\s*featuring\s*:", line, flags=re.I)
        and not re.search(r"\.(?:jpe?g|png|gif|webp|heic|heif|mp4|mov|m4v|webm)\b", line, flags=re.I)
        and not re.search(r"\b(?:photo|image|still|slide|clip|video)\s*(?:#|no\.?|number)?\s*\d+\b", line, flags=re.I)
    ]
    return "\n".join(line for line in lines if line).strip()


def _normalize_themes(parsed: dict[str, Any], *, needed: int) -> dict[str, Any]:
    slides_in = parsed.get("slides") if isinstance(parsed.get("slides"), list) else []
    slides: list[dict[str, str]] = []
    for item in slides_in:
        if not isinstance(item, dict):
            continue
        caption = str(item.get("caption") or "").strip()[:120]
        image_prompt = str(item.get("image_prompt") or "").strip()
        if needed > 0 and not image_prompt:
            continue
        slides.append({"caption": caption, "image_prompt": image_prompt})
    if needed > 0:
        slides = slides[:needed]
    voiceovers_in = parsed.get("slide_voiceovers") if isinstance(parsed.get("slide_voiceovers"), list) else []
    slide_voiceovers: list[dict[str, Any]] = []
    for item in voiceovers_in:
        if isinstance(item, str):
            slide_voiceovers.append({"line": item.strip(), "hold_seconds": 0})
            continue
        if not isinstance(item, dict):
            continue
        line = str(item.get("line") or item.get("voiceover_text") or "").strip()
        try:
            hold = float(item.get("hold_seconds") or 0)
        except (TypeError, ValueError):
            hold = 0.0
        slide_voiceovers.append({"line": line, "hold_seconds": hold if not line else 0})
    joined = " ".join(row["line"] for row in slide_voiceovers if row.get("line")).strip()
    script = joined or str(parsed.get("voiceover_script") or "").strip()
    return {
        "slides": slides,
        "slide_voiceovers": slide_voiceovers,
        "voiceover_script": script,
        "post_caption": _sanitize_post_caption(str(parsed.get("post_caption") or "")),
        "hashtags": " ".join(list(dict.fromkeys(re.findall(r"#[A-Za-z0-9_]+", str(parsed.get("hashtags") or ""))))[:5]),
    }


def validate_market_copy(themes: dict[str, Any], market: str, title: str = "") -> None:
    """Reject generated captions and hashtags for an unrelated city."""
    market_key = str(market or "").strip().lower()
    markers = {
        "chicago": r"\bchicago\b|#choosechicago\b",
        "miami": r"\bmiami\b|#southbeach\b",
        "los angeles": r"\blos angeles\b|#explorela\b",
        "new york city": r"\bnew york(?: city)?\b|\bnyc\b",
    }
    caption = str(themes.get("post_caption") or "")
    hashtags = str(themes.get("hashtags") or "")
    for other, pattern in markers.items():
        if other == market_key:
            continue
        if re.search(pattern, hashtags, flags=re.I):
            raise ValueError(f"SAI1 cross-city hashtags: {other} in {market} output")
        if re.search(pattern, caption, flags=re.I) and not re.search(pattern, title, flags=re.I):
            raise ValueError(f"SAI1 cross-city caption: {other} in {market} output")


def process_request(
    *,
    title: str,
    covered_text: str = "(none)",
    needed: int = 0,
    total: int | None = None,
    market: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not str(market or "").strip():
        raise ValueError("SAI1 requires an explicit content-profile market")
    needed_count = max(0, int(needed))
    total_count = int(total) if total is not None else needed_count
    prompt = build_themer_prompt(
        title=title,
        covered_text=covered_text or "(none)",
        needed=needed_count,
        total=total_count,
        market=str(market).strip(),
    )
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "title": title,
        "market": str(market).strip(),
        "needed": needed_count,
        "total": total_count,
        "prompt_chars": len(prompt),
    }
    if dry_run:
        return {"processed": False, "dry_run": True, "themes": None, **preview}
    if not str(title or "").strip():
        return {"processed": False, "reason": "missing_title", "themes": None, **preview}

    generated = generate_themes(prompt)
    themes = _normalize_themes(generated["parsed"], needed=needed_count)
    validate_market_copy(themes, str(market), title)
    if needed_count > 0 and not themes["slides"]:
        return {"processed": False, "reason": "empty_slides", "themes": themes, **preview}
    return {"processed": True, "themes": themes, **preview}
