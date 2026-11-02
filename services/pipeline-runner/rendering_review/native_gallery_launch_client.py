"""Native gallery Runner -> Worker exact one-shot generation intent reservation.

No image generator call here. The only safe first launch is after the Worker
commits and re-reads a matching intent, and no ambiguous POST is ever retried.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

from rendering_review.native_gallery_claim_client import JOBS
from rendering_review.outbox_claim import _one_shot_post
from rendering_review.remote_ledger import _validate_base

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
FIELDS = ["Job_ID", "Output_Record_ID", "Profile_Record_ID",
          "Content_Item_Record_ID", "Plan_SHA256", "Original_Manifest_SHA256",
          "Job_State", "Lease_Owner", "Lease_Fence", "Row_Version",
          "Launch_Intent_SHA256", "Launch_Receipt_JSON", "Event_History_JSON"]


class NativeGalleryLaunchDenied(RuntimeError):
    pass


def deny(reason):
    raise NativeGalleryLaunchDenied(reason)


def reserve_native_gallery_launch(*, client, worker_base, shared_secret,
                                  claim_receipt, transport=None):
    if os.environ.get("NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED") != "true":
        deny("native_gallery_launch_disabled")
    if (not isinstance(claim_receipt, dict) or
            claim_receipt.get("lease_verified") is not True or
            claim_receipt.get("render_started") is not False or
            claim_receipt.get("publication_authorized") is not False or
            not REC.fullmatch(str(claim_receipt.get("output_id") or "")) or
            not TOKEN.fullmatch(str(claim_receipt.get("job_id") or "")) or
            not TOKEN.fullmatch(str(claim_receipt.get("lease_owner") or "")) or
            type(claim_receipt.get("lease_fence")) is not int or
            claim_receipt["lease_fence"] < 1 or
            not isinstance(shared_secret, str) or len(shared_secret) < 24):
        deny("native_gallery_launch_input_invalid")
    try:
        origin = _validate_base(worker_base)
    except Exception as exc:
        raise NativeGalleryLaunchDenied("native_gallery_worker_origin_invalid") from exc
    job_id = claim_receipt["job_id"]
    output_id = claim_receipt["output_id"]
    rows = client.list_records(
        JOBS, formula='{Job_ID}="' + job_id + '"',
        max_records=2, fields=FIELDS,
    )
    if not isinstance(rows, list) or len(rows) != 1:
        deny("native_gallery_launch_job_missing_or_ambiguous")
    row = rows[0]
    f = row.get("fields") if isinstance(row, dict) else None
    if (not isinstance(f, dict) or
            not REC.fullmatch(str(row.get("id") or "")) or
            f.get("Job_ID") != job_id or f.get("Output_Record_ID") != output_id or
            not REC.fullmatch(str(f.get("Profile_Record_ID") or "")) or
            not REC.fullmatch(str(f.get("Content_Item_Record_ID") or "")) or
            not SHA.fullmatch(str(f.get("Plan_SHA256") or "")) or
            not SHA.fullmatch(str(f.get("Original_Manifest_SHA256") or "")) or
            f.get("Job_State") != "claimed" or
            f.get("Lease_Owner") != claim_receipt["lease_owner"] or
            f.get("Lease_Fence") != claim_receipt["lease_fence"] or
            f.get("Row_Version") != 2):
        deny("native_gallery_launch_claim_changed")
    try:
        events = json.loads(f.get("Event_History_JSON") or "null")
    except (TypeError, ValueError):
        deny("native_gallery_launch_events_corrupt")
    if (not isinstance(events, list) or len(events) != 2 or
            events[0].get("event") != "native_gallery_job_created" or
            events[1].get("event") != "native_gallery_job_claimed" or
            events[1].get("lease_owner") != claim_receipt["lease_owner"] or
            events[1].get("lease_fence") != claim_receipt["lease_fence"] or
            any(e.get("publication_authorized") is not False for e in events) or
            f.get("Launch_Intent_SHA256") or f.get("Launch_Receipt_JSON")):
        deny("native_gallery_launch_already_reserved_reconcile")
    payload = [
        "native-gallery-launch-v1", output_id, job_id,
        f["Plan_SHA256"], f["Original_Manifest_SHA256"],
        claim_receipt["lease_owner"], claim_receipt["lease_fence"],
    ]
    payload_hash = hashlib.sha256(json.dumps(
        payload, separators=(",", ":")).encode()).hexdigest()
    request_body = {
        "action": "reserve_intent", "output_id": output_id,
        "job_id": job_id, "lease_owner": claim_receipt["lease_owner"],
        "lease_fence": claim_receipt["lease_fence"],
        "payload_hash": payload_hash,
    }
    sender = transport or _one_shot_post
    try:
        receipt = sender(
            origin + "/api/internal/native-gallery/reserve-launch",
            request_body,
            {"Content-Type": "application/json",
             "X-Native-Gallery-Job-Secret": shared_secret}, 20.0)
    except Exception as exc:
        raise NativeGalleryLaunchDenied(
            "native_gallery_launch_ambiguous_reconciliation_required") from exc
    if (not isinstance(receipt, dict) or receipt.get("ok") is not True or
            receipt.get("intent_verified") is not True or
            receipt.get("replay") is not False or
            receipt.get("may_generate") is not True or
            receipt.get("publication_authorized") is not False or
            receipt.get("job_id") != job_id or
            receipt.get("output_id") != output_id or
            receipt.get("lease_owner") != claim_receipt["lease_owner"] or
            receipt.get("lease_fence") != claim_receipt["lease_fence"]):
        deny("native_gallery_launch_receipt_unverified")
    return {"ok": True, "intent_reserved": True,
            "job_id": job_id, "output_id": output_id,
            "payload_hash": payload_hash, "may_generate": True,
            "publication_authorized": False}
