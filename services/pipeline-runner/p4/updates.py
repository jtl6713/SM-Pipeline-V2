"""P4 Airtable writes — Make 5533802 create/reconcile/cover/fail routes."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import (
    ASSET_REQUEST_SHOTS_TABLE,
    ASSET_REQUESTS_TABLE,
    CONTENT_ITEMS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
)
from p4.coverage import approved_duration, is_carousel
from render.fields import field, field_str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _shot_list(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    shots = parsed.get("shot_list") or []
    return [shot for shot in shots if isinstance(shot, list) is False and isinstance(shot, dict)]


def _raw_seconds(parsed: dict[str, Any]) -> int:
    return int(sum(float(shot.get("recommended_raw_capture_seconds") or 0) for shot in _shot_list(parsed)))


def _matching_ids(parsed: dict[str, Any]) -> list[str]:
    values = parsed.get("existing_matching_asset_ids") or []
    if not isinstance(values, list):
        return []
    return [str(item) for item in values if str(item).startswith("rec")]


def request_fields(
    *,
    parsed: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any],
    organization: dict[str, Any],
    brand: dict[str, Any],
    production_profile: dict[str, Any],
    validation: str,
    include_id: bool,
) -> dict[str, Any]:
    carousel = is_carousel(content_item)
    shots = _shot_list(parsed)
    stamp = _now()
    notes = (
        f"Brand: {field_str(brand, 'Brand_Name')}\n"
        f"Organization: {field_str(organization, 'Organization_Name')}\n"
        f"Production Profile: {field_str(production_profile, 'Production_Profile_Name')}\n"
        f"Reconciled from exact R2 Platform Output {field(output, 'Output_ID')}.\n"
        f"Approved Content Type: {field_str(content_item, 'Content_Type')}\n"
        f"Requested Missing Asset Count: {len(shots)}\n"
        f"Coverage Check: {validation}"
    )
    fields: dict[str, Any] = {
        "Make_Dedupe_Key": parsed.get("make_dedupe_key") or f"P4-CI-{content_item['id']}",
        "Recommended_Total_Raw_Capture_Seconds": 0 if carousel else _raw_seconds(parsed),
        "Request_Status": "Needs Capture",
        "Asset_Request_Digest": parsed.get("asset_request_digest") or "",
        "Due_Date": (stamp + timedelta(days=7)).strftime("%Y-%m-%d"),
        "Location": parsed.get("location") or "",
        "Priority": parsed.get("priority") or "High",
        "Platform_Outputs": [output["id"]],
        "Shot_List_JSON": json.dumps(shots, ensure_ascii=False),
        "Content_Item": [content_item["id"]],
        "Production_Notes": (
            f"{parsed.get('production_notes') or ''}\n\n"
            f"Coverage validation: {parsed.get('coverage_validation_notes') or ''}\n"
            f"Existing asset coverage: {json.dumps(parsed.get('existing_asset_coverage') or [], ensure_ascii=False)}"
        ),
        "Topic": parsed.get("topic") or "",
        "Missing_Asset_Summary": parsed.get("missing_asset_summary") or "",
        "Missing_Asset_Count": len(shots),
        "Request_Source": "P4 Daily Digest",
        "Request_Date": stamp.strftime("%Y-%m-%d"),
        "Reminder_Needed": True,
        "Capture_Status": "Not Started",
        "Existing_Asset_Summary": parsed.get("existing_asset_summary") or "",
        "Target_Final_Length": 0 if carousel else approved_duration(content_item, production_profile),
        "Internal_Notes": notes,
    }
    profile = content_item.get("fields", {}).get("Content_Profile")
    if profile:
        fields["Content_Profile"] = profile
    matching = _matching_ids(parsed)
    if matching:
        fields["Existing_Matching_Assets"] = matching
    test_run_id = field_str(output, "Test_Run_ID")
    if test_run_id:
        fields["Test_Run_ID"] = test_run_id
    if include_id:
        fields["Asset_Request_ID"] = parsed.get("asset_request_id") or f"P4-CI-{field(content_item, 'Content_ID')}"
    return fields


def content_item_request_fields(parsed: dict[str, Any], content_item: dict[str, Any], status: str) -> dict[str, Any]:
    shots = _shot_list(parsed)
    carousel = is_carousel(content_item)
    return {
        "Recommended_Total_Asset_Length": 0 if carousel else _raw_seconds(parsed),
        "Asset_Request_Status": status,
        "Missing_Asset_Summary": parsed.get("missing_asset_summary") or "",
        "Asset_Request_Last_Sent": _now().isoformat(),
        "Asset_Request_Count": len(shots),
    }


def output_request_fields(parsed: dict[str, Any], content_item: dict[str, Any], production_profile: dict[str, Any], status: str) -> dict[str, Any]:
    carousel = is_carousel(content_item)
    return {
        "Recommended_Total_Asset_Length": 0 if carousel else _raw_seconds(parsed),
        "Missing_Asset_Summary": parsed.get("missing_asset_summary") or "",
        "Requested_Total_Final_Length": 0 if carousel else approved_duration(content_item, production_profile),
        "Asset_Need_Status": status,
    }


def shot_fields(
    shot: dict[str, Any],
    *,
    parsed: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any],
    request_id: str,
    aspect_ratios: list[str],
) -> dict[str, Any]:
    carousel = is_carousel(content_item)
    if len(aspect_ratios) == 1:
        ratio = aspect_ratios[0]
        orientation = "Horizontal" if ratio == "16:9" else ("Square" if ratio == "1:1" else "Vertical")
        aspect = ratio
    else:
        orientation = shot.get("orientation") or "Vertical"
        aspect = shot.get("aspect_ratio") or "9:16"
    fields: dict[str, Any] = {
        "Uploaded_URL": shot.get("uploaded_url") or None,
        "Priority": shot.get("priority") or "High",
        "Location": shot.get("location") or "",
        "Audio_Needed": bool(shot.get("audio_needed")),
        "Exact_Shot_Description": shot.get("exact_shot_description") or "",
        "Shot_Status": "Needs Capture",
        "Assigned_To": shot.get("assigned_to") or None,
        "Recommended_Raw_Capture_Seconds": 0 if carousel else shot.get("recommended_raw_capture_seconds"),
        "Content_Item": [content_item["id"]],
        "Minimum_Usable_Length_Seconds": 0 if carousel else shot.get("minimum_usable_length_seconds"),
        "Safe_Text_Space": shot.get("safe_text_space") or "",
        "Why_Needed": shot.get("why_needed") or "",
        "Desired_Final_Length_Seconds": 0 if carousel else shot.get("desired_final_length_seconds"),
        "Example_Overlay_Text": shot.get("example_overlay_text") or "",
        "Time_Of_Day": shot.get("time_of_day") or "",
        "Avoid": shot.get("avoid") or "",
        "Shot_Request_ID": shot.get("shot_request_id") or "",
        "Asset_Type": shot.get("asset_type") or "Video",
        "Asset_Request": [request_id],
        "Shot_Number": shot.get("shot_number"),
        "Shot_Size": shot.get("shot_size") or "",
        "Capture_Instructions": shot.get("capture_instructions") or "",
        "Camera_Movement": shot.get("camera_movement") or "",
        "Orientation": orientation,
        "Aspect_Ratio": aspect,
        "Platform_Output": [output["id"]],
    }
    test_run_id = field_str(output, "Test_Run_ID")
    if test_run_id:
        fields["Test_Run_ID"] = test_run_id
    return {key: value for key, value in fields.items() if value is not None}


def apply_create(
    client: AirtableClient,
    *,
    parsed: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any],
    organization: dict[str, Any],
    brand: dict[str, Any],
    production_profile: dict[str, Any],
    validation: str,
    aspect_ratios: list[str],
) -> str:
    created = client.create_records(
        ASSET_REQUESTS_TABLE,
        [
            request_fields(
                parsed=parsed,
                output=output,
                content_item=content_item,
                organization=organization,
                brand=brand,
                production_profile=production_profile,
                validation=validation,
                include_id=True,
            )
        ],
        typecast=True,
    )
    request_id = created[0]["id"]
    client.update_record(
        CONTENT_ITEMS_TABLE,
        content_item["id"],
        content_item_request_fields(parsed, content_item, "Sent to Team"),
        typecast=True,
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        output_request_fields(parsed, content_item, production_profile, "Sent to Team"),
        typecast=True,
    )
    shots = [
        shot_fields(
            shot,
            parsed=parsed,
            output=output,
            content_item=content_item,
            request_id=request_id,
            aspect_ratios=aspect_ratios,
        )
        for shot in _shot_list(parsed)
    ]
    if shots:
        client.create_records(ASSET_REQUEST_SHOTS_TABLE, shots, typecast=True)
    return request_id


def apply_reconcile(
    client: AirtableClient,
    *,
    request_id: str,
    parsed: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any],
    organization: dict[str, Any],
    brand: dict[str, Any],
    production_profile: dict[str, Any],
    validation: str,
    aspect_ratios: list[str],
    create_missing_shots: bool,
) -> None:
    client.update_record(
        ASSET_REQUESTS_TABLE,
        request_id,
        request_fields(
            parsed=parsed,
            output=output,
            content_item=content_item,
            organization=organization,
            brand=brand,
            production_profile=production_profile,
            validation=validation,
            include_id=False,
        ),
        typecast=True,
    )
    client.update_record(
        CONTENT_ITEMS_TABLE,
        content_item["id"],
        content_item_request_fields(parsed, content_item, "Sent to Team"),
        typecast=True,
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **output_request_fields(parsed, content_item, production_profile, "Sent to Team"),
            "Asset_Requests": [request_id],
        },
        typecast=True,
    )
    if create_missing_shots:
        shots = [
            shot_fields(
                shot,
                parsed=parsed,
                output=output,
                content_item=content_item,
                request_id=request_id,
                aspect_ratios=aspect_ratios,
            )
            for shot in _shot_list(parsed)
        ]
        if shots:
            client.create_records(ASSET_REQUEST_SHOTS_TABLE, shots, typecast=True)


def apply_fully_covered(
    client: AirtableClient,
    *,
    parsed: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any],
) -> None:
    client.update_record(
        CONTENT_ITEMS_TABLE,
        content_item["id"],
        {
            "Recommended_Total_Asset_Length": 0,
            "Asset_Request_Status": "Not Needed",
            "Missing_Asset_Summary": parsed.get("existing_asset_summary") or "",
            "Asset_Request_Last_Sent": _now().isoformat(),
            "Asset_Request_Count": 0,
        },
        typecast=True,
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Missing_Asset_Summary": parsed.get("existing_asset_summary") or "",
            "Asset_Need_Status": "Not Needed",
        },
        typecast=True,
    )


def apply_validation_fail(
    client: AirtableClient,
    *,
    parsed: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any],
) -> None:
    notes = field_str(content_item, "Internal_Notes")
    extra = (
        f"{notes}\n\nP4 deterministic coverage validation failed at {_now().isoformat()}. "
        f"No Asset Request was created. Validation notes: {parsed.get('coverage_validation_notes') or ''}"
    ).strip()
    summary = (
        "P4 coverage validation failed. No Asset Request was created. "
        f"{parsed.get('coverage_validation_notes') or ''}"
    )
    client.update_record(
        CONTENT_ITEMS_TABLE,
        content_item["id"],
        {
            "Asset_Request_Status": "Needs Request",
            "Missing_Asset_Summary": summary,
            "Internal_Notes": extra,
        },
        typecast=True,
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Missing_Asset_Summary": summary,
            "Asset_Need_Status": "Needs Request",
        },
        typecast=True,
    )
