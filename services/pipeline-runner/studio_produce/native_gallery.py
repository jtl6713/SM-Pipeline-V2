"""Owned Studio native gallery completion; canonical Supabase, no provider calls.

The producer owns the same durable request as its video siblings. This builds
an exact review package, never a human approval. Keep original masters/crops.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
from datetime import datetime, timezone
from urllib.parse import quote

from PIL import Image, ImageOps
import requests

from airtable.constants import MEDIA_ASSETS_TABLE
from branding.watermark import apply_watermark_bytes, brand_watermark_bytes
from integrations.google_drive import GoogleDriveClient
from integrations.r2_upload import R2UploadClient
from lettering.compositor import letter_jpeg_bytes, overlay_text_for_clip
from render.fields import field, field_str, parse_json_field
from supabase_pipeline import _rest

KEY = "SM_Studio_Native_Gallery_2873"
AUTHORITY = "studio_owner_uploaded_exact_source"
REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
CDN = "https://media.chicagoshining.com/"
TYPES = {"Instagram Carousel", "Facebook Photo Set"}
SIZE = (1080, 1350)


def meta_gallery(platform, output_type, mapping=""):
    return (platform == "Instagram" and (mapping == "Instagram Carousel" or output_type == "Carousel")
            or platform == "Facebook" and (mapping == "Facebook Photo Set" or output_type in {"Photo Set", "Multi-Image Post"}))


def selected_body(clips):
    """A generated cover occupies slot one; no overflow warning or blocking."""
    return list(clips[:9])


def pending_gallery(output):
    if (field_str(output, "Output_Status") not in {"In Production", "Ready for Review"}
            or field_str(output, "Render_Status") != "Native Photo Route"
            or field(output, "Do_Not_Publish") is True
            or field_str(output, "Review_Status") not in {"", "Pending", "Review Sent", "Pending Review"}
            or field_str(output, "Publish_Status") not in {"", "Not Ready"}):
        return False
    selected = parse_json_field(field(output, "Selected_Assets_JSON"))
    return (meta_gallery(field_str(output, "Platform"), field_str(output, "Studio_Output_Type"),
                         field_str(output, "Platform_Output_Type"))
            and isinstance(selected, dict) and selected.get("authority") == AUTHORITY
            and isinstance(selected.get("selected_clips"), list)
            and not (isinstance(selected.get(KEY), dict) and selected[KEY].get("complete") is True))


def _one(rows):
    if not isinstance(rows, list) or len(rows) != 1:
        raise RuntimeError("Native gallery exact canonical identity unavailable")
    return rows[0]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _slide_id(output_id, order):
    return "rec" + hashlib.sha256(f"studio-gallery-2873:{output_id}:{order}".encode()).hexdigest()[:14]


def _owned(asset, profile, drive):
    return (asset.get("active") is True and asset.get("do_not_use") is False
            and asset.get("asset_status") == "Available" and asset.get("google_drive_file_id") == drive
            and asset.get("metadata", {}).get("rights_status") == "Owned"
            and asset.get("metadata", {}).get("content_profile_airtable_id") == profile)


def _safe_output(row):
    bag = row.get("error_messages") or {}
    return (row.get("platform_output_type") in TYPES
            and row.get("output_status") in {"In Production", "Ready for Review"}
            and row.get("render_status") == "Native Photo Route"
            and row.get("review_status") in {None, "", "Review Sent", "Pending", "Pending Review"}
            and row.get("publish_status") in {None, "", "Not Ready"}
            and row.get("do_not_publish") is False and not row.get("auto_publish_enabled")
            and not any(row.get(k) for k in ("test_run_id", "studio_scheduled_at", "youtube_scheduled_publish_at",
                    "published_at", "platform_post_url", "platform_publish_response"))
            and not any(bag.get(k) for k in ("Studio_Render_Review_Hold_Active", "Factory_Review_Handoff_Safety_Hold_At",
                    "SM_2618_Creative_QA_Hold", "Platform_Post_ID", "Platform_Media_ID", "IG_Carousel_Parent_Container_ID",
                    "Publish_Locked_At", "Publish_Started_At", "Studio_Publish_Dispatch_At",
                    "Publish_Attempt_Count", "Studio_Publish_Attempt_Count", "Studio_Publish_Dispatch_Count")))


def _cover_jpeg(data):
    # Do not crop lettering from a portrait cover. Preserve the entire design.
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        contained = ImageOps.contain(image, SIZE, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", SIZE, (15, 24, 37))
        canvas.paste(contained, ((SIZE[0]-contained.width)//2, (SIZE[1]-contained.height)//2))
        out = io.BytesIO()
        canvas.save(out, format="JPEG", quality=94)
        return out.getvalue()


def _image_proof(data):
    if not isinstance(data, bytes) or not 0 < len(data) <= 8 * 1024 * 1024:
        raise RuntimeError("Native gallery image byte budget exceeded")
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "JPEG" or image.size != SIZE:
            raise RuntimeError("Native gallery image geometry mismatch")
        image.verify()
    return hashlib.sha256(data).hexdigest()


def _prepare_body_jpeg(data):
    """Normalize a verified high-resolution 4:5 JPEG for review, not its source.

    Some older crop receipts report 1080x1350 while the exact owned Drive
    bytes are 2160x2700. A resize of a matching aspect is safe; a wrong
    aspect, undersized source, non-JPEG or corrupt image is not.
    """
    if not isinstance(data, bytes) or not 0 < len(data) <= 8 * 1024 * 1024:
        raise RuntimeError("Native gallery source image byte budget exceeded")
    with Image.open(io.BytesIO(data)) as source:
        width, height = source.size
        if (source.format != "JPEG" or width * SIZE[1] != height * SIZE[0]
                or width < SIZE[0] or height < SIZE[1]
                or width * height > 16_000_000):
            raise RuntimeError(f"Native gallery source geometry invalid: {source.format} {width}x{height}")
        source.verify()
    with Image.open(io.BytesIO(data)) as source:
        # The exact crop is already oriented. Reject rotated EXIF rather than
        # silently changing the effective crop or letter/watermark positions.
        if source.getexif().get(274, 1) != 1:
            raise RuntimeError("Native gallery source orientation invalid")
        source.load()
        if source.size == SIZE:
            _image_proof(data)
            return data
        out = io.BytesIO()
        source.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS).save(
            out, format="JPEG", quality=95, optimize=True)
    normalized = out.getvalue()
    _image_proof(normalized)
    return normalized


def _stage(uploader, data, parent_id):
    sha = _image_proof(data)
    key = f"studio/previews/watermarked/studio-gallery-2873/{parent_id}/{sha}.jpg"
    url = uploader.preview_url(key)
    if url != CDN + key:
        raise RuntimeError("Unexpected native gallery CDN namespace")
    # Immutable content address: same sibling bytes share the same object.
    uploader.put_object(key, data, "image/jpeg")
    with requests.get(url, stream=True, timeout=(5, 15), allow_redirects=False) as response:
        if response.status_code != 200 or response.headers.get("Content-Type", "").split(";")[0].lower() != "image/jpeg":
            raise RuntimeError("Native gallery CDN image unavailable")
        received = bytearray()
        for part in response.iter_content(65536):
            received.extend(part)
            if len(received) > 8 * 1024 * 1024:
                raise RuntimeError("Native gallery CDN byte budget exceeded")
    if _image_proof(bytes(received)) != sha:
        raise RuntimeError("Native gallery CDN image hash mismatch")
    return url, sha


def _clip(base, order, asset, drive, url, sha, cover=False):
    # Still manifests use both compatibility spellings for existing publishers.
    return {**base, "id": f"studio-gallery-{order}", "order": order, "url": url, "src": url,
            "media_asset_record_id": asset, "mediaAssetRecordId": asset,
            "google_drive_file_id": drive, "googleDriveFileId": drive,
            "aspect_ratio": "4:5", "media_kind": "photo", "mediaKind": "photo",
            "startFrame": order-1, "durationFrames": 1, "overlay": None, "caption": "",
            "watermarked": True, "lettered": True, "is_cover": cover, "sha256": sha}


def _same_slide(actual, desired):
    f = actual.get("fields") or {}
    return (actual.get("airtable_record_id") == desired["airtable_record_id"]
            and actual.get("deleted_from_carousel") is False
            and actual.get("current_order") == desired["current_order"]
            and all(f.get(k) == v for k, v in desired["fields"].items() if k not in
                    {"Review Status", "Approved For Final", "Shared_Asset_Approved"} )
            and f.get("Approved For Final") is False and f.get("Shared_Asset_Approved") is False)


LEGACY_HOLD = "SM_Native_Gallery_Preflight_Hold_2294"
LEGACY_DRAFT = "SM_Native_Gallery_Draft_Repair_2294"
LEGACY_RETIRED = "SM_Native_Gallery_Legacy_Superseded_2873"


def _legacy_candidate(row, clips):
    """Only an exact unapproved legacy inventory can be migrated.

    Never infer approval from a historical draft or remove an independent hold.
    """
    bag = row.get("error_messages") or {}
    proof = bag.get(LEGACY_HOLD)
    return (isinstance(proof, dict) and proof.get("issue_number") == 2294
            and proof.get("verification_status") == "not_yet_verified"
            and proof.get("publishing_authorized") is False
            and 2 <= len(clips) <= 9
            and row.get("selected_clip_count") == len(clips)
            and row.get("auto_publish_enabled") is False
            and not any(row.get(k) for k in ("scheduled_post_date", "publish_asset_url",
                      "platform_publish_response_text", "publish_retry_eligible"))
            and not any(bag.get(k) for k in ("SM_Factory_Supabase_Approval_Receipt",
                      "SM_Factory_Held_Review_Receipt", "Platform_Publish_Response",
                      "FB_Photo_ID", "IG_Child_Container_ID")))


def _legacy_id(number, order):
    return f"sb-native:2294:{number}:{order:02d}"


def _legacy_draft_matches(slide, clip, oid, number, order):
    f = slide.get("fields") or {}
    proof = f.get(LEGACY_DRAFT) or {}
    # A retired row retains its original source/order/receipt. No new receipt
    # or existing slide approval can be manufactured by this predicate.
    return (slide.get("airtable_record_id") == _legacy_id(number, order)
            and slide.get("current_order") == order and bool(slide.get("id"))
            and bool(slide.get("updated_at"))
            and f.get("Platform Output") == [oid] and f.get("PO_Output_ID") == [number]
            and f.get("Slide Number") == order
            and f.get("Final Image URL") == (clip.get("url") or clip.get("src"))
            and f.get("Asset_4x5_Public_URL") == f.get("Final Image URL")
            and str(f.get("Final Image URL") or "").startswith(CDN + "studio/previews/")
            and f.get("Asset_Family_Key") == clip.get("media_asset_record_id")
            and f.get("Google Drive File ID") == clip.get("google_drive_file_id")
            and f.get("Approved For Final") is False and f.get("Shared_Asset_Approved") is False
            and f.get("Review Status") == "Pending Review"
            and f.get("Asset_4x5_Public_Status") == "Ready"
            and not any(f.get(k) for k in ("FB_Photo_ID", "IG_Child_Container_ID", "Platform_Post_ID"))
            and proof.get("output_number") == number and proof.get("slide_order") == order
            and proof.get("source_asset") == clip.get("media_asset_record_id")
            and proof.get("variant_drive_file_id") == clip.get("google_drive_file_id")
            and proof.get("publishing_authorized") is False
            and proof.get("final_creative_approved") is False)


def _load_legacy_drafts(read, row, clips):
    expected = [_legacy_id(row["output_number"], i) for i in range(1, len(clips)+1)]
    rows = read("carousel_slides?airtable_record_id=in.(" + ",".join(quote(x) for x in expected)
                + ")&select=id,airtable_record_id,current_order,deleted_from_carousel,fields,updated_at&limit=10")
    if not isinstance(rows, list) or len(rows) != len(expected):
        raise RuntimeError("Legacy gallery exact draft inventory unavailable")
    by_id = {s["airtable_record_id"]: s for s in rows}
    if set(by_id) != set(expected):
        raise RuntimeError("Legacy gallery draft identity mismatch")
    ordered = [by_id[x] for x in expected]
    for i, (s, c) in enumerate(zip(ordered, clips), 1):
        if not _legacy_draft_matches(s, c, row["airtable_record_id"], row["output_number"], i):
            raise RuntimeError("Legacy gallery draft source or human approval changed")
        if s.get("deleted_from_carousel") is not False:
            retired = s.get("fields", {}).get(LEGACY_RETIRED) or {}
            if (s.get("deleted_from_carousel") is not True
                    or retired.get("output_record_id") != row["airtable_record_id"]
                    or retired.get("request_id") != row["selected_assets"]["production_request_record_id"]
                    or retired.get("human_approval_required") is not True):
                raise RuntimeError("Legacy gallery deletion not owned by this recovery")
    return ordered


def _retire_legacy_drafts(read, write, row, drafts, request_id, fingerprint):
    """Retire only exact old unapproved rows, retaining immutable history.

    A partial interruption is recoverable by the same package SHA. Never
    reactivate or retire another revision, or create duplicate active slides.
    """
    receipt = {"output_record_id": row["airtable_record_id"], "request_id": request_id,
               "package_sha256": fingerprint, "human_approval_required": True,
               "provider_writes": 0}
    if any(d.get("deleted_from_carousel") is True and d["fields"].get(LEGACY_RETIRED) != receipt for d in drafts):
        raise RuntimeError("Legacy gallery retirement belongs to a different package")
    for draft in drafts:
        f = draft["fields"]
        if draft.get("deleted_from_carousel") is True:
            continue
        latest = _one(read("platform_outputs?airtable_record_id=eq." + row["airtable_record_id"]
                           + "&select=*&limit=2"))
        if latest.get("updated_at") != row.get("updated_at") or not _safe_output(latest):
            raise RuntimeError("Legacy gallery output revision changed before retirement")
        changed = write("carousel_slides?id=eq." + quote(str(draft["id"]))
                        + "&airtable_record_id=eq." + quote(draft["airtable_record_id"])
                        + "&updated_at=eq." + quote(draft["updated_at"])
                        + "&deleted_from_carousel=eq.false", "PATCH",
                        {"deleted_from_carousel": True, "fields": {**f,
                         "Deleted From Carousel": True, LEGACY_RETIRED: receipt}, "updated_at": _now()})
        if not isinstance(changed, list) or len(changed) != 1:
            raise RuntimeError("Legacy gallery retirement CAS unverified")


def _legacy_caption(client, request, parent, row):
    caption = str(row.get("output_caption") or "")
    if caption.strip():
        return caption
    bag = row.get("error_messages") or {}
    if bag.get("Studio_Effective_Caption_Mode") != "AI decides":
        raise RuntimeError("Legacy gallery missing user-controlled caption")
    from studio_produce.steps import studio_market_for_request, theme_title, caption_locked
    from sai1.processor import process_request
    from p3.helpers import caption_with_hashtags
    if caption_locked(request):
        raise RuntimeError("Legacy gallery requires exact user caption")
    title = theme_title(request, parent)
    if not title:
        raise RuntimeError("Legacy gallery caption subject unavailable")
    result = process_request(title=title, market=studio_market_for_request(client, request, parent),
        covered_text="Unverified scene/season: write destination-planning copy, not claims about what the selected photos depict or current operating details.",
        needed=0, total=0)
    themes = result.get("themes") or {}
    text = str(themes.get("post_caption") or "").strip()
    if not result.get("processed") or not text or text.casefold() == title.strip().casefold():
        raise RuntimeError("Legacy gallery AI caption unavailable")
    return caption_with_hashtags(text, str(themes.get("hashtags") or ""))


def complete_gallery(client, request, parent, output):
    """Rebuild exact unapproved owner-uploaded gallery; retry uses fixed slide IDs."""
    cfg = client._settings
    def read(path):
        return _rest(cfg, path, "GET")
    def write(path, method, body, prefer="return=representation"):
        return _rest(cfg, path, method, body, prefer=prefer)
    oid, pid, rid = output["id"], parent["id"], request["id"]
    if not all(REC.fullmatch(x) for x in (oid, pid, rid)):
        raise RuntimeError("Native gallery identity invalid")
    row = _one(read(f"platform_outputs?airtable_record_id=eq.{oid}&select=*&limit=2"))
    if not _safe_output(row):
        raise RuntimeError("Native gallery not an unapproved safe production output")
    selected = row.get("selected_assets") or {}
    if selected.get("authority") != AUTHORITY or selected.get("production_request_record_id") != rid:
        raise RuntimeError("Native gallery original selection not verified")
    parent_row = _one(read(f"content_items?airtable_record_id=eq.{pid}&select=id,content_profile_id,production_request_id,thumbnail_url,extras&limit=2"))
    request_row = _one(read(f"production_requests?airtable_record_id=eq.{rid}&select=id,promoted_content_item_id,master_assets,variant_status&limit=2"))
    if (parent_row["id"] != row.get("content_item_id") or request_row.get("promoted_content_item_id") != parent_row["id"]
            or parent_row.get("content_profile_id") != row.get("content_profile_id")
            or request_row.get("variant_status") != "Ready"):
        raise RuntimeError("Native gallery request/content/profile ownership mismatch")
    profile = _one(read(f"content_profiles?id=eq.{row['content_profile_id']}&select=airtable_record_id&limit=2"))["airtable_record_id"]
    if not REC.fullmatch(profile):
        raise RuntimeError("Native gallery profile invalid")
    number = row["output_number"]
    selector = ("carousel_slides?deleted_from_carousel=eq.false&fields->PO_Output_ID=cs."
                + quote(json.dumps([number])) + "&select=airtable_record_id,current_order,deleted_from_carousel,fields&limit=12")
    existing = read(selector)
    clips = selected.get("selected_clips")
    if not isinstance(clips, list) or not clips or not isinstance(existing, list):
        raise RuntimeError("Native gallery selected photos or slides unavailable")
    legacy = _legacy_candidate(row, clips)
    drafts = _load_legacy_drafts(read, row, clips) if legacy else []
    legacy_ids = {s["airtable_record_id"] for s in drafts if s.get("deleted_from_carousel") is False}
    if not legacy_ids.issubset({s["airtable_record_id"] for s in existing}):
        raise RuntimeError("Legacy gallery active inventory changed")
    existing = [s for s in existing if s["airtable_record_id"] not in legacy_ids]
    if any((s.get("fields") or {}).get(KEY, {}).get("request_id") != rid
           or s.get("airtable_record_id") != _slide_id(oid,s.get("current_order")) for s in existing):
        raise RuntimeError("Existing gallery belongs to another review revision")
    caption = _legacy_caption(client, request, parent, row) if legacy else str(row.get("output_caption") or "")
    if not caption.strip():
        raise RuntimeError("Native gallery caption unavailable")
    target_body = len(selected_body(clips))
    # Walk selected sources in order; only skip byte-identical final images.
    # Preserve the original inventory and never pull unrelated assets.
    sources = request_row.get("master_assets") or []
    source_ids = {str(s.get("id")) for s in sources if isinstance(s, dict)}
    crop_rows = read(f"studio_media_transfer_queue?payload->>production_request_record_id=eq.{rid}"
                     "&payload->>aspect_ratio=eq.4%3A5&status=eq.Ready&select=payload&limit=100")
    if not isinstance(crop_rows, list):
        raise RuntimeError("Native gallery crop receipts unavailable")
    crop_map = {}
    for crop_row in crop_rows:
        crop = crop_row["payload"]
        key = str(crop.get("source_asset_id"))
        if key in crop_map:
            raise RuntimeError("Native gallery crop identity ambiguous")
        crop_map[key] = crop
    cover_drive = (parent_row.get("extras") or {}).get("Thumbnail_Google_Drive_File_ID")
    cover_url = str(parent_row.get("thumbnail_url") or "")
    if (not cover_drive or not cover_url.startswith(CDN + "studio/previews/thumbnails/" + pid + "/")
            or (parent_row.get("extras") or {}).get("Thumbnail_Status") != "Generated"):
        raise RuntimeError("Native gallery generated cover provenance missing")
    drive = GoogleDriveClient()
    uploader = R2UploadClient()
    watermark = brand_watermark_bytes(client)
    cover_raw, _ = drive.download_file(cover_drive, timeout=60)
    if len(cover_raw) > 16 * 1024 * 1024:
        raise RuntimeError("Native cover byte budget exceeded")
    prior_cover = read("media_assets?google_drive_file_id=eq."+quote(cover_drive)
                       +"&select=airtable_record_id,active,do_not_use,asset_status,google_drive_file_id,metadata&limit=2")
    if not isinstance(prior_cover, list) or len(prior_cover)>1:
        raise RuntimeError("Native cover media identity ambiguous")
    if prior_cover:
        if not _owned(prior_cover[0], profile, cover_drive):
            raise RuntimeError("Existing cover rights or profile unverified")
        cover_id = prior_cover[0]["airtable_record_id"]
    else:
        cover_asset, _ = client.upsert_record(MEDIA_ASSETS_TABLE, {
            "Asset Name": f"Studio generated cover {pid}", "Google Drive File ID": cover_drive,
            "Media_Class": "Image", "Asset_Status": "Available", "Active": True, "Do_Not_Use": False,
            "Rights_Status": "Owned", "Content_Profile": [profile],
        }, merge_field="Google Drive File ID")
        cover_id = cover_asset["id"]
        stored_cover = _one(read(f"media_assets?airtable_record_id=eq.{cover_id}&select=airtable_record_id,active,do_not_use,asset_status,google_drive_file_id,metadata&limit=2"))
        if not _owned(stored_cover, profile, cover_drive):
            raise RuntimeError("Native cover media authority not verified")
    ids = [cover_id]
    prepared = []
    url, sha = _stage(uploader, _cover_jpeg(cover_raw), pid)
    prepared.append(_clip({"asset_name":"Generated cover"}, 1, cover_id, cover_drive, url, sha, True))
    skipped_duplicates = []
    seen_sources = set()
    source_hashes = set()
    final_hashes = {sha}
    for clip in clips:
        if len(prepared) == target_body + 1:
            break
        if not isinstance(clip, dict) or clip.get("media_kind") != "photo" or not clip.get("source_asset_id"):
            raise RuntimeError("Native gallery must contain exact selected stills")
        source_id = clip["source_asset_id"]
        if source_id in seen_sources:
            raise RuntimeError("Native gallery duplicate source identity")
        seen_sources.add(source_id)
        crop = crop_map.get(source_id) or {}
        asset_id, drive_id = crop.get("media_asset_record_id"), crop.get("drive_file_id")
        if (source_id not in source_ids or not REC.fullmatch(str(asset_id or ""))
                or not drive_id or crop.get("width") != 1080 or crop.get("height") != 1350):
            raise RuntimeError("Native gallery crop ownership or geometry not verified")
        asset = _one(read(f"media_assets?airtable_record_id=eq.{asset_id}&select=airtable_record_id,active,do_not_use,asset_status,google_drive_file_id,metadata&limit=2"))
        if not _owned(asset, profile, drive_id):
            raise RuntimeError("Native gallery source is unavailable or rights unverified")
        if legacy and drive_id != clip.get("google_drive_file_id"):
            raise RuntimeError("Legacy gallery crop Drive provenance changed")
        raw, _ = drive.download_file(drive_id, timeout=60)
        try:
            body = _prepare_body_jpeg(raw)
        except (RuntimeError, OSError, ValueError) as exc:
            raise RuntimeError(f"Native gallery source {asset_id}: {exc}") from exc
        # Different Drive IDs can carry identical source bytes (#10430).
        # Check the already-normalized source before per-slide text or branding
        # changes its final hash. No additional network or decoder work.
        source_sha = hashlib.sha256(body).hexdigest()
        if source_sha in source_hashes:
            skipped_duplicates.append({"source_asset_id": source_id, "sha256": source_sha,
                                       "reason": "duplicate_pre_lettering_source"})
            continue
        source_hashes.add(source_sha)
        jpeg = letter_jpeg_bytes(body, overlay_text_for_clip(clip, str(row.get("output_title") or "")))
        final = apply_watermark_bytes(jpeg, watermark, output_format="jpeg")
        # Exact final JPEG hash, not filename or a fuzzy similarity guess.
        final_sha = hashlib.sha256(final).hexdigest()
        if asset_id in ids:
            raise RuntimeError("Native gallery duplicate media asset identity")
        if final_sha in final_hashes:
            skipped_duplicates.append({"source_asset_id": source_id, "sha256": final_sha})
            continue
        url, sha = _stage(uploader, final, pid)
        if sha != final_sha:
            raise RuntimeError("Native gallery staged final SHA mismatch")
        final_hashes.add(sha)
        prepared.append(_clip(clip, len(prepared)+1, asset_id, drive_id, url, sha))
        ids.append(asset_id)
    if len(prepared) != target_body + 1:
        raise RuntimeError(f"Native gallery insufficient distinct verified images: {len(prepared)} of {target_body+1}; {len(skipped_duplicates)} exact duplicates")
    if len(set(ids)) != len(ids) or len({c["url"] for c in prepared}) != len(prepared):
        raise RuntimeError("Native gallery identity or final URL collision")
    fingerprint = hashlib.sha256(json.dumps([[c["order"],c["media_asset_record_id"],c["google_drive_file_id"],c["url"],c["sha256"]]
                                             for c in prepared], separators=(",",":")).encode()).hexdigest()
    slides = []
    for c in prepared:
        n = c["order"]
        fields = {"Platform Output":[oid], "PO_Output_ID":[number], "Content Item":[pid],
                  "Slide Number":n, "Current Order":n, "Slide Name":c.get("asset_name") or f"Photo {n}",
                  "Is Cover":n == 1, "Deleted From Carousel":False, "Platform":row["platform"], "Aspect Ratio":"4:5",
                  "Final Image URL":c["url"], "Current Image URL":c["url"], "Asset_4x5_Public_URL":c["url"],
                  "Asset_4x5_Public_Status":"Ready", "IG_Public_Asset_URL":c["url"], "IG_Public_Asset_Status":"Ready",
                  "Google Drive File ID":c["google_drive_file_id"], "Asset_Family_Key":c["media_asset_record_id"],
                  "Review Status":"Review Sent", "Shared_Asset_Approved":False, "Approved For Final":False,
                  KEY:{"request_id":rid,"package_sha256":fingerprint,"sha256":c["sha256"],
                       "owned_media_verified":True,"human_approval_required":True}}
        slides.append({"airtable_record_id":_slide_id(oid,n),"current_order":n,"deleted_from_carousel":False,
                       "fields":fields,"updated_at":_now()})
    desired = {s["airtable_record_id"]:s for s in slides}
    if any(s["airtable_record_id"] not in desired or not _same_slide(s, desired[s["airtable_record_id"]]) for s in existing):
        raise RuntimeError("Native gallery retry encountered a different or approved revision")
    missing = [s for s in slides if s["airtable_record_id"] not in {e["airtable_record_id"] for e in existing}]
    if legacy:
        if skipped_duplicates or len(prepared) != len(clips)+1:
            raise RuntimeError("Legacy gallery exact source order cannot be preserved")
        _retire_legacy_drafts(read, write, row, drafts, rid, fingerprint)
    if missing:
        write("carousel_slides?on_conflict=airtable_record_id","POST",missing,
              "resolution=ignore-duplicates,return=representation")
    verified = read(selector)
    if not isinstance(verified,list) or len(verified)!=len(slides) or any(
            s.get("airtable_record_id") not in desired or not _same_slide(s,desired[s["airtable_record_id"]]) for s in verified):
        raise RuntimeError("Native gallery persisted slide readback incomplete")
    at = _now()
    marker = {"complete":True,"request_id":rid,"package_sha256":fingerprint,"prepared_at":at,
              "slide_count":len(prepared),"human_approval_required":True,"provider_writes":0,
              "skipped_exact_duplicate_sources":skipped_duplicates}
    package = {**selected, "selected_clips":prepared, "aspect_ratio":"4:5", "target_total_frames":len(prepared),
               "render_prep":{**(selected.get("render_prep") or {}),"render_total_frames":len(prepared),
                              "render_clip_list_json":json.dumps(prepared)}, KEY:marker}
    bag = dict(row.get("error_messages") or {})
    # The full media byte check above is stronger than the ordinary technical
    # header probe. Use its exact signature so siblings do not wait on cron.
    sig = [oid,row["platform"],row.get("studio_output_type"),"Native Photo Route",
           row.get("final_file_url"),prepared[0]["url"],prepared[0]["url"],len(prepared),caption]
    bag["SM_Scheduling_Approval_Preflight_v1"] = {
        "version":1,"status":"verified","checked_at":at,
        "signature":json.dumps(sig,ensure_ascii=False,separators=(",",":")),
        "evidence":"public_media_full_bytes_and_geometry_verified",
        "native_source_count":len(prepared),"scope":"technical_media_only",
        "requires_human_approval":True,"scheduling_authorized":False,"publishing_authorized":False,
    }
    bag[KEY] = marker
    if legacy:
        bag[LEGACY_HOLD] = {**bag[LEGACY_HOLD], "verification_status":"verified_for_human_review",
                            "reconciled_at":at, "package_sha256":fingerprint,
                            "publishing_authorized":False}
    # CAS on exact output revision. Never change the user's proposed date or any provider state.
    changed = write(f"platform_outputs?id=eq.{row['id']}&updated_at=eq."+quote(row["updated_at"])
                    +"&do_not_publish=eq.false&published_at=is.null&studio_scheduled_at=is.null",
                    "PATCH",{"selected_assets":package,"render_clip_list":prepared,"selected_clip_count":len(prepared),
                             "aspect_ratio":"4:5","thumbnail_url":prepared[0]["url"],"studio_preview_url":prepared[0]["url"],
                             "output_caption":caption,
                             "output_status":"Ready for Review","review_status":"Review Sent","publish_status":"Not Ready",
                             "auto_publish_enabled":False,"error_messages":bag,"updated_at":at})
    if not isinstance(changed,list) or len(changed)!=1:
        from studio_produce.workload_governor import AdmissionDeferred
        raise AdmissionDeferred("Native gallery changed during production; retry safely")
    check = _one(read(f"platform_outputs?airtable_record_id=eq.{oid}&select=selected_assets,selected_clip_count,error_messages,output_status&limit=2"))
    if check.get("selected_clip_count") != len(slides) or check.get("error_messages",{}).get(KEY) != marker:
        raise RuntimeError("Native gallery output readback failed")
    return marker
