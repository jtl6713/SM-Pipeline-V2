"""P3 processor — platform output generation (Make 5531703)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import (
    CONTENT_ITEMS_TABLE,
    CONTENT_PROFILES_TABLE,
    PLATFORM_OUTPUT_MAPPINGS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_PROFILES_TABLE,
    SOURCE_CANDIDATES_TABLE,
)
from p3.constants import LEGACY_CONTENT_VIEW_ID, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from p3.formulas import (
    p3_duplicate_output_formula,
    p3_legacy_item_formula,
    p3_legacy_recheck_formula,
    p3_mapping_formula,
    p3_seeded_outputs_formula,
    p3_studio_parent_formula,
)
from p3.helpers import (
    build_legacy_output_fields,
    build_studio_enrichment_fields,
    mapping_matches,
    parent_mark_fields,
    parent_media_ready,
    resolve_effective_formats,
    resolve_effective_platforms,
    source_authority_ready,
)
from render.fields import field, field_str, first_linked_id


def _load_one(client: AirtableClient, table_id: str, formula: str, *, view: str | None = None) -> dict[str, Any] | None:
    rows = client.list_records(table_id, formula=formula, max_records=1, view=view)
    return rows[0] if rows else None


def _preview_parent(item: dict[str, Any], *, route: str) -> dict[str, Any]:
    return {
        "content_item_record_id": item["id"],
        "content_id": field_str(item, "Content_ID"),
        "route": route,
        "content_status": field_str(item, "Content_Status"),
        "caption": bool(field_str(item, "Caption")),
        "include_voiceover": field_str(item, "Include_Voiceover"),
        "include_thumbnail": field_str(item, "Include_Thumbnail"),
    }


def _process_studio_parent(
    client: AirtableClient,
    parent: dict[str, Any],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    content_id = field_str(parent, "Content_ID")
    seeded = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=p3_seeded_outputs_formula(content_id),
        max_records=25,
    )
    planned: list[dict[str, Any]] = []
    for output in seeded:
        ready = parent_media_ready(
            parent,
            thumbnail_mode=field(output, "Studio_Effective_Thumbnail_Mode"),
            voiceover_mode=field(output, "Studio_Effective_Voiceover_Mode"),
        )
        patch = build_studio_enrichment_fields(parent, output) if ready else None
        planned.append(
            {
                "output_record_id": output["id"],
                "output_id": field_str(output, "Output_ID"),
                "studio_output_type": field_str(output, "Studio_Output_Type"),
                "ready": ready,
                "fields": patch,
            }
        )

    preview = {
        "processed": False,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "seeded_count": len(seeded),
        "enrichable_count": sum(1 for item in planned if item["ready"]),
        "outputs": [
            {key: value for key, value in item.items() if key != "fields"}
            for item in planned
        ],
        **_preview_parent(parent, route="studio_parent"),
    }
    if dry_run:
        return {**preview, "dry_run": True, "planned_fields": [item["fields"] for item in planned if item["fields"]]}
    if not any(item["ready"] for item in planned):
        return {**preview, "reason": "no_enrichable_seeded_outputs"}

    enriched: list[str] = []
    for item in planned:
        if not item["ready"] or not item["fields"]:
            continue
        client.update_record(PLATFORM_OUTPUTS_TABLE, item["output_record_id"], item["fields"], typecast=True)
        enriched.append(item["output_record_id"])

    client.update_record(CONTENT_ITEMS_TABLE, parent["id"], parent_mark_fields(), typecast=True)
    return {
        **preview,
        "processed": True,
        "enriched_output_ids": enriched,
        "parent_mark": parent_mark_fields(),
    }


def _linked_record(client: AirtableClient, table_id: str, value: Any) -> dict[str, Any] | None:
    record_id = first_linked_id(value)
    if not record_id:
        return None
    return client.get_record(table_id, record_id)


def _process_legacy(
    client: AirtableClient,
    item: dict[str, Any],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    source = _linked_record(client, SOURCE_CANDIDATES_TABLE, field(item, "Source_Candidate"))
    profile = _linked_record(client, CONTENT_PROFILES_TABLE, field(item, "Content_Profile"))
    if not source or not profile:
        return {
            "processed": False,
            "reason": "legacy_missing_source_or_profile",
            "make_scenario_id": MAKE_SCENARIO_ID,
            **_preview_parent(item, route="legacy"),
        }

    production_profile = _linked_record(
        client, PRODUCTION_PROFILES_TABLE, field(profile, "Production_Profile")
    )
    platforms_csv = resolve_effective_platforms(item, source, profile, production_profile)
    formats_csv = resolve_effective_formats(item, source, profile)
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "effective_platforms_csv": platforms_csv,
        "effective_formats_csv": formats_csv,
        **_preview_parent(item, route="legacy"),
    }
    if not platforms_csv or not formats_csv:
        return {**preview, "processed": False, "reason": "legacy_unresolved_platforms_or_formats"}

    mappings = [
        row
        for row in client.list_records(
            PLATFORM_OUTPUT_MAPPINGS_TABLE,
            formula=p3_mapping_formula(platforms_csv, formats_csv),
            max_records=25,
        )
        if mapping_matches(row, platforms_csv, formats_csv)
    ]
    content_id = field_str(item, "Content_ID")
    actions: list[dict[str, Any]] = []
    for mapping in mappings:
        platform = field_str(mapping, "Platform")
        output_format = field_str(mapping, "Format")
        existing = _load_one(
            client,
            PLATFORM_OUTPUTS_TABLE,
            p3_duplicate_output_formula(content_id, platform, output_format),
        )
        ready = parent_media_ready(
            item,
            thumbnail_mode=field(item, "Include_Thumbnail"),
            voiceover_mode=field(item, "Include_Voiceover"),
        )
        if existing:
            actions.append(
                {
                    "action": "duplicate",
                    "mapping_id": mapping["id"],
                    "platform": platform,
                    "format": output_format,
                    "existing_output_id": existing["id"],
                }
            )
            continue
        if not ready:
            actions.append(
                {
                    "action": "skip_media_not_ready",
                    "mapping_id": mapping["id"],
                    "platform": platform,
                    "format": output_format,
                }
            )
            continue
        fields = build_legacy_output_fields(
            item, mapping, platforms_csv=platforms_csv, formats_csv=formats_csv
        )
        actions.append(
            {
                "action": "create",
                "mapping_id": mapping["id"],
                "platform": platform,
                "format": output_format,
                "fields": fields,
            }
        )

    preview["mapping_count"] = len(mappings)
    preview["actions"] = [{key: value for key, value in row.items() if key != "fields"} for row in actions]
    if dry_run:
        return {**preview, "processed": False, "dry_run": True}

    created: list[str] = []
    for row in actions:
        if row["action"] != "create":
            continue
        records = client.create_records(PLATFORM_OUTPUTS_TABLE, [row["fields"]], typecast=True)
        if records:
            created.append(records[0]["id"])

    should_mark = bool(created) or any(row["action"] == "duplicate" for row in actions)
    parent_mark = None
    if should_mark:
        rechecked = _load_one(client, CONTENT_ITEMS_TABLE, p3_legacy_recheck_formula(item["id"]))
        if rechecked:
            parent_mark = parent_mark_fields(source_authority_ready=source_authority_ready(item))
            client.update_record(CONTENT_ITEMS_TABLE, rechecked["id"], parent_mark, typecast=True)

    return {
        **preview,
        "processed": bool(created) or bool(parent_mark),
        "created_output_ids": created,
        "parent_mark": parent_mark,
        "reason": None if created or parent_mark else "legacy_no_create_or_recheck",
    }


def process_request(
    *,
    content_item_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not content_item_record_id:
        return {
            "processed": False,
            "reason": "missing_content_item_record_id",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    client = AirtableClient()
    studio = _load_one(
        client,
        CONTENT_ITEMS_TABLE,
        p3_studio_parent_formula(content_item_record_id, test_run_id or ""),
    )
    if studio:
        return _process_studio_parent(client, studio, dry_run=dry_run)

    legacy = _load_one(
        client,
        CONTENT_ITEMS_TABLE,
        p3_legacy_item_formula(content_item_record_id, test_run_id or ""),
        view=LEGACY_CONTENT_VIEW_ID,
    )
    if not legacy:
        legacy = _load_one(
            client,
            CONTENT_ITEMS_TABLE,
            p3_legacy_item_formula(content_item_record_id, test_run_id or ""),
        )
    if legacy:
        return _process_legacy(client, legacy, dry_run=dry_run)

    return {
        "processed": False,
        "reason": "content_item_not_eligible",
        "make_scenario_id": MAKE_SCENARIO_ID,
        "content_item_record_id": content_item_record_id,
        "studio_formula": p3_studio_parent_formula(content_item_record_id, test_run_id or ""),
        "legacy_formula": p3_legacy_item_formula(content_item_record_id, test_run_id or ""),
    }
