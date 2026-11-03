"""One-shot, default-disabled native gallery Runner -> Worker job claim.

Reads only native gallery canonical Airtable job records. Never writes Airtable,
renders, uploads, releases publication holds or publishes. Ambiguous POSTs
require reconciliation and must not be automatically retried.
"""
from __future__ import annotations

import hashlib
import os
import re

from rendering_review.outbox_claim import _one_shot_post
from rendering_review.remote_ledger import _validate_base

JOBS = "tbl5sq9xBrF6bgPph"
REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
FIELDS = ["Job_ID", "Output_Record_ID", "Content_Item_Record_ID",
          "Profile_Record_ID", "Actor_Record_ID", "Job_State",
          "Original_Manifest_SHA256", "Plan_SHA256", "Hold_ID",
          "Hold_Owner", "Lease_Owner", "Lease_Fence", "Row_Version"]


class NativeGalleryClaimDenied(RuntimeError):
    pass


def deny(reason):
    raise NativeGalleryClaimDenied(reason)


def candidates(client, *, limit=3):
    if type(limit) is not int or not 1 <= limit <= 3:
        deny("native_gallery_scan_unbounded")
    rows = client.list_records(JOBS, formula='{Job_State}="held_queued"',
                               max_records=limit, fields=FIELDS)
    if not isinstance(rows, list) or len(rows) > limit:
        deny("native_gallery_queue_read_unverified")
    result = []
    seen = set()
    for row in rows:
        f = row.get("fields") if isinstance(row, dict) else None
        if (not isinstance(f, dict) or
                not REC.fullmatch(str(row.get("id") or "")) or
                not all(REC.fullmatch(str(f.get(k) or "")) for k in
                        ("Output_Record_ID", "Content_Item_Record_ID",
                         "Profile_Record_ID", "Actor_Record_ID")) or
                not all(TOKEN.fullmatch(str(f.get(k) or "")) for k in
                        ("Job_ID", "Hold_ID", "Hold_Owner")) or
                not all(SHA.fullmatch(str(f.get(k) or "")) for k in
                        ("Original_Manifest_SHA256", "Plan_SHA256")) or
                f.get("Job_State") != "held_queued" or
                f.get("Lease_Owner") or f.get("Lease_Fence") not in (None, 0) or
                f.get("Row_Version") != 1 or f.get("Job_ID") in seen):
            deny("native_gallery_queued_job_identity_invalid")
        seen.add(f["Job_ID"])
        result.append({"job_id": f["Job_ID"],
                       "output_id": f["Output_Record_ID"]})
    return result


def claim_one_native_gallery_job(*, client, worker_base, shared_secret,
                                 consumer_identity, transport=None):
    if os.environ.get("NATIVE_GALLERY_RUNNER_CLAIM_ENABLED") != "true":
        deny("native_gallery_runner_claim_disabled")
    if (not TOKEN.fullmatch(str(consumer_identity or "")) or
            not isinstance(shared_secret, str) or len(shared_secret) < 24):
        deny("native_gallery_claim_credentials_invalid")
    try:
        base = _validate_base(worker_base)
    except Exception as exc:
        raise NativeGalleryClaimDenied("native_gallery_worker_origin_invalid") from exc
    items = candidates(client)
    if not items:
        return {"ok": True, "claimed": False, "status": "no_queued_job",
                "render_started": False, "publication_authorized": False}
    selected = items[0]
    stable = "ngclaim_" + hashlib.sha256((
        "native-gallery-claim-v1|" + consumer_identity + "|" +
        selected["output_id"] + "|" + selected["job_id"]
    ).encode()).hexdigest()[:48]
    sender = transport or _one_shot_post
    try:
        receipt = sender(
            base + "/api/internal/native-gallery/claim-job",
            {"output_id": selected["output_id"],
             "job_id": selected["job_id"],
             "client_request_id": stable},
            {"Content-Type": "application/json",
             "X-Native-Gallery-Job-Secret": shared_secret}, 15.0)
    except Exception as exc:
        raise NativeGalleryClaimDenied(
            "native_gallery_claim_ambiguous_reconciliation_required") from exc
    if (not isinstance(receipt, dict) or receipt.get("ok") is not True or
            receipt.get("job_id") != selected["job_id"] or
            receipt.get("output_id") != selected["output_id"] or
            receipt.get("lease_verified") is not True or
            not TOKEN.fullmatch(str(receipt.get("lease_owner") or "")) or
            type(receipt.get("lease_fence")) is not int or
            receipt["lease_fence"] < 1 or
            receipt.get("render_started") is not False or
            receipt.get("publication_authorized") is not False):
        deny("native_gallery_claim_receipt_unverified")
    return {"ok": True, "claimed": True, "status": "claimed",
            "receipt": receipt, "render_started": False,
            "publication_authorized": False}
