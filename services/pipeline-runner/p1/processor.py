"""P1 processor — generate the Content Item package and daisy-chain P2/P3 (Make 5528742)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import (
    AI_PERSONAS_TABLE,
    BRANDS_TABLE,
    CONTENT_ITEMS_TABLE,
    CONTENT_PROFILES_TABLE,
    CONTENT_VERTICALS_TABLE,
    MARKETS_TABLE,
    ORGANIZATIONS_TABLE,
    PRODUCTION_PROFILES_TABLE,
    PROMPTS_TABLE,
)
from p1.constants import (
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    P1_MAX_RECORDS,
    P1_PROMPT_KEY,
    P1_PROMPT_VIEW,
    P1_VIEW,
)
from p1.context import build_runtime_context
from p1.eligibility import (
    content_status_for,
    effective_options,
    initial_eligibility_reason,
    pick_forced,
    recheck_formula,
    require_active,
)
from p1.openai_package import generate_package
from render.fields import field, field_str, first_linked_id


def _linked(client: AirtableClient, table_id: str, record: dict[str, Any], name: str) -> dict[str, Any] | None:
    record_id = first_linked_id(field(record, name))
    if not record_id:
        return None
    return client.get_record(table_id, record_id)


def _load_prompt(client: AirtableClient) -> dict[str, Any] | None:
    rows = client.list_records(PROMPTS_TABLE, view=P1_PROMPT_VIEW, max_records=1)
    return rows[0] if rows else None


def _prompt_ready(prompt: dict[str, Any] | None) -> bool:
    if not prompt:
        return False
    return (
        field_str(prompt, "Prompt Key") == P1_PROMPT_KEY
        and field(prompt, "Active") is True
        and field_str(prompt, "Environment") == "Production"
        and bool(field_str(prompt, "System Prompt"))
        and bool(field_str(prompt, "User Prompt Template"))
        and bool(field_str(prompt, "JSON Schema"))
    )


def _select_items(
    client: AirtableClient,
    *,
    content_item_record_id: str | None,
    test_run_id: str | None,
    max_runs: int,
) -> list[dict[str, Any]]:
    if content_item_record_id:
        item = client.get_record(CONTENT_ITEMS_TABLE, content_item_record_id)
        if test_run_id and field_str(item, "Test_Run_ID") not in {"", test_run_id}:
            return []
        return [item]
    formula = "{Test_Run_ID}=BLANK()"
    if test_run_id:
        formula = f"{{Test_Run_ID}}='{test_run_id}'"
    rows = client.list_records(
        CONTENT_ITEMS_TABLE,
        view=P1_VIEW,
        formula=formula,
        max_records=max_runs,
        sort_field="Created_At",
        sort_direction="asc",
    )
    rows.sort(key=lambda row: (field_str(row, "Created_At"), -(field(row, "Priority_Score") or 0)))
    return rows[:max_runs]


def _package_complete(parsed: dict[str, Any]) -> bool:
    try:
        score = float(parsed.get("script_quality_score") or 0)
    except (TypeError, ValueError):
        score = 0
    return bool(
        str(parsed.get("script") or "").strip()
        and str(parsed.get("caption") or "").strip()
        and str(parsed.get("hashtags") or "").strip()
        and str(parsed.get("publish_recommendation") or "").strip()
        and score > 0
    )


def _write_fields(item: dict[str, Any], parsed: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    title_mode = field_str(item, "Requested_Title_Mode")
    caption_mode = field_str(item, "Requested_Caption_Mode")
    script_mode = field_str(item, "Requested_Script_Mode")
    script = pick_forced(script_mode, field_str(item, "Requested_Script"), str(parsed.get("script") or ""))
    caption = pick_forced(caption_mode, field_str(item, "Requested_Caption"), str(parsed.get("caption") or ""))
    title = pick_forced(title_mode, field_str(item, "Requested_Title"), field_str(item, "Content_Title"))
    voiceover = ""
    if options["include_voiceover"] == "Yes":
        voiceover = pick_forced(
            script_mode,
            field_str(item, "Requested_Script"),
            str(parsed.get("voiceover_script") or ""),
        )
    notes = str(parsed.get("internal_notes") or "").strip() or field_str(item, "Internal_Notes")
    return {
        "Hashtags": str(parsed.get("hashtags") or "").strip(),
        "Script_Quality_Score": parsed.get("script_quality_score"),
        "Voiceover_Status": "Ready" if options["include_voiceover"] == "Yes" else "Not Needed",
        "Publish_Recommendation": str(parsed.get("publish_recommendation") or "").strip(),
        "Thumbnail_Concept": str(parsed.get("thumbnail_concept") or "").strip() if options["include_thumbnail"] == "Yes" else "",
        "Render_Status": "Not Ready",
        "Thumbnail_Status": "Ready" if options["include_thumbnail"] == "Yes" else "Not Needed",
        "Voiceover_Script": voiceover,
        "Internal_Notes": notes,
        "Thumbnail_Prompt": str(parsed.get("thumbnail_prompt") or "").strip() if options["include_thumbnail"] == "Yes" else "",
        "Content_Title": title or field_str(item, "Content_Title"),
        "Script": script,
        "Caption": caption,
        "Content_Status": content_status_for(options),
        "Script_Status": "Generated",
    }


def _trigger_next(stage: str, content_record_id: str, test_run_id: str | None) -> dict[str, Any]:
    if stage == "p2":
        from p2.processor import process_request as process_p2

        return {"backend": "python", "stage": stage, **process_p2(content_item_record_id=content_record_id, test_run_id=test_run_id)}
    from p3.processor import process_request as process_p3

    return {"backend": "python", "stage": stage, **process_p3(content_item_record_id=content_record_id, test_run_id=test_run_id)}


def _process_one(
    client: AirtableClient,
    item: dict[str, Any],
    prompt: dict[str, Any],
    *,
    dry_run: bool,
    trigger_next: bool,
) -> dict[str, Any]:
    reason = initial_eligibility_reason(item)
    if reason:
        return {"processed": False, "reason": reason, "content_item_record_id": item.get("id")}

    profile = _linked(client, CONTENT_PROFILES_TABLE, item, "Content_Profile")
    if require_active(profile, "Profile_Name"):
        return {"processed": False, "reason": "profile_incomplete", "content_item_record_id": item["id"]}
    organization = _linked(client, ORGANIZATIONS_TABLE, profile or {}, "Organization")
    brand = _linked(client, BRANDS_TABLE, profile or {}, "Brand")
    vertical = _linked(client, CONTENT_VERTICALS_TABLE, profile or {}, "Content_Vertical")
    market = _linked(client, MARKETS_TABLE, profile or {}, "Market")
    persona = _linked(client, AI_PERSONAS_TABLE, profile or {}, "AI_Persona")
    production = _linked(client, PRODUCTION_PROFILES_TABLE, profile or {}, "Production_Profile")
    for record, name_field, label in (
        (organization, "Organization_Name", "organization"),
        (brand, "Brand_Name", "brand"),
        (vertical, "Vertical_Name", "vertical"),
        (market, "Market_Name", "market"),
        (persona, "Persona_Name", "persona"),
        (production, "Production_Profile_Name", "production_profile"),
    ):
        if require_active(record, name_field):
            return {"processed": False, "reason": f"{label}_incomplete", "content_item_record_id": item["id"]}

    options = effective_options(item, production or {})
    context = build_runtime_context(
        item=item,
        profile=profile or {},
        organization=organization or {},
        brand=brand or {},
        vertical=vertical or {},
        market=market or {},
        persona=persona or {},
        production=production or {},
    )
    preview = {
        "content_item_record_id": item["id"],
        "content_id": field_str(item, "Content_ID"),
        "effective": options,
    }
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    generated = generate_package(prompt, context)
    parsed = generated.get("parsed") or {}
    if not _package_complete(parsed):
        return {"processed": False, "reason": "incomplete_package", **preview}

    still = client.list_records(CONTENT_ITEMS_TABLE, formula=recheck_formula(item["id"]), max_records=1)
    if not still:
        return {"processed": False, "reason": "recheck_failed", **preview}

    fields = _write_fields(item, parsed, options)
    client.update_record(CONTENT_ITEMS_TABLE, still[0]["id"], fields, typecast=True)
    next_results: dict[str, Any] = {}
    if trigger_next:
        test_run_id = field_str(item, "Test_Run_ID") or None
        p2 = _trigger_next("p2", still[0]["id"], test_run_id)
        next_results["p2"] = p2
        if p2.get("reason") == "no_eligible_p2_route":
            next_results["p3"] = _trigger_next("p3", still[0]["id"], test_run_id)
    return {"processed": True, "packaged": True, **preview, "next": next_results}


def process_request(
    *,
    content_item_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    max_runs: int = P1_MAX_RECORDS,
    trigger_next: bool = True,
) -> dict[str, Any]:
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "content_item_record_id": content_item_record_id,
        "test_run_id": test_run_id,
    }
    client = AirtableClient()
    prompt = _load_prompt(client)
    if not _prompt_ready(prompt):
        return {"processed": False, "reason": "prompt_not_ready", "packaged_count": 0, **preview}

    items = _select_items(
        client,
        content_item_record_id=(content_item_record_id or "").strip() or None,
        test_run_id=(test_run_id or "").strip() or None,
        max_runs=max(1, int(max_runs or P1_MAX_RECORDS)),
    )
    preview["candidate_ids"] = [item.get("id") for item in items]
    if not items:
        return {"processed": False, "reason": "no_eligible_items", "packaged_count": 0, **preview}

    runs: list[dict[str, Any]] = []
    packaged = 0
    for item in items:
        result = _process_one(client, item, prompt or {}, dry_run=dry_run, trigger_next=trigger_next)
        runs.append(result)
        if result.get("processed"):
            packaged += 1
    preview["runs"] = runs
    preview["packaged_count"] = packaged
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}
    if not packaged:
        return {"processed": False, "reason": runs[0].get("reason") if runs else "not_processed", **preview}
    return {"processed": True, **preview}
