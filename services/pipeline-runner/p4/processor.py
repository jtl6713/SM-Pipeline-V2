"""P4 processor — deterministic asset-need coverage (Make 5533802)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore[misc, assignment]


def _chicago_now() -> datetime:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo("America/Chicago"))
        except Exception:
            pass
    return datetime.now(timezone(timedelta(hours=-5)))

from airtable.client import AirtableClient
from airtable.constants import (
    AI_PERSONAS_TABLE,
    BRANDS_TABLE,
    CONTENT_ITEMS_TABLE,
    CONTENT_PROFILES_TABLE,
    CONTENT_VERTICALS_TABLE,
    MARKETS_TABLE,
    MEDIA_ASSETS_TABLE,
    ORGANIZATIONS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_PROFILES_TABLE,
)
from config import load_settings
from integrations.gmail import GmailClient
from p4.constants import (
    DEFAULT_EMAIL_TO,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    MEDIA_CANDIDATE_LIMIT,
    P4_EMAIL_ENABLED,
    P5_CHICAGO_HOUR_BEFORE,
)
from p4.coverage import (
    deterministic_existing_count,
    deterministic_missing_count,
    effective_video_target,
    is_carousel,
    validate_coverage,
)
from p4.email_builder import request_email_html, request_email_subject, shot_block
from p4.formulas import p4_content_item_formula, p4_exact_record_formula, p4_output_id_formula
from p4.openai_plan import plan_asset_request
from p4.prompt import build_messages
from p4.updates import apply_create, apply_fully_covered, apply_reconcile, apply_validation_fail
from render.fields import field, field_str, first_linked_id


def _quote(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace('"', '\\"')


def _linked(client: AirtableClient, table_id: str, value: Any) -> dict[str, Any] | None:
    record_id = first_linked_id(value)
    if not record_id:
        return None
    return client.get_record(table_id, record_id)


def _active(record: dict[str, Any] | None) -> bool:
    return bool(record) and field(record, "Active") is not False


def select_output(
    client: AirtableClient,
    *,
    output_record_id: str | None,
    output_id: str | None,
    test_run_id: str | None,
) -> dict[str, Any] | None:
    if output_record_id:
        rows = client.list_records(
            PLATFORM_OUTPUTS_TABLE,
            formula=p4_exact_record_formula(output_record_id, test_run_id or ""),
            max_records=1,
        )
        return rows[0] if rows else None
    if output_id:
        rows = client.list_records(
            PLATFORM_OUTPUTS_TABLE,
            formula=p4_output_id_formula(output_id, test_run_id or ""),
            max_records=1,
        )
        return rows[0] if rows else None
    return None


def _media_formula(profile: dict[str, Any], content_item: dict[str, Any]) -> str:
    tag = _quote(field_str(profile, "Asset_Filter_Tag"))
    location = _quote(field_str(content_item, "Primary_Location") or "__NO_LOCATION__")
    area = _quote(field_str(content_item, "Neighborhood_or_Area") or "__NO_AREA__")
    title = _quote(field_str(content_item, "Content_Title") or "__NO_TITLE__")
    haystack = (
        'LOWER({Location} & " " & {Topic} & " " & {Subtopic} & " " & {AI_Tags} '
        '& " " & {Search_Keywords} & " " & {Visible_Subjects} & " " & {Asset_Description})'
    )
    return (
        "AND("
        "{Active}=1,"
        "NOT({Do_Not_Use}),"
        f'OR("{tag}" = "", FIND(LOWER("{tag}"), {haystack}) > 0),'
        f'OR(FIND(LOWER("{location}"), {haystack}), FIND(LOWER("{area}"), {haystack}), FIND(LOWER("{title}"), {haystack}))'
        ")"
    )


def _candidate_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "record_id": row["id"],
        "asset_name": field_str(row, "Asset Name"),
        "media_class": field_str(row, "Media_Class"),
        "asset_role": field_str(row, "Asset_Role"),
        "raw_source_eligibility": field_str(row, "Raw_Source_Eligibility"),
        "google_drive_url": field_str(row, "Google Drive URL"),
        "location": field_str(row, "Location"),
        "topic": field_str(row, "Topic"),
        "subtopic": field_str(row, "Subtopic"),
        "description": field_str(row, "Asset_Description"),
        "ai_tags": field(row, "AI_Tags"),
        "search_keywords": field_str(row, "Search_Keywords"),
        "visible_subjects": field_str(row, "Visible_Subjects"),
        "shot_type": field_str(row, "Shot_Type"),
        "movement": field_str(row, "Movement"),
        "orientation": field_str(row, "Orientation"),
        "aspect_ratio": field_str(row, "Aspect_Ratio"),
        "time_of_day": field_str(row, "Time_Of_Day"),
        "quality_score": field(row, "Quality_Score"),
        "usefulness_score": field(row, "Usefulness_Score"),
    }


def _platform_row(output: dict[str, Any]) -> dict[str, Any]:
    return {
        "record_id": output["id"],
        "platform": field_str(output, "Platform"),
        "format": field_str(output, "Format"),
        "platform_output_type": field_str(output, "Platform_Output_Type") or field_str(output, "Studio_Output_Type"),
        "aspect_ratio": field_str(output, "Aspect_Ratio"),
        "output_title": field_str(output, "Output_Title"),
        "output_status": field_str(output, "Output_Status"),
        "do_not_publish": field(output, "Do_Not_Publish"),
        "output_caption": field_str(output, "Output_Caption"),
        "asset_need_status": field_str(output, "Asset_Need_Status"),
    }


def _maybe_trigger_p5(*, dry_run: bool, trigger_p5: bool) -> dict[str, Any] | None:
    hour = _chicago_now().hour
    if hour >= P5_CHICAGO_HOUR_BEFORE:
        return {"skipped": "outside_p5_chicago_window", "chicago_hour": hour}
    from p5.constants import P5_EMAIL_ENABLED

    if dry_run or not trigger_p5 or not P5_EMAIL_ENABLED:
        return {"skipped": "dry_run_or_disabled", "chicago_hour": hour}
    from p5.processor import process_batch

    result = process_batch(dry_run=False)
    return {"backend": "python", "chicago_hour": hour, "result": result}


def process_one(
    *,
    output_record_id: str | None = None,
    output_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_p5: bool = True,
) -> dict[str, Any]:
    client = AirtableClient()
    output = select_output(
        client,
        output_record_id=output_record_id,
        output_id=output_id,
        test_run_id=test_run_id,
    )
    if not output:
        return {
            "processed": False,
            "reason": "no_exact_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    content_item_id = first_linked_id(field(output, "Content_Item"))
    content_rows = (
        client.list_records(
            CONTENT_ITEMS_TABLE,
            formula=p4_content_item_formula(content_item_id),
            max_records=1,
        )
        if content_item_id
        else []
    )
    content_item = content_rows[0] if content_rows else None
    if not content_item:
        return {
            "processed": False,
            "reason": "missing_content_item",
            "make_scenario_id": MAKE_SCENARIO_ID,
            "output_record_id": output["id"],
        }

    profile = _linked(client, CONTENT_PROFILES_TABLE, field(content_item, "Content_Profile"))
    organization = _linked(client, ORGANIZATIONS_TABLE, field(profile or {}, "Organization"))
    brand = _linked(client, BRANDS_TABLE, field(profile or {}, "Brand"))
    vertical = _linked(client, CONTENT_VERTICALS_TABLE, field(profile or {}, "Content_Vertical"))
    market = _linked(client, MARKETS_TABLE, field(profile or {}, "Market"))
    persona = _linked(client, AI_PERSONAS_TABLE, field(profile or {}, "AI_Persona"))
    production_profile = _linked(client, PRODUCTION_PROFILES_TABLE, field(profile or {}, "Production_Profile"))
    if not all(
        _active(item)
        for item in (profile, organization, brand, vertical, market, persona, production_profile)
    ):
        return {
            "processed": False,
            "reason": "incomplete_active_configuration",
            "make_scenario_id": MAKE_SCENARIO_ID,
            "output_record_id": output["id"],
        }

    media_rows = client.list_records(
        MEDIA_ASSETS_TABLE,
        formula=_media_formula(profile, content_item),
        max_records=MEDIA_CANDIDATE_LIMIT,
    )
    candidates = [_candidate_row(row) for row in media_rows]
    target = effective_video_target(output, content_item, production_profile)
    existing_count = deterministic_existing_count(len(candidates), target)
    missing_count = deterministic_missing_count(target, existing_count)
    platform_rows = [_platform_row(output)]
    messages = build_messages(
        output=output,
        content_item=content_item,
        organization=organization,
        brand=brand,
        profile=profile,
        production_profile=production_profile,
        platform_rows=platform_rows,
        media_candidates=candidates,
        existing_count=existing_count,
        missing_count=missing_count,
        target=target,
    )
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output["id"],
        "output_id": field(output, "Output_ID"),
        "content_item_id": content_item["id"],
        "media_candidate_count": len(candidates),
        "effective_video_target": target,
        "deterministic_existing": existing_count,
        "deterministic_missing": missing_count,
        "has_existing_asset_request": bool(field(content_item, "Asset Requests") or field(content_item, "Asset_Request_Link")),
    }
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    planned = plan_asset_request(messages)
    parsed = planned["parsed"]
    validation = validate_coverage(
        parsed,
        output=output,
        content_item=content_item,
        production_profile=production_profile,
    )
    aspect_ratios = [row["aspect_ratio"] for row in platform_rows if row.get("aspect_ratio")]
    existing_request_id = first_linked_id(
        field(content_item, "Asset Requests") or field(content_item, "Asset_Request_Link")
    )
    needed = bool(parsed.get("asset_request_needed"))
    shots = parsed.get("shot_list") if isinstance(parsed.get("shot_list"), list) else []
    route = "none"
    request_id = existing_request_id
    if validation == "FAIL":
        apply_validation_fail(client, parsed=parsed, output=output, content_item=content_item)
        route = "validation_fail"
    elif not needed and len(shots) == 0:
        apply_fully_covered(client, parsed=parsed, output=output, content_item=content_item)
        route = "fully_covered"
    elif existing_request_id:
        apply_reconcile(
            client,
            request_id=existing_request_id,
            parsed=parsed,
            output=output,
            content_item=content_item,
            organization=organization,
            brand=brand,
            production_profile=production_profile,
            validation=validation,
            aspect_ratios=aspect_ratios,
            create_missing_shots=not bool(field(content_item, "Asset Request Shots")),
        )
        route = "reconcile"
    else:
        request_id = apply_create(
            client,
            parsed=parsed,
            output=output,
            content_item=content_item,
            organization=organization,
            brand=brand,
            production_profile=production_profile,
            validation=validation,
            aspect_ratios=aspect_ratios,
        )
        route = "create"
        if not field_str(output, "Test_Run_ID") and P4_EMAIL_ENABLED:
            settings = load_settings()
            to_addr = (
                field_str(organization, "Primary_Contact_Email")
                or str(settings.get("p4_email_to") or DEFAULT_EMAIL_TO)
            )
            visual_target = (
                f"{len(shots)} slides"
                if is_carousel(content_item)
                else f"{target} video clips"
            )
            gmail = GmailClient()
            gmail.send_html(
                to=to_addr,
                subject=request_email_subject(
                    field_str(brand, "Brand_Name"),
                    field_str(content_item, "Content_Title"),
                    len(shots),
                ),
                html_body=request_email_html(
                    {
                        "brand": field_str(brand, "Brand_Name"),
                        "organization": field_str(organization, "Organization_Name"),
                        "title": field_str(content_item, "Content_Title"),
                        "content_type": field_str(content_item, "Content_Type"),
                        "platforms": field_str(output, "Platform"),
                        "formats": field_str(output, "Format") or field_str(output, "Studio_Output_Type"),
                        "aspect_ratios": ", ".join(aspect_ratios),
                        "location": parsed.get("location") or "",
                        "priority": parsed.get("priority") or "High",
                        "visual_target": visual_target,
                        "target_length": "Not applicable — carousel" if is_carousel(content_item) else f"{field(content_item, 'Content_Duration') or field(production_profile, 'Default_Duration')} seconds",
                        "linked_existing": len(parsed.get("existing_matching_asset_ids") or []),
                        "missing_count": len(shots),
                        "raw_capture": "Not applicable — carousel" if is_carousel(content_item) else f"{sum(float(s.get('recommended_raw_capture_seconds') or 0) for s in shots if isinstance(s, dict))} seconds",
                        "validation": validation,
                        "existing_summary": parsed.get("existing_asset_summary") or "",
                        "missing_summary": parsed.get("missing_asset_summary") or "",
                        "digest": parsed.get("asset_request_digest") or "",
                        "validation_notes": parsed.get("coverage_validation_notes") or "",
                        "production_notes": parsed.get("production_notes") or "",
                        "shot_blocks": [
                            shot_block(shot, carousel=is_carousel(content_item), aspect_ratios=aspect_ratios)
                            for shot in shots
                            if isinstance(shot, dict)
                        ],
                    }
                ),
            )

    p5 = _maybe_trigger_p5(dry_run=dry_run, trigger_p5=trigger_p5)
    return {
        "processed": True,
        "route": route,
        "validation": validation,
        "coverage_validation_notes": parsed.get("coverage_validation_notes"),
        "missing_asset_count": parsed.get("missing_asset_count"),
        "shot_count": len(shots) if isinstance(shots, list) else 0,
        "asset_request_id": request_id,
        "selection_status": parsed.get("asset_request_needed"),
        "p5": p5,
        **preview,
    }
