"""Bounded, OFF-by-default Runner claim for queued Chicago review jobs.

This first outbox stage scans only the dedicated review Job table and sends
one guarded claim to the canonical Worker owner. The Worker independently
rechecks the review session, hold, original Platform Output and per-output lock.
This module cannot launch Remotion, change an attempt, schedule or publish.
An ambiguous claim response is NOT automatically retried.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Callable
from urllib.request import Request, build_opener

from rendering_review.remote_ledger import _NoRedirect, _validate_base

REVIEW_JOBS = "tblUkZB6SMtf9Ib6I"
RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
FIELDS = ["Job_ID", "Session_ID", "Output_Record_ID", "Attempt_ID",
          "Plan_Hash", "Job_State", "Lease_Owner", "Lease_Fence"]


class ReviewOutboxClaimDenied(RuntimeError):
    pass


def _deny(reason: str):
    raise ReviewOutboxClaimDenied(reason)


def _one_shot_post(url: str, body: dict, headers: dict, timeout: float) -> dict:
    req = Request(url, data=json.dumps(body, separators=(",", ":")).encode(),
                  headers=headers, method="POST")
    with build_opener(_NoRedirect).open(req, timeout=timeout) as response:
        if response.status != 200:
            _deny("review_claim_http_not_verified")
        raw = response.read(8193)
    if len(raw) > 8192:
        _deny("review_claim_response_too_large")
    return json.loads(raw)


def queued_candidates(client: Any, *, limit: int = 3) -> list[dict]:
    """Read at most three queued review Jobs. Never scan the ordinary R4 queue."""
    if type(limit) is not int or limit < 1 or limit > 3:
        _deny("review_claim_scan_limit_invalid")
    rows = client.list_records(
        REVIEW_JOBS, formula='{Job_State}="queued"',
        max_records=limit, fields=FIELDS,
    )
    if not isinstance(rows, list) or len(rows) > limit:
        _deny("review_claim_airtable_page_unverified")
    result = []
    seen = set()
    for row in rows:
        f = row.get("fields") if isinstance(row, dict) else None
        if not isinstance(f, dict):
            _deny("review_claim_row_invalid")
        job_id = f.get("Job_ID")
        output_id = f.get("Output_Record_ID")
        if (not RECORD.fullmatch(str(row.get("id") or "")) or
            not RECORD.fullmatch(str(output_id or "")) or
            not all(TOKEN.fullmatch(str(f.get(k) or "")) for k in
                    ("Job_ID", "Session_ID", "Attempt_ID")) or
            not HASH.fullmatch(str(f.get("Plan_Hash") or "")) or
            f.get("Job_State") != "queued" or f.get("Lease_Owner") or
            f.get("Lease_Fence") not in (None, 0)):
            _deny("review_claim_job_identity_unverified")
        if job_id in seen:
            _deny("review_claim_duplicate_job_identity")
        seen.add(job_id)
        result.append({"job_id": job_id, "output_id": output_id,
                       "attempt_id": f["Attempt_ID"],
                       "session_id": f["Session_ID"],
                       "plan_hash": f["Plan_Hash"]})
    return result


def claim_one_review_job(*, client: Any, worker_base: str,
                         shared_secret: str, consumer_identity: str,
                         transport: Callable[..., dict] | None = None,
                         timeout_seconds: float = 10.0) -> dict:
    """Claim ONE queued job, then stop. No render/post/automatic re-claim.

    Runner deployment must separately enable RENDERING_REVIEW_OUTBOX_CLAIM_ENABLED;
    the protected Worker claim endpoint has its own independent rollout gates.
    """
    if os.environ.get("RENDERING_REVIEW_OUTBOX_CLAIM_ENABLED") != "true":
        _deny("review_outbox_claim_disabled")
    if not TOKEN.fullmatch(str(consumer_identity or "")) or not isinstance(
        shared_secret, str
    ) or len(shared_secret) < 24:
        _deny("review_claim_server_identity_unverified")
    if (isinstance(timeout_seconds, bool) or
        not isinstance(timeout_seconds, (float, int)) or
        not (1 <= timeout_seconds <= 30)):
        _deny("review_claim_timeout_invalid")
    try:
        origin = _validate_base(worker_base)
    except Exception as exc:
        raise ReviewOutboxClaimDenied("review_claim_origin_invalid") from exc

    candidates = queued_candidates(client)
    if not candidates:
        return {"ok": True, "status": "no_queued_job",
                "claimed": False, "render_started": False,
                "public_post_created": False}
    selected = candidates[0]
    stable_request_id = "rrclaim_" + hashlib.sha256(
        ("review-claim-v1|" + consumer_identity + "|" +
         selected["output_id"] + "|" + selected["job_id"]).encode()
    ).hexdigest()[:48]
    body = {"output_id": selected["output_id"],
            "job_id": selected["job_id"],
            "client_request_id": stable_request_id}
    sender = transport or _one_shot_post
    try:
        receipt = sender(
            origin + "/api/internal/rendering-review/claim-render-job",
            body, {"Content-Type": "application/json",
                   "X-Rendering-Review-Job-Secret": shared_secret},
            float(timeout_seconds),
        )
    except Exception as exc:
        # The remote Worker may already have durably claimed this Job.
        # An operator must reconcile; do not assume that the request failed.
        raise ReviewOutboxClaimDenied(
            "review_claim_ambiguous_reconciliation_required"
        ) from exc
    if (not isinstance(receipt, dict) or receipt.get("ok") is not True or
        receipt.get("lease_verified") is not True or
        receipt.get("output_id") != selected["output_id"] or
        receipt.get("job_id") != selected["job_id"] or
        receipt.get("session_id") != selected["session_id"] or
        receipt.get("attempt_id") != selected["attempt_id"] or
        receipt.get("plan_hash") != selected["plan_hash"] or
        not TOKEN.fullmatch(str(receipt.get("lease_owner") or "")) or
        type(receipt.get("lease_fence")) is not int or
        receipt["lease_fence"] < 1 or
        receipt.get("render_started") is not False or
        receipt.get("public_post_created") is not False):
        _deny("review_claim_receipt_identity_unverified")
    return {"ok": True, "status": "claimed", "claimed": True,
            "receipt": receipt, "render_started": False,
            "public_post_created": False}
