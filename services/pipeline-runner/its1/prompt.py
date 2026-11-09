"""ITS1 prompt: idea + mixed library media catalog → timed VO scenes."""

from __future__ import annotations

from studio_produce.creative_guidance import creative_prompt_suffix

CREATIVE_FIRST_PROMPT_TEMPLATE = """You are ChicagoShining's story-first Script a Short writer.

Return strict JSON only. No markdown. No explanations.

Write a production-ready storyboard BEFORE any library search. Each scene needs one shootable visual requirement and spoken narration.

Return exactly this structure:
{{
  "scenes": [
    {{
      "voiceover_text": "Spoken narration only. Words that will be read aloud.",
      "suggested_visual": "Specific camera-ready visual description for this one scene."
    }}
  ]
}}

SCENE RULES
- {scene_count_rule}
- suggested_visual is a concrete shot description (place, subject, framing, light/time of day). Never paste the whole brief. Never write planning commentary, concept essays, or media-sourcing instructions.
- voiceover_text is spoken audio only. No stage directions, no "you still need a photo", no library or media selection instructions, no camera directions.
- Scenes must be distinct. Do not repeat the same visual or spoken line.
- Do not invent prices, hours, rankings, or unverifiable claims.

CREATIVE BRIEF
{summary}

IDEA TITLE / HOOK
{title}

PRIMARY LOCATION
{location}

MARKET
{market}

FINAL SELF-CHECK
- Every suggested_visual is a specific scene shot, not the overall concept.
- Every voiceover_text is speakable narration.
- Output is valid JSON only."""


PROMPT_TEMPLATE = """You are ChicagoShining's timed-script writer for a mixed-media Reel / Short with spoken voiceover.

Return strict JSON only. No markdown. No explanations.

WHAT THIS DOES
The operator tapped Create VO timeline on an Idea. You must write a compelling spoken narration AND pick specific library photos or short video clips by their exact Asset Name. The renderer shows one selected asset per scene while that scene's voiceover plays.

Return exactly this structure:
{{
  "scenes": [
    {{
      "voiceover_text": "Spoken line for this asset. Only words that will be read aloud.",
      "suggested_visual": "Exact Asset Name from the catalog, including the file extension if present.",
      "media_asset_id": "recXXXXXXXXXXXXXX"
    }}
  ]
}}

SCENE RULES
- {scene_count_rule}
- Each scene uses ONE asset. Never reuse a media_asset_id or Asset Name.
- suggested_visual MUST be copied exactly from the catalog's name field. Do not invent filenames. Do not describe a shot that is not in the catalog.
- media_asset_id MUST be the matching catalog id for that name.
- Pick assets that tell a visual story in order: hook, place, detail, movement or people if available, closer. Prefer a natural mix of photos and video clips when both are relevant; do not force video when a photo is the better match.
- Skip assets whose names look like fill-crops, watermarks-only, or unrelated places.
- A video clip may be longer than its scene; the renderer trims it to the measured voiceover duration. Prefer clips long enough for the spoken scene and never assume a short clip can be stretched or looped.

VOICEOVER RULES
- voiceover_text is spoken audio. No stage directions, no filename, no camera instructions, no hashtags, no emoji, no quotes around the whole line.
- Open scene 1 with a hook from the IDEA TITLE, then let later lines carry the idea.
- Speak like a local guide. Name real places from the idea or asset location when they are actually in the catalog.
- Each line should be 8 to 24 words so it fits about 4 to 12 seconds at a natural pace. Do not pad with filler.
- Do not invent events, prices, hours, rankings, or claims the idea and assets do not support.
- Do not copy Asset Names into the spoken line unless the name is a real place a viewer would recognize.

IDEA TITLE
{title}

IDEA SUMMARY
{summary}

PRIMARY LOCATION
{location}

MARKET
{market}

LIBRARY MEDIA CATALOG (use only these)
{catalog}

FINAL SELF-CHECK
- {scene_count_check}
- Every suggested_visual and media_asset_id pair exists in the catalog.
- No duplicate assets.
- Every voiceover_text is spoken words only.
- Output is valid JSON only."""


def build_creative_first_prompt(
    *,
    title: str,
    summary: str,
    location: str,
    market: str,
    creative_guidance: dict | None = None,
    required_scene_count: int | None = None,
) -> str:
    scene_rule = (
        f"Write EXACTLY {required_scene_count} distinct scenes in order. This is a hard requirement, "
        "not a suggestion; the default 6-to-8-scene rule does not apply. Do not add hook/CTA scenes beyond this count."
        if required_scene_count is not None else
        "Write 6 to 8 scenes unless the brief clearly asks for a different count between 2 and 12."
    )
    prompt = CREATIVE_FIRST_PROMPT_TEMPLATE.format(
        scene_count_rule=scene_rule,
        title=title or "",
        summary=summary or "",
        location=location or "",
        market=market or "Chicago",
    )
    return prompt + creative_prompt_suffix(creative_guidance, mode="narration")


def build_timed_script_prompt(
    *,
    title: str,
    summary: str,
    location: str,
    market: str,
    catalog: list[dict],
    creative_guidance: dict | None = None,
    required_scene_count: int | None = None,
) -> str:
    scene_rule = (
        f"Write EXACTLY {required_scene_count} distinct scenes in order, using only approved catalog items. "
        "Do not add scenes beyond the requested count or silently remove required shots."
        if required_scene_count is not None else
        "Write 6 to 8 scenes when the catalog has at least 6 assets. If the catalog is smaller, use every usable asset, at least 4 when 4 or more exist."
    )
    scene_check = (
        f"The scenes array MUST have exactly {required_scene_count} entries."
        if required_scene_count is not None else
        "Scenes length is between 4 and 8, or equals the catalog size when the catalog is smaller than 4."
    )
    prompt = PROMPT_TEMPLATE.format(
        scene_count_rule=scene_rule,
        scene_count_check=scene_check,
        title=title or "",
        summary=summary or "",
        location=location or "",
        market=market or "Chicago",
        catalog=catalog if isinstance(catalog, str) else _catalog_json(catalog),
    )
    return prompt + creative_prompt_suffix(creative_guidance, mode="narration")


def _catalog_json(catalog: list[dict]) -> str:
    import json

    rows = []
    for item in catalog or []:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "id": str(item.get("id") or "").strip(),
                "name": str(item.get("name") or "").strip(),
                "location": str(item.get("location") or "").strip(),
                "topic": str(item.get("topic") or "").strip(),
                "description": str(item.get("description") or "").strip()[:180],
                "media_type": str(item.get("media_type") or item.get("media_kind") or item.get("mime_type") or "").strip(),
                "duration_seconds": item.get("duration_seconds") or item.get("duration") or 0,
            }
        )
    return json.dumps(rows, ensure_ascii=False, indent=2)
