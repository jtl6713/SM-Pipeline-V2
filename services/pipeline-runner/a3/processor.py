"""A3 processor — classify Media Assets (Make 5569035)."""

from __future__ import annotations

from typing import Any

from a3.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, VIDEO_NO_FRAMES_NOTES
from a3.frames import extract_frames, image_metadata
from a3.images import classification_image_url
from a3.metadata_merge import merge_photo_metadata_fields
from a3.openai_classify import classify_asset
from a3.prompt import audio_prompt, image_prompt, video_frames_prompt, video_metadata_prompt
from airtable.client import AirtableClient
from airtable.constants import CONTENT_PROFILES_TABLE, MEDIA_ASSETS_TABLE
from asset.chain import daisy_payload, trigger_next
from asset.constants import A3_CLASSIFY_VIEW, A3_DRAIN_MAX_PASSES, A3_MAX_RECORDS
from asset.helpers import as_bool, join_list, parse_int, uc_download_url
from asset.routing import a3_mime_route, a3_needs_jpeg_preview, audio_role_fallback
from render.fields import field, field_str, first_linked_id


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    return [text] if text else []


def _classification_fields(parsed: dict[str, Any], *, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "Media_Class": parsed.get("Media_Class"),
        "Asset_Role": parsed.get("Asset_Role"),
        "Raw_Source_Eligibility": parsed.get("Raw_Source_Eligibility"),
        "Exclusion_Reasons": _as_list(parsed.get("Exclusion_Reasons")),
        "Classification_Status": parsed.get("Classification_Status") or "Classified",
        "Topic": parsed.get("Topic"),
        "Subtopic": parsed.get("Subtopic"),
        "Location": parsed.get("Location"),
        "Orientation": parsed.get("Orientation"),
        "Aspect_Ratio": parsed.get("Aspect_Ratio"),
        "Visible_Subjects": join_list(parsed.get("Visible_Subjects")),
        "Mood": parsed.get("Mood"),
        "Weather": parsed.get("Weather"),
        "Season": parsed.get("Season"),
        "Time_Of_Day": parsed.get("Time_Of_Day"),
        "Shot_Type": parsed.get("Shot_Type"),
        "Movement": parsed.get("Movement"),
        "AI_Tags": join_list(parsed.get("AI_Tags")),
        "Search_Keywords": join_list(parsed.get("Search_Keywords")),
        "Asset_Description": parsed.get("Asset_Description"),
        "Quality_Score": parsed.get("Quality_Score"),
        "Usefulness_Score": parsed.get("Usefulness_Score"),
        "Metadata_Used": parsed.get("Metadata_Used"),
        "Frame_Images_Used": parsed.get("Frame_Images_Used"),
        "Frames_Analyzed_Count": parsed.get("Frames_Analyzed_Count"),
        "Evidence_From_Metadata": parsed.get("Evidence_From_Metadata"),
        "Evidence_From_Frames": parsed.get("Evidence_From_Frames"),
        "Visual_Details_Not_In_Metadata": parsed.get("Visual_Details_Not_In_Metadata"),
    }
    if overrides:
        fields.update(overrides)
    return {key: value for key, value in fields.items() if value is not None}


def normalize_record_ids(value: Any) -> list[str]:
    if value is None or value is False:
        return []
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, (list, tuple, set)):
        items = list(value)
    else:
        items = [value]
    ids: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if text.startswith("rec") and text not in ids:
            ids.append(text)
    return ids


def _frame_urls(payload: dict[str, Any]) -> tuple[int, list[str], list[str]]:
    count = parse_int(payload.get("frames_analyzed_count"), 0) or 0
    frames = payload.get("frames") or []
    unique = payload.get("unique_frames") or []
    if isinstance(frames, dict):
        keys = sorted(frames.keys(), key=lambda key: int(key) if str(key).isdigit() else str(key))
        frames = [frames[key] for key in keys]
    if not isinstance(frames, list):
        frames = []
    if not isinstance(unique, list):
        unique = []
    urls = [str(item).strip() for item in frames if str(item).strip()]
    unique_urls = [str(item).strip() for item in unique if str(item).strip()]
    return count, unique_urls, urls


def content_profile_id(record: dict[str, Any]) -> str | None:
    return first_linked_id(field(record, "Content_Profile"))


def attach_content_profile(client: AirtableClient, record: dict[str, Any]) -> dict[str, Any]:
    profile_id = content_profile_id(record)
    enriched = dict(record)
    if not profile_id:
        enriched["_content_profile"] = None
        return enriched
    try:
        enriched["_content_profile"] = client.get_record(CONTENT_PROFILES_TABLE, profile_id)
    except Exception:
        enriched["_content_profile"] = None
    return enriched


def _classify_one(client: AirtableClient, record: dict[str, Any]) -> dict[str, Any]:
    if not content_profile_id(record):
        return {
            "id": record["id"],
            "status": "skipped_no_profile",
            "error": "Content_Profile is required before A3",
        }
    client.update_record(MEDIA_ASSETS_TABLE, record["id"], {"Classification_Status": "Processing"})
    try:
        return _classify_one_body(client, record)
    except Exception as exc:
        client.update_record(
            MEDIA_ASSETS_TABLE,
            record["id"],
            {
                "Classification_Status": "Classification Error",
                "Potential_Match_Notes": f"A3 failed: {exc}"[:1500],
            },
            typecast=True,
        )
        return {"id": record["id"], "status": "error", "error": str(exc)}


def _classify_one_body(client: AirtableClient, record: dict[str, Any]) -> dict[str, Any]:
    fresh = attach_content_profile(client, client.get_record(MEDIA_ASSETS_TABLE, record["id"]))
    if not content_profile_id(fresh):
        return {
            "id": fresh["id"],
            "status": "skipped_no_profile",
            "error": "Content_Profile is required before A3",
        }
    route = a3_mime_route(field_str(fresh, "MIME_Type"))
    if route == "audio":
        result = classify_asset(audio_prompt(fresh), max_output_tokens=4000)
        parsed = result["parsed"]
        fields = _classification_fields(
            parsed,
            overrides={
                "Media_Class": "Audio",
                "Raw_Source_Eligibility": "Not Applicable",
                "Asset_Role": audio_role_fallback(str(parsed.get("Asset_Role") or ""), field_str(fresh, "Asset Name")),
                "Metadata_Used": True,
                "Frame_Images_Used": False,
                "Frames_Analyzed_Count": 0,
                "Classification_Status": "Classified",
            },
        )
        client.update_record(MEDIA_ASSETS_TABLE, fresh["id"], fields, typecast=True)
        return {"id": fresh["id"], "route": route, "status": "classified"}
    if route == "unsupported":
        client.update_record(
            MEDIA_ASSETS_TABLE,
            fresh["id"],
            {
                "Media_Class": "Other",
                "Asset_Role": "Other",
                "Raw_Source_Eligibility": "Needs Review",
                "Exclusion_Reasons": ["Other"],
                "Classification_Status": "Classification Error",
                "Potential_Match_Notes": (
                    f"A3 could not classify this asset because MIME_Type={field_str(fresh, 'MIME_Type')} "
                    f"and Media_Class={field_str(fresh, 'Media_Class')} did not route as video, image/graphic, or audio. "
                    "Check MIME type, Media_Class, Asset_Role, and Google Drive metadata."
                ),
            },
            typecast=True,
        )
        return {"id": fresh["id"], "route": route, "status": "unsupported"}
    if route == "image":
        meta = {}
        if not a3_needs_jpeg_preview(
            field_str(fresh, "MIME_Type"),
            field_str(fresh, "Asset Name"),
            field_str(fresh, "File_Extension"),
        ):
            try:
                meta = image_metadata(fresh)
            except Exception as exc:
                meta = {"error": str(exc)}
        image_url = classification_image_url(fresh)
        result = classify_asset(image_prompt(fresh, image_metadata=meta), image_urls=[image_url], max_output_tokens=4500)
        fields = _classification_fields(
            result["parsed"],
            overrides={"Frame_Images_Used": True, "Frames_Analyzed_Count": 1, "Classification_Status": "Classified"},
        )
        fields = merge_photo_metadata_fields(fields, meta, field_str(fresh, "Asset Name"))
        client.update_record(MEDIA_ASSETS_TABLE, fresh["id"], fields, typecast=True)
        return {"id": fresh["id"], "route": route, "status": "classified"}

    extractor: dict[str, Any] = {}
    try:
        extractor = extract_frames(fresh)
    except Exception as exc:
        extractor = {"error": str(exc), "frames_analyzed_count": 0}
    count, unique_urls, urls = _frame_urls(extractor)
    if count > 0 and urls:
        result = classify_asset(
            video_frames_prompt(fresh, frames_analyzed=count, unique_frames=unique_urls, frames=urls),
            image_urls=urls[:8],
            max_output_tokens=5000,
        )
        fields = _classification_fields(
            result["parsed"],
            overrides={"Frame_Images_Used": True, "Classification_Status": "Classified"},
        )
        client.update_record(MEDIA_ASSETS_TABLE, fresh["id"], fields, typecast=True)
        return {"id": fresh["id"], "route": "video_frames", "status": "classified", "frames": count}
    result = classify_asset(video_metadata_prompt(fresh, extractor_payload=extractor), max_output_tokens=4000)
    fields = _classification_fields(
        result["parsed"],
        overrides={
            "Frame_Images_Used": False,
            "Frames_Analyzed_Count": 0,
            "Classification_Status": "Classified",
            "Potential_Match_Notes": VIDEO_NO_FRAMES_NOTES,
        },
    )
    client.update_record(MEDIA_ASSETS_TABLE, fresh["id"], fields, typecast=True)
    return {"id": fresh["id"], "route": "video_metadata", "status": "classified", "frames": 0}


def process_request(
    *,
    dry_run: bool = False,
    trigger_a4: bool = True,
    wait_for_next: bool = True,
    test_run_id: str | None = None,
    max_records: int | None = None,
    drain: bool = False,
    record_ids: Any = None,
) -> dict[str, Any]:
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "test_run_id": test_run_id,
    }
    client = AirtableClient()
    limit = parse_int(max_records, A3_MAX_RECORDS) or A3_MAX_RECORDS
    targeted = normalize_record_ids(record_ids)

    def _load_rows() -> list[dict[str, Any]]:
        return [
            row
            for row in client.list_records(
                MEDIA_ASSETS_TABLE,
                view=A3_CLASSIFY_VIEW,
                max_records=limit,
                sort_field="Intake_Date",
                sort_direction="asc",
            )
            if content_profile_id(row)
        ]

    classified: list[dict[str, Any]] = []
    if targeted:
        rows: list[dict[str, Any]] = []
        for record_id in targeted:
            try:
                rows.append(client.get_record(MEDIA_ASSETS_TABLE, record_id))
            except Exception as exc:
                classified.append({"id": record_id, "status": "missing", "error": str(exc)})
        preview["candidate_ids"] = [row["id"] for row in rows]
        preview["requested_ids"] = targeted
        preview["routes"] = [
            {"id": row["id"], "mime": field_str(row, "MIME_Type"), "route": a3_mime_route(field_str(row, "MIME_Type"))}
            for row in rows
        ]
        if dry_run:
            return {"processed": False, "dry_run": True, **preview}
        for row in rows:
            classified.append(_classify_one(client, row))
        preview["classified"] = classified
        preview["classify_passes"] = 1
        classified_ok = [
            item
            for item in classified
            if item.get("status") not in {"missing", "unsupported", "skipped_no_profile"}
        ]
        if not classified_ok:
            if any(item.get("status") == "skipped_no_profile" for item in classified) and not any(
                item.get("status") == "missing" for item in classified
            ):
                return {
                    "processed": False,
                    "reason": "content_profile_required",
                    "classified_count": 0,
                    **preview,
                }
            if not any(item.get("status") == "unsupported" for item in classified):
                return {
                    "processed": False,
                    "reason": "record_not_found",
                    "classified_count": 0,
                    **preview,
                }
        return {
            "processed": True,
            "classified_count": len(classified_ok),
            "a4": None,
            **preview,
        }

    rows = _load_rows()
    preview["candidate_ids"] = [row["id"] for row in rows]
    preview["routes"] = [
        {"id": row["id"], "mime": field_str(row, "MIME_Type"), "route": a3_mime_route(field_str(row, "MIME_Type"))}
        for row in rows
    ]
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    passes = 0
    while True:
        passes += 1
        batch = rows if passes == 1 else _load_rows()
        if not batch:
            break
        for row in batch:
            classified.append(_classify_one(client, row))
        if not drain or passes >= A3_DRAIN_MAX_PASSES:
            break
    preview["classified"] = classified
    preview["classify_passes"] = passes
    next_result = None
    if trigger_a4:
        from a4.processor import process_request as process_a4

        next_result = trigger_next(
            "a4",
            daisy_payload("a4"),
            python_call=lambda: process_a4(dry_run=False, test_run_id=test_run_id),
            wait=as_bool(wait_for_next, True),
        )
    return {
        "processed": True,
        "classified_count": len(classified),
        "a4": next_result,
        **preview,
    }
