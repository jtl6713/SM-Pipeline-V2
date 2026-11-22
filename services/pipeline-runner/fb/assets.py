from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from asset.helpers import parse_int
from fb.constants import (
    DEFAULT_MAX_PHOTOS,
    DEFAULT_UNPUBLISHED_RECREATE_HOURS,
    MODE_SINGLE,
    MODE_SLIDESHOW,
    PHOTO_STATUS_READY,
)
from render.fields import field, field_str, json_text


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def resolved_publish_mode(record: dict[str, Any]) -> str:
    explicit = field_str(record, "FB_Resolved_Publish_Mode")
    if explicit:
        return explicit
    count = parse_int(field(record, "Image_Count"), 0) or 0
    return MODE_SLIDESHOW if count > 1 else MODE_SINGLE


def is_slideshow_route(record: dict[str, Any]) -> bool:
    return _ci(resolved_publish_mode(record)) == _ci(MODE_SLIDESHOW)


def _slide_owner_clause(output_id: str, *, output_record_id: str | None = None) -> str:
    """Select by immutable output record ID, never a nullable or partial number.

    Empty numeric Output_ID previously produced FIND("", ARRAYJOIN(...)), which
    matches unrelated slide sets and may trigger forbidden Airtable fallbacks.
    """
    record_id = str(output_record_id or "").strip()
    if record_id:
        if not re.fullmatch(r"rec[A-Za-z0-9]{14}", record_id):
            raise ValueError("invalid_facebook_output_record_id")
        return f'FIND("{record_id}",ARRAYJOIN({{Platform Output}}))>0'
    number = str(output_id or "").strip()
    if not re.fullmatch(r"[0-9]+", number):
        raise ValueError("missing_facebook_output_identity")
    return f'FIND("{number}",ARRAYJOIN({{PO_Output_ID}}))>0'


def slide_formula(output_id: str, *, output_record_id: str | None = None) -> str:
    owner = _slide_owner_clause(output_id, output_record_id=output_record_id)
    return (
        f'AND({owner},'
        '{Shared_Asset_Approved}=1,{Asset_4x5_Public_Status}="Ready",{Asset_4x5_Public_URL}!=BLANK())'
    )


def recover_approved_photo_count(slides: list[dict[str, Any]], *, max_photos: int = DEFAULT_MAX_PHOTOS) -> int | None:
    """Recover a missing FB photo-set count only from a complete approved set.

    The shared Asset_4x5_Public_Status/URL contract alone is not enough:
    duplicated slide positions or unapproved media must never create a false
    Ready package. Do not alter links, order, or source images.
    """
    count = len(slides)
    if not 1 <= count <= max_photos:
        return None
    seen: set[int] = set()
    for slide in slides:
        order = parse_int(field(slide, "Current Order"), None)
        number = parse_int(field(slide, "Slide Number"), None)
        if order is None or number != order or order < 1 or order > count or order in seen:
            return None
        seen.add(order)
        if field(slide, "Deleted From Carousel") is True:
            return None
        if field(slide, "Shared_Asset_Approved") is not True:
            return None
        if _ci(field_str(slide, "Asset_4x5_Public_Status")) != "ready":
            return None
        if not field_str(slide, "Asset_4x5_Public_URL").startswith("https://media.chicagoshining.com/"):
            return None
        if field_str(slide, "FB_Photo_ID"):
            # Already-created provider objects need reconciliation, not re-arming.
            return None
    return count if seen == set(range(1, count + 1)) else None


def ready_photo_formula(
    output_id: str, package_revision: str, *, output_record_id: str | None = None,
) -> str:
    owner = _slide_owner_clause(output_id, output_record_id=output_record_id)
    revision = str(package_revision or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]*", revision):
        raise ValueError("invalid_facebook_package_revision")
    return (
        f'AND({owner},'
        f'{{FB_Photo_Status}}="Ready",{{FB_Photo_ID}}!=BLANK(),{{FB_Photo_Package_Revision}}="{revision}")'
    )


def _sort_key(record: dict[str, Any]) -> tuple[int, int]:
    return (
        parse_int(field(record, "Current Order"), 10**9) or 10**9,
        parse_int(field(record, "Slide Number"), 10**9) or 10**9,
    )


def list_ready_slides(
    client: AirtableClient,
    output_id: str,
    *,
    output_record_id: str | None = None,
    max_photos: int = DEFAULT_MAX_PHOTOS,
) -> list[dict[str, Any]]:
    formula = slide_formula(output_id, output_record_id=output_record_id)
    # +1 ensures a surplus beyond the allowed cardinality cannot look complete.
    rows = client.list_records(CAROUSEL_SLIDES_TABLE, formula=formula, max_records=max_photos + 1)
    record_id = str(output_record_id or "").strip()
    if record_id:
        rows = [
            slide for slide in rows
            if isinstance(field(slide, "Platform Output"), list)
            and field(slide, "Platform Output") == [record_id]
        ]
    return sorted(rows, key=_sort_key)


def canonical_doubled_slide_repair(
    output: dict[str, Any],
    slides: list[dict[str, Any]],
    expected: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, str]]] | None:
    """Plan safe FB0 double-link recovery against the immutable approved manifest.

    No guesses on missing, mixed, revised or mismatched source assets. Never
    reuse a row linked to another platform output or delete original media.
    """
    if not 1 <= expected <= DEFAULT_MAX_PHOTOS or len(slides) != expected * 2:
        return None
    output_rec_id = str(output.get("id") or "").strip()
    if not output_rec_id:
        return None
    try:
        manifest = json.loads(field_str(output, "Render_Clip_List_JSON"))
    except (ValueError, TypeError):
        return None
    if not isinstance(manifest, list) or len(manifest) != expected:
        return None
    ordered: dict[int, list[dict[str, Any]]] = {}
    for slide in slides:
        number = parse_int(field(slide, "Current Order"), 0) or 0
        linked = field(slide, "Platform Output")
        if number < 1 or number > expected or not slide.get("id"):
            return None
        if not isinstance(linked, list) or len(linked) != 1 or linked[0] != output_rec_id:
            return None
        if field(slide, "Deleted From Carousel"):
            return None
        ordered.setdefault(number, []).append(slide)
    if len(ordered) != expected or any(len(rows) != 2 for rows in ordered.values()):
        return None
    keep, surplus, url_updates = [], [], {}
    seen_drive_ids: set[str] = set()
    for position in range(1, expected + 1):
        entry = manifest[position - 1]
        if not isinstance(entry, dict) or parse_int(entry.get("order"), 0) != position:
            return None
        source = str(entry.get("googleDriveFileId") or entry.get("google_drive_file_id") or "").strip()
        family = str(entry.get("mediaAssetRecordId") or "").strip()
        url = str(entry.get("url") or "").strip()
        exact = f"https://media.chicagoshining.com/studio/previews/lettered/{output_rec_id}/{position - 1}.jpg"
        if not source or source in seen_drive_ids or not family or url != exact:
            return None
        seen_drive_ids.add(source)
        rows = ordered[position]
        for row in rows:
            # New Supabase-native Carousel Slides may store the immutable Drive
            # source only in Asset_4x5_File_URL. Legacy Google Drive File ID
            # and Asset_Family_Key are absent on those rows. Accept that shape
            # only when the exact source Drive ID matches the *approved* output
            # manifest and the slide has Final Approved review evidence.
            saved_source = field_str(row, "Google Drive File ID")
            drive_url = field_str(row, "Asset_4x5_File_URL")
            source_match = re.fullmatch(
                r"https://drive\.google\.com/file/d/([A-Za-z0-9_-]+)/view(?:\?.*)?",
                drive_url,
            )
            verified_source = saved_source or (source_match.group(1) if source_match else "")
            saved_family = field_str(row, "Asset_Family_Key")
            if (
                verified_source != source
                or (saved_family and saved_family != family)
                or (not saved_family and field_str(row, "Review Status") != "Final Approved")
                or field_str(row, "Asset_4x5_Public_Status").casefold() != "ready"
                or field(row, "Shared_Asset_Approved") is not True
                or field_str(row, "FB_Photo_ID")
            ):
                return None
        canonical = next(
            (row for row in rows if field_str(row, "Asset_4x5_Public_URL") == exact),
            rows[0],
        )
        duplicate = next(row for row in rows if row["id"] != canonical["id"])
        keep.append(canonical)
        surplus.append(duplicate)
        changes = {}
        if not field_str(canonical, "Google Drive File ID"):
            changes["Google Drive File ID"] = source
        if not field_str(canonical, "Asset_Family_Key"):
            changes["Asset_Family_Key"] = family
        if field_str(canonical, "Asset_4x5_Public_URL") != exact:
            changes.update({
                "Asset_4x5_Public_URL": exact,
                "Current Image URL": exact,
                "Final Image URL": exact,
                "Watermarked Image URL": exact,
            })
        if changes:
            url_updates[canonical["id"]] = changes
            canonical = dict(canonical, fields={
                **canonical.get("fields", {}),
                **changes,
            })
            keep[-1] = canonical
    return keep, surplus, url_updates


def list_ready_photos(
    client: AirtableClient,
    output_id: str,
    package_revision: str,
    *,
    output_record_id: str | None = None,
) -> list[dict[str, Any]]:
    formula = ready_photo_formula(
        output_id, package_revision, output_record_id=output_record_id,
    )
    rows = client.list_records(CAROUSEL_SLIDES_TABLE, formula=formula, max_records=25)
    record_id = str(output_record_id or "").strip()
    if record_id:
        rows = [
            slide for slide in rows
            if isinstance(field(slide, "Platform Output"), list)
            and field(slide, "Platform Output") == [record_id]
        ]
    return sorted(rows, key=_sort_key)


def revision_fragment(slide: dict[str, Any]) -> str:
    return field_str(slide, "Shared_Asset_Revision") or field_str(slide, "Asset_4x5_Public_URL")


def package_revision(slides: list[dict[str, Any]]) -> str:
    joined = "|".join(revision_fragment(slide) for slide in slides)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()



def _named_place(value: str) -> str:
    """Conservative location-cue check; a mismatch is a hold, never an approval."""
    text = re.sub(r"[^a-zA-Z ]+", " ", str(value or "")).lower()
    match = re.search(
        r"\b([a-z]+(?:\s+[a-z]+){0,2}\s+"
        r"(?:park|beach|lake|pier|museum|stadium|bridge))\b", text,
    )
    return " ".join(match.group(1).split()) if match else ""


def _manifest_location_mismatch(output: dict[str, Any], clips: list[dict[str, Any]]) -> bool:
    title_place = _named_place(field_str(output, "Output_Title"))
    if not title_place:
        return False
    context = re.sub(
        r"[^a-zA-Z ]+", " ",
        field_str(output, "Output_Title") + " " + field_str(output, "Output_Caption"),
    ).lower()
    for clip in clips:
        source_place = _named_place(str(clip.get("assetName") or clip.get("asset_name") or ""))
        if source_place and source_place != title_place and source_place not in context:
            return True
    return False



def manifest_location_mismatch(output: dict[str, Any]) -> bool:
    """Reject visibly foreign named source locations at every Facebook stage.

    This checks original source filenames rather than the overlaid image title:
    an Echo Park label applied to Runyon Canyon does not make its media valid.
    """
    raw = field(output, "Render_Clip_List_JSON")
    try:
        clips = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return False
    return isinstance(clips, list) and _manifest_location_mismatch(output, clips)



def verify_public_4x5_image(url: str) -> bool:
    """Verify retrievable image bytes and dimensions, not merely a URL string."""
    from io import BytesIO

    import requests
    from PIL import Image

    try:
        response = requests.get(url, timeout=(5, 20), stream=True)
        response.raise_for_status()
        mime = response.headers.get("Content-Type", "").split(";", 1)[0].lower().strip()
        if mime not in {"image/jpeg", "image/png", "image/webp"}:
            return False
        size = 0
        blocks = []
        for block in response.iter_content(chunk_size=65536):
            size += len(block)
            if size > 15 * 1024 * 1024:
                return False
            blocks.append(block)
        if size < 1024:
            return False
        with Image.open(BytesIO(b"".join(blocks))) as image:
            width, height = image.size
            if width < 640 or height < 800 or abs(width / height - 0.8) > 0.025:
                return False
            image.verify()
        return True
    except (requests.RequestException, OSError, ValueError):
        return False


def recover_missing_photo_slides(
    client: AirtableClient,
    output: dict[str, Any],
    expected: int,
    *,
    verify_url=None,
) -> dict[str, Any]:
    """Backfill a totally absent approved photo-set link, never fake asset readiness.

    The selected clip manifest is *not* equivalent to provider-ready Carousel
    Slides. Only a complete, ordered, approved, accessible 4:5 set can become
    linked slide records. Any existing slide (even unready) or ambiguous media
    requires the upstream media repair path, not a duplicate record set.
    """
    record_id = str(output.get("id") or "").strip()
    output_number = field_str(output, "Output_ID")
    if (
        not re.fullmatch(r"rec[A-Za-z0-9]{14}", record_id)
        or not re.fullmatch(r"[0-9]+", output_number)
        or not 1 <= expected <= DEFAULT_MAX_PHOTOS
        or _ci(field_str(output, "Platform_Output_Type")) != "facebook photo set"
        or _ci(field_str(output, "Review_Status")) != "approved"
        or field_str(output, "Platform_Post_ID")
        or field_str(output, "FB_Photo_IDs_JSON")
    ):
        return {"created": 0, "reason": "not_eligible_for_manifest_recovery"}

    owner = _slide_owner_clause(output_number, output_record_id=record_id)
    existing = client.list_records(CAROUSEL_SLIDES_TABLE, formula=owner, max_records=DEFAULT_MAX_PHOTOS * 2 + 1)
    existing = [row for row in existing if field(row, "Platform Output") == [record_id]]
    if existing:
        return {"created": 0, "reason": "linked_slides_already_exist"}

    raw = field(output, "Render_Clip_List_JSON")
    try:
        clips = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        clips = None
    if not isinstance(clips, list) or len(clips) != expected:
        return {"created": 0, "reason": "approved_manifest_missing_or_incomplete"}
    if _manifest_location_mismatch(output, clips):
        return {"created": 0, "reason": "source_location_mismatch"}

    urls: set[str] = set()
    drive_ids: set[str] = set()
    rows: list[dict[str, Any]] = []
    for i, clip in enumerate(clips, 1):
        if not isinstance(clip, dict) or parse_int(clip.get("order"), 0) != i:
            return {"created": 0, "reason": "approved_manifest_order_invalid"}
        url = str(clip.get("url") or clip.get("src") or "").strip()
        drive_id = str(clip.get("googleDriveFileId") or clip.get("google_drive_file_id") or "").strip()
        family = str(clip.get("mediaAssetRecordId") or "").strip()
        exact = f"https://media.chicagoshining.com/studio/previews/lettered/{record_id}/{i-1}.jpg"
        if (url != exact or url in urls or drive_id in drive_ids
                or not re.fullmatch(r"[A-Za-z0-9_-]{15,}", drive_id)
                or not re.fullmatch(r"rec[A-Za-z0-9]{14}", family)):
            return {"created": 0, "reason": "approved_manifest_source_invalid"}
        urls.add(url)
        drive_ids.add(drive_id)
        rows.append({
            "Slide Name": f"Facebook {output_number} slide {i}",
            "Slide Number": i,
            "Current Order": i,
            "Platform Output": [record_id],
            "PO_Output_ID": [int(output_number)],
            "Asset_4x5_File_URL": f"https://drive.google.com/file/d/{drive_id}/view",
            "Google Drive File ID": drive_id,
            "Asset_Family_Key": family,
            "Review Status": "Final Approved",
            "Shared_Asset_Approved": True,
            "Asset_4x5_Public_Status": "Ready",
            "Asset_4x5_Public_URL": url,
            "Current Image URL": url,
            "Final Image URL": url,
            "Watermarked Image URL": url,
            "Deleted From Carousel": False,
        })
    verifier = verify_url or verify_public_4x5_image
    if not all(verifier(url) for url in urls):
        return {"created": 0, "reason": "public_4x5_image_preflight_failed"}

    created = client.create_records(CAROUSEL_SLIDES_TABLE, rows, typecast=True)
    if len(created) != expected:
        raise RuntimeError("FB0 missing-slide recovery not fully committed")
    confirmed = list_ready_slides(
        client, output_number, output_record_id=record_id, max_photos=DEFAULT_MAX_PHOTOS,
    )
    if len(confirmed) != expected:
        raise RuntimeError("FB0 missing-slide recovery could not verify the canonical linked set")
    return {"created": len(confirmed), "reason": "recovered_verified_manifest"}

def photo_urls(slides: list[dict[str, Any]]) -> list[str]:
    return [url for url in (field_str(slide, "Asset_4x5_Public_URL") for slide in slides) if url]


def photo_ids(slides: list[dict[str, Any]]) -> list[str]:
    return [photo_id for photo_id in (field_str(slide, "FB_Photo_ID") for slide in slides) if photo_id]


def quoted_url_array(urls: list[str]) -> str:
    return json_text(urls)


def facebook_message(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    if caption and hashtags:
        return f"{caption}\n\n{hashtags}"
    return caption or hashtags


def post_fingerprint(message: str, ids: list[str]) -> str:
    return hashlib.sha256(f"{message}|{','.join(ids)}".encode("utf-8")).hexdigest()


def _parse_utc(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def photo_needs_create(
    slide: dict[str, Any],
    *,
    package_rev: str,
    recreate_hours: int = DEFAULT_UNPUBLISHED_RECREATE_HOURS,
    now: datetime | None = None,
) -> bool:
    if not field_str(slide, "FB_Photo_ID"):
        return True
    if _ci(field_str(slide, "FB_Photo_Status")) != _ci(PHOTO_STATUS_READY):
        return True
    if field_str(slide, "FB_Photo_Package_Revision") != package_rev:
        return True
    created = _parse_utc(field_str(slide, "FB_Photo_Created_At"))
    if created is None:
        return False
    age = (now or datetime.now(timezone.utc)) - created
    return age.total_seconds() >= max(recreate_hours, 0) * 3600
