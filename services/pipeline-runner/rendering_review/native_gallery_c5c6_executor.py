"""One-shot non-Vibe C5/C6 Runner execution through protected Worker ledger.

A claimed Airtable job is the ONLY input; browser-selected URLs, assets, and
generation metadata are never accepted. The Worker reserves a durable launch
intent *before* any C5 call. Ambiguous launch/upload/rights/commit requires
manual reconciliation: this function and the HTTP caller never retry it.
No original slide, source media, approval, schedule, or post is modified.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.image_gen import build_c5_prompt
from rendering_review.gallery_authoritative import read_authoritative_gallery_source
from rendering_review.gallery_branding_pixels import visible_source_watermark
from rendering_review.gallery_media_io import GalleryMediaIO
from rendering_review.native_gallery_claim_client import (
    JOBS, claim_one_native_gallery_job,
)
from rendering_review.native_gallery_launch_client import reserve_native_gallery_launch
from rendering_review.native_gallery_rights_registration import (
    register_native_gallery_rights, private_permissions,
)
from rendering_review.outbox_claim import _one_shot_post
from rendering_review.remote_ledger import _validate_base

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
FILE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")


class NativeGalleryExecutionDenied(RuntimeError):
    pass


def deny(reason):
    raise NativeGalleryExecutionDenied(reason)


def _json_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False,
         separators=(",", ":")).encode("utf-8")).hexdigest()


def _select(value):
    return str(value.get("name") or "") if isinstance(value, dict) else str(value or "")


def _job_for_receipt(client, receipt):
    job_id, output_id = receipt.get("job_id"), receipt.get("output_id")
    if not TOKEN.fullmatch(str(job_id or "")) or not REC.fullmatch(str(output_id or "")):
        deny("native_gallery_execution_claim_invalid")
    rows = client.list_records(JOBS, formula='{Job_ID}="' + job_id + '"',
                               max_records=2)
    if not isinstance(rows, list) or len(rows) != 1:
        deny("native_gallery_execution_job_not_unique")
    f = rows[0].get("fields") or {}
    if (not REC.fullmatch(str(rows[0].get("id") or "")) or
        f.get("Job_ID") != job_id or f.get("Output_Record_ID") != output_id or
        f.get("Job_State") != "claimed" or f.get("Row_Version") != 3 or
        f.get("Lease_Owner") != receipt.get("lease_owner") or
        f.get("Lease_Fence") != receipt.get("lease_fence") or
        not SHA.fullmatch(str(f.get("Launch_Intent_SHA256") or "")) or
        not SHA.fullmatch(str(f.get("Original_Manifest_SHA256") or "")) or
        not SHA.fullmatch(str(f.get("Plan_SHA256") or "")) or
        not REC.fullmatch(str(f.get("Profile_Record_ID") or "")) or
        not REC.fullmatch(str(f.get("Content_Item_Record_ID") or ""))):
        deny("native_gallery_execution_lease_or_ledger_changed")
    try:
        plan = json.loads(f["Plan_JSON"])
        original = json.loads(f["Original_Manifest_JSON"])
        history = json.loads(f["Event_History_JSON"])
    except (ValueError, TypeError, KeyError):
        deny("native_gallery_execution_ledger_unreadable")
    if (not isinstance(plan, dict) or not isinstance(original, list) or
        not 1 <= len(original) <= 20 or not isinstance(history, list) or
        len(history) != 3 or
        history[2].get("event") != "native_gallery_launch_intent_reserved" or
        history[2].get("lease_owner") != receipt["lease_owner"] or
        history[2].get("lease_fence") != receipt["lease_fence"] or
        history[2].get("payload_hash") != f["Launch_Intent_SHA256"] or
        any(e.get("publication_authorized") is not False for e in history) or
        _json_hash(plan) != f["Plan_SHA256"] or
        plan.get("output_id") != output_id or
        plan.get("content_item_id") != f["Content_Item_Record_ID"] or
        plan.get("profile_id") != f["Profile_Record_ID"] or
        plan.get("original_manifest_sha256") != f["Original_Manifest_SHA256"] or
        plan.get("human_intent") != "explicit_button" or
        plan.get("allow_public_publish") is not False or
        plan.get("auto_approve") is not False or
        plan.get("mutate_original_production_request") is not False or
        plan.get("mutate_sibling_outputs") is not False):
        deny("native_gallery_execution_plan_unverified")
    selected = plan.get("selected")
    if not isinstance(selected, list) or not 1 <= len(selected) <= len(original):
        deny("native_gallery_execution_selection_invalid")
    if any(not isinstance(x, dict) or
           not REC.fullmatch(str(x.get("slide_id") or "")) or
           not isinstance(x.get("instruction"), str) or
           not 8 <= len(x["instruction"].strip()) <= 3000 or
           type(x.get("order")) is not int for x in selected):
        deny("native_gallery_execution_selection_invalid")
    if len({x["slide_id"] for x in selected}) != len(selected):
        deny("native_gallery_execution_duplicate_selection")
    return f, plan, original


def _held_output(client, job):
    output_id = job["Output_Record_ID"]
    row = client.get_record(PLATFORM_OUTPUTS_TABLE, output_id)
    f = row.get("fields") if isinstance(row, dict) else {}
    if (row.get("id") != output_id or
        f.get("Content_Item") != [job["Content_Item_Record_ID"]] or
        f.get("Do_Not_Publish") is not True or
        f.get("Studio_Render_Review_Hold_Active") is not True or
        f.get("Studio_Render_Review_Hold_ID") != job["Hold_ID"] or
        f.get("Studio_Render_Review_Hold_Owner") != job["Hold_Owner"] or
        f.get("Studio_Render_Review_Session_ID") != job["Hold_Owner"] or
        not re.search(r"image|photo|carousel|gallery|picture",
                      _select(f.get("Platform_Output_Type")), re.I) or
        any(f.get(key) for key in (
            "Published_At", "Platform_Post_ID", "Platform_Post_URL",
            "Platform_Media_ID", "Publish_Started_At", "Publish_Locked_At",
            "Publish_Locked_By", "Scheduled_Post_Date",
            "Studio_Scheduled_At", "YouTube_Scheduled_Publish_At")) or
        _select(f.get("Publish_Status")).lower() in
            ("published", "publishing", "dispatched")):
        deny("native_gallery_execution_publication_hold_lost")
    return True


def execute_one_native_gallery(*, client, drive, worker_base,
                               shared_secret, consumer_identity,
                               staging_folder_id, rights_clearance,
                               transport=None, generator=None):
    """Process at most one queued job. Provider and Airtable writes are once-only.

    The independent rights_clearance callback is mandatory: a generator
    response alone is NOT proof of commercial ownership. If it raises/denies,
    the job stays held for reconciliation and never gets publish authority.
    """
    if os.environ.get("NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED") != "true":
        deny("native_gallery_executor_disabled")
    if (not callable(rights_clearance) or
        not FILE.fullmatch(str(staging_folder_id or "")) or
        not isinstance(shared_secret, str) or len(shared_secret) < 24 or
        not TOKEN.fullmatch(str(consumer_identity or ""))):
        deny("native_gallery_executor_configuration_incomplete")
    try:
        origin = _validate_base(worker_base)
    except Exception as exc:
        raise NativeGalleryExecutionDenied("native_gallery_worker_origin_invalid") from exc
    sender = transport or _one_shot_post
    # Each call searches ONLY the held_queued outbox. A prior reserved claim
    # is never silently resumed or launched a second time.
    claim = claim_one_native_gallery_job(
        client=client, worker_base=origin, shared_secret=shared_secret,
        consumer_identity=consumer_identity, transport=sender)
    if claim.get("claimed") is False:
        return {"ok": True, "claimed": False, "publication_authorized": False}
    receipt = claim.get("receipt")
    if not isinstance(receipt, dict) or receipt.get("lease_verified") is not True:
        deny("native_gallery_executor_claim_receipt_invalid")
    intent = reserve_native_gallery_launch(
        client=client, worker_base=origin, shared_secret=shared_secret,
        claim_receipt=receipt, transport=sender)
    if (intent.get("may_generate") is not True or
        intent.get("publication_authorized") is not False):
        deny("native_gallery_executor_launch_not_reserved")
    job, plan, original = _job_for_receipt(client, receipt)
    if intent.get("payload_hash") != job["Launch_Intent_SHA256"]:
        deny("native_gallery_executor_launch_hash_changed")
    _held_output(client, job)
    source = read_authoritative_gallery_source(
        client=client, drive=drive, output_id=receipt["output_id"],
        expected_profile_id=job["Profile_Record_ID"])
    if (source.get("content_item_id") != job["Content_Item_Record_ID"] or
        source.get("original_artifacts_sha256") != job["Original_Manifest_SHA256"] or
        source.get("artifacts") != original or
        source.get("sources_byte_verified") is not True or
        source.get("original_artifact_watermark_verified") is not True):
        deny("native_gallery_executor_source_changed")
    ratio = source.get("aspect_ratio")
    by_id = {row["slot_id"]: row for row in original}
    chosen = {x["slide_id"]: x for x in plan["selected"]}
    if (any(x["slide_id"] not in by_id or
            by_id[x["slide_id"]]["order"] != x["order"]
            for x in plan["selected"]) or
        len(chosen) != len(plan["selected"])):
        deny("native_gallery_executor_selection_changed")
    opts = dict(client=client, drive=drive, profile_id=job["Profile_Record_ID"],
                staging_folder_id=staging_folder_id)
    if generator is not None:
        opts["generator"] = generator
    media = GalleryMediaIO.from_profile_catalog(**opts)
    result = []
    for old in original:
        selected = chosen.get(old["slot_id"])
        if not selected:
            result.append(dict(old))
            continue
        # Check the protected hold for every external C5 generation call.
        _held_output(client, job)
        refreshed, refreshed_plan, refreshed_original = _job_for_receipt(client, receipt)
        if (refreshed.get("Plan_SHA256") != job["Plan_SHA256"] or
            refreshed_plan != plan or refreshed_original != original):
            deny("native_gallery_executor_lease_changed_before_c5")
        prompt = build_c5_prompt(
            replacement_prompt=selected["instruction"], review_notes="",
            original_prompt="", platform=source["platform"], ratio=ratio)
        raw = media.generate_image(prompt, ratio)
        branded = media.watermark_image(raw, job["Profile_Record_ID"])
        if not visible_source_watermark(branded, media.profile_watermark):
            deny("native_gallery_executor_c6_pixel_verification_failed")
        filename = "review-%s-%s-%02d.png" % (
            receipt["output_id"], receipt["job_id"], old["order"])
        file_id = media.upload_image(filename, branded)["id"]
        expected_sha = hashlib.sha256(branded).hexdigest()
        proof = media.verify_drive_image(file_id, expected_sha, len(branded))
        if (not isinstance(proof, dict) or
            proof.get("google_drive_verified") is not True or
            proof.get("sha256") != expected_sha or
            proof.get("byte_count") != len(branded) or
            proof.get("mime_type") != "image/png" or
            type(proof.get("width")) is not int or
            type(proof.get("height")) is not int):
            deny("native_gallery_executor_drive_receipt_invalid")
        private_permissions(drive, file_id)
        rights = register_native_gallery_rights(
            client=client, drive=drive, output_id=receipt["output_id"],
            profile_id=job["Profile_Record_ID"],
            content_item_id=job["Content_Item_Record_ID"],
            job_id=receipt["job_id"], slot_id=old["slot_id"],
            file_id=file_id, sha256=proof["sha256"],
            byte_count=proof["byte_count"],
            rights_clearance=rights_clearance,
            staging_folder_id=staging_folder_id)
        if (not isinstance(rights, dict) or
            rights.get("verified") is not True or
            rights.get("publication_authorized") is not False or
            not REC.fullmatch(str(rights.get("media_asset_record_id") or ""))):
            deny("native_gallery_executor_rights_receipt_invalid")
        result.append({**old, "drive_file_id": file_id,
                       "sha256": proof["sha256"],
                       "mime_type": "image/png",
                       "byte_count": proof["byte_count"],
                       "width": proof["width"], "height": proof["height"],
                       "revision_media_asset_id": rights["media_asset_record_id"],
                       "rights_verified": True, "watermark_verified": True})
    _held_output(client, job)
    payload = {"output_id": receipt["output_id"], "job_id": receipt["job_id"],
               "lease_owner": receipt["lease_owner"],
               "lease_fence": receipt["lease_fence"],
               "launch_intent_sha256": intent["payload_hash"],
               "revision_artifacts": result}
    digest = _json_hash(result)
    try:
        committed = sender(
            origin + "/api/internal/native-gallery/commit-manifest",
            payload, {"Content-Type": "application/json",
                      "X-Native-Gallery-Job-Secret": shared_secret}, 30.0)
    except Exception as exc:
        raise NativeGalleryExecutionDenied(
            "native_gallery_manifest_commit_ambiguous_reconciliation_required"
        ) from exc
    if (not isinstance(committed, dict) or committed.get("ok") is not True or
        committed.get("replay") is not False or
        committed.get("job_id") != receipt["job_id"] or
        committed.get("output_id") != receipt["output_id"] or
        committed.get("manifest_sha256") != digest or
        committed.get("publication_authorized") is not False or
        committed.get("factory_approved") is not False or
        committed.get("creative_approved") is not False):
        deny("native_gallery_manifest_commit_unverified")
    return {"ok": True, "claimed": True, "state": "ready_for_review",
            "job_id": receipt["job_id"], "output_id": receipt["output_id"],
            "rendered_count": len(chosen), "manifest_sha256": digest,
            "publication_authorized": False,
            "factory_approved": False, "creative_approved": False}
