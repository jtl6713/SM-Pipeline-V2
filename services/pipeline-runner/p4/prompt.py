"""P4 OpenAI messages — Make 5533802 module 7."""

from __future__ import annotations

import json
from typing import Any

from p4.coverage import approved_duration, effective_video_target
from render.fields import field, field_str


def _text(record: dict[str, Any] | None, name: str, default: str = "") -> str:
    return field_str(record or {}, name) or default


def build_messages(
    *,
    output: dict[str, Any],
    content_item: dict[str, Any],
    organization: dict[str, Any],
    brand: dict[str, Any],
    profile: dict[str, Any],
    production_profile: dict[str, Any],
    platform_rows: list[dict[str, Any]],
    media_candidates: list[dict[str, Any]],
    existing_count: int,
    missing_count: int,
    target: int,
) -> list[dict[str, str]]:
    duration = approved_duration(content_item, production_profile)
    mode = field_str(output, "Requested_Video_Clip_Count_Mode") or "AI decides"
    content_id = field(content_item, "Content_ID")
    system = f"""You are the production asset planner for {field_str(brand, 'Brand_Name')}, operated by {field_str(organization, 'Organization_Name')}.

Plan only the media assets still needed to produce the current content item. Compare the approved production settings, the ACTUAL linked Platform Output records, and the existing brand-scoped media inventory.

Configuration hierarchy:
1. Owner-controlled clip-count directives on the exact handed-off Platform Output
2. Current Content Item production settings (fallback only for AI decides / blank clip-count mode)
3. Actual linked Platform Outputs for platform, format, output type, and aspect ratio
4. Content Profile overrides and legacy guidance
5. Brand, Content Vertical, Market, and AI Persona guidance
6. Production Profile defaults

The actual Platform Output array is authoritative. Never invent or expand platforms, formats, output types, or aspect ratios beyond that array.

DETERMINISTIC EXISTING COVERAGE RESOLUTION:
- Effective video clip target: {target}.
- Deterministic existing video coverage count: {existing_count}.
- Deterministic missing video clip count: {missing_count}.
- For VIDEO, existing_covered_visual_count MUST equal {existing_count}.
- For VIDEO, missing_asset_count MUST equal {missing_count}, and shot_list MUST contain exactly that many entries.
- For VIDEO, select exactly the first {existing_count} candidates in the supplied Existing Media Asset Candidate array, in supplied array order.
- If deterministic missing video clip count is 0, set asset_request_needed false and shot_list [].
- If deterministic missing video clip count is greater than 0, set asset_request_needed true.
- For CAROUSEL content, preserve candidate-coverage behavior and existing carousel rules.

Return valid JSON only, with no markdown or commentary."""
    user = f"""Create a production asset request for this Content Item.

ORGANIZATION
Organization: {_text(organization, 'Organization_Name')}
Timezone: {_text(organization, 'Default_Timezone')}

CONTENT PROFILE
Profile: {_text(profile, 'Profile_Name')}
Asset filter tag: {_text(profile, 'Asset_Filter_Tag')}
Profile production overrides: {_text(profile, 'Production_Guideline_Overrides')}
Profile strategy overrides: {_text(profile, 'Content_Strategy_Overrides')}

CONTENT ITEM
Record ID: {content_item.get('id')}
Content ID: {content_id}
Title: {_text(content_item, 'Content_Title')}
Status: {_text(content_item, 'Content_Status')}
Content Type: {_text(content_item, 'Content_Type')}
Approved Duration: {duration} seconds
Approved Video Clip Count: {target}
Requested Video Clip Count Mode: {mode}
Requested Video Clip Count Exact: {field(output, 'Requested_Video_Clip_Count_Exact')}
Requested Video Clip Count Min: {field(output, 'Requested_Video_Clip_Count_Min')}
Requested Video Clip Count Max: {field(output, 'Requested_Video_Clip_Count_Max')}
Carousel Image Mode: {_text(content_item, 'Carousel_Image_Mode') or _text(production_profile, 'Default_Carousel_Image_Mode')}
Approved Carousel Slide Count: {field(content_item, 'Carousel_Slide_Count') or field(production_profile, 'Default_Carousel_Slide_Count')}
Include Voiceover: {_text(content_item, 'Include_Voiceover')}
Include Background Music: {_text(content_item, 'Include_Background_Music')}
Include Thumbnail: {_text(content_item, 'Include_Thumbnail')}
Primary Location: {_text(content_item, 'Primary_Location')}
Neighborhood or Area: {_text(content_item, 'Neighborhood_or_Area')}
Priority Score: {field(content_item, 'Priority_Score')}

Hook:
{_text(content_item, 'Hook')}

Idea Summary:
{_text(content_item, 'Idea_Summary')}

Required Assets:
{_text(content_item, 'Required_Assets')}

Suggested Visuals:
{_text(content_item, 'Suggested_Visuals')}

Script:
{_text(content_item, 'Script')}

Voiceover Script:
{_text(content_item, 'Voiceover_Script')}

Caption:
{_text(content_item, 'Caption')}

Thumbnail Concept:
{_text(content_item, 'Thumbnail_Concept')}

ACTUAL LINKED PLATFORM OUTPUT ARRAY — AUTHORITATIVE SOURCE OF TRUTH
{json.dumps(platform_rows, ensure_ascii=False)}

DETERMINISTIC VIDEO COVERAGE VALUES — AUTHORITATIVE FOR VIDEO
Effective video target: {target}
Supplied qualified candidate count: {len(media_candidates)}
Deterministic existing coverage count: {existing_count}
Deterministic missing clip count: {missing_count}

EXISTING MEDIA ASSET CANDIDATE ARRAY — ONLY THESE RECORD IDS MAY BE LINKED
{json.dumps(media_candidates, ensure_ascii=False)}

Return this exact JSON structure with make_dedupe_key P4-CI-{content_item.get('id')} and asset_request_id P4-CI-{content_id}."""
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def should_use_effective_target(output: dict[str, Any], content_item: dict[str, Any], production_profile: dict[str, Any]) -> int:
    return effective_video_target(output, content_item, production_profile)
