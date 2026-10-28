"""Fail-closed shared Worker claim before a new Chicago AP1-IG Graph container.

Disabled by default. No remote Instagram action is permitted when the
protected Worker claim is required and missing, unavailable, or ambiguous.
Other profiles and existing-container resumes keep their prior execution path.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from uuid import uuid4
from typing import Any, Callable

CHICAGO_PROFILE_ID = "recT2rbKX3MF7cVFU"
CONTENT_ITEMS_TABLE = "tblwzN9AXWvmKVKPs"
RECORD_RE = re.compile(r"rec[A-Za-z0-9]{14}\Z")


class ReviewDispatchClaimError(Exception):
    """A safe, non-Graph denial; do not mutate publishing state on failure."""


def shared_dispatch_claim_required() -> bool:
    return os.environ.get("RENDERING_REVIEW_IG_DISPATCH_CLAIM_REQUIRED", "").strip().lower() == "true"


def is_chicago_reel(client: Any, output: dict) -> bool:
    fields = output.get("fields") or {}
    if fields.get("Platform") != "Instagram" or fields.get("Platform_Output_Type") != "Instagram Reel":
        raise ReviewDispatchClaimError("publisher_output_scope_unverified")
    links = fields.get("Content_Item")
    if not isinstance(links, list) or len(links) != 1 or not isinstance(links[0], str) or not RECORD_RE.fullmatch(links[0]):
        raise ReviewDispatchClaimError("publisher_content_identity_unverified")
    try:
        content = client.get_record(CONTENT_ITEMS_TABLE, links[0])
    except Exception as exc:
        raise ReviewDispatchClaimError("publisher_content_authority_unavailable") from exc
    profiles = (content.get("fields") or {}).get("Content_Profile")
    if content.get("id") != links[0] or not isinstance(profiles, list) or len(profiles) != 1 or not isinstance(profiles[0], str) or not RECORD_RE.fullmatch(profiles[0]):
        raise ReviewDispatchClaimError("publisher_profile_identity_unverified")
    return profiles[0] == CHICAGO_PROFILE_ID


def claim_chicago_dispatch(output: dict, *, post: Callable | None = None) -> dict:
    """Claim is a Worker-held R2/Airtable transaction, not a Python Airtable check.

    An HTTP timeout can be ambiguous: caller MUST abort rather than retry Graph.
    """
    worker_url = os.environ.get("STUDIO_RENDER_REVIEW_WORKER_URL", "").strip().rstrip("/")
    secret = os.environ.get("RENDERING_REVIEW_DISPATCH_SHARED_SECRET", "").strip()
    if not worker_url.startswith("https://") or len(secret) < 24:
        raise ReviewDispatchClaimError("publisher_shared_claim_unconfigured")
    fields = output.get("fields") or {}
    output_id = str(output.get("id") or "")
    if not RECORD_RE.fullmatch(output_id):
        raise ReviewDispatchClaimError("publisher_output_identity_invalid")
    request_id = "ap1ig_" + uuid4().hex
    payload = {
        "output_id": output_id,
        "expected_publish_asset_url": str(fields.get("Publish_Asset_URL") or ""),
        "expected_final_file_id": str(fields.get("Final_File_ID") or ""),
        "client_request_id": request_id,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Review-Dispatch-Token": secret,
    }
    for source,header in (
        ("CF_ACCESS_CLIENT_ID", "CF-Access-Client-Id"),
        ("CF_ACCESS_CLIENT_SECRET", "CF-Access-Client-Secret"),
    ):
        if os.environ.get(source):
            headers[header] = os.environ[source]
    def transport() -> dict:
        req = urllib.request.Request(
            worker_url + "/internal/rendering-review/ig-dispatch-claim",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers, method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                raise ReviewDispatchClaimError("publisher_claim_http_rejected")
            return json.loads(resp.read(4096).decode("utf-8"))
    try:
        receipt = post(payload, headers) if post is not None else transport()
    except Exception as exc:
        raise ReviewDispatchClaimError("publisher_shared_claim_unverified") from exc
    if (not isinstance(receipt, dict) or receipt.get("ok") is not True or
        receipt.get("output_id") != output_id or
        receipt.get("owner") != "AP1-IG" or
        receipt.get("claim_id") != request_id or
        receipt.get("review_hold_active") is not False or
        receipt.get("remote_media_created") is not False or
        not receipt.get("publish_started_at")):
        raise ReviewDispatchClaimError("publisher_shared_claim_bad_receipt")
    return receipt
