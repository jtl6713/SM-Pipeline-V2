"""Durable isolated Remotion launch: one reserved intent, one possible POST.

The outbox/lease authority MUST be supplied by an authenticated server adapter.
There is intentionally no direct Airtable output mutation here. If POST times
out or receipt readback fails, retain the launch intent and require reconciler
proof; never automatically invoke Remotion twice for the same attempt.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Callable
from urllib.parse import urlsplit

from rendering_review.isolated_render import (
    IsolatedRenderDenied, compile_isolated_render_payload,
)


class ReviewLaunchUnverified(RuntimeError):
    pass


def _fail(reason: str):
    raise ReviewLaunchUnverified(reason)


def _digest(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _verify_current_authority(snapshot: dict, job: dict):
    if (not isinstance(snapshot, dict) or
        snapshot.get("verified") is not True or
        snapshot.get("hold_active") is not True or
        snapshot.get("hold_owner_verified") is not True or
        snapshot.get("output_id") != job["output_id"] or
        snapshot.get("session_id") != job["session_id"] or
        snapshot.get("current_attempt_id") != job["attempt_id"] or
        snapshot.get("active_job_id") != job["job_id"] or
        snapshot.get("active_plan_hash") != job["plan_hash"] or
        snapshot.get("job_state") != "claimed" or
        snapshot.get("lease_fence") != job["lease_fence"] or
        snapshot.get("lease_owner") != job["lease_owner"] or
        snapshot.get("published") is True or
        snapshot.get("dispatch_started") is True or
        snapshot.get("unrelated_hold_released") is True):
        _fail("review_render_authority_changed")


def _status_url_for_renderer(value: str, renderer_base: str) -> bool:
    try:
        actual = urlsplit(value)
        base = urlsplit(renderer_base)
    except ValueError:
        return False
    return (
        actual.scheme == base.scheme and
        actual.netloc == base.netloc and
        actual.path.startswith("/status/") and
        bool(actual.path.removeprefix("/status/")) and
        not actual.username and not actual.password and
        not actual.query and not actual.fragment
    )


def launch_review_render_once(
    *, job: dict, plan: dict, source: dict, resolved_assets: list,
    voiceover: dict, watermark: dict, observed_source_segments: list | None,
    operations: Any, renderer: Any, renderer_base: str,
    source_mix: dict | None = None,
) -> dict:
    """Side-effect boundary invoked only by an authenticated outbox consumer.

    Operations are application-owned, not supplied by an HTTP body:
      read_authority(job_id): fresh durable Output+Review hold+job lease
      reserve_launch_intent(job_id, fence, hash): compare-and-set, ONE winner
      read_launch_intent(job_id): independent persisted readback
      persist_launch_receipt(job_id, fence, hash, remotion_job_id, status_url)
      read_launch_receipt(job_id): authoritative verified receipt
    """
    if not isinstance(job, dict) or not isinstance(job.get("lease_owner"), str) or not job["lease_owner"]:
        _fail("render_lease_owner_missing")
    for name in ("read_authority", "reserve_launch_intent", "read_launch_intent",
                 "persist_launch_receipt", "read_launch_receipt"):
        if not callable(getattr(operations, name, None)):
            _fail("render_launch_persistence_unavailable")
    if not all(callable(getattr(renderer, k, None)) for k in ("get_health", "post_render")):
        _fail("remotion_client_missing")
    try:
        payload = compile_isolated_render_payload(
            job=job, plan=plan, source=source,
            resolved_assets=resolved_assets, voiceover=voiceover,
            watermark=watermark, observed_source_segments=observed_source_segments,
            source_mix=source_mix,
        )
    except IsolatedRenderDenied as exc:
        _fail("render_inputs_not_verified:" + str(exc))
    payload_hash = _digest(payload)
    before = operations.read_authority(job["job_id"])
    _verify_current_authority(before, job)

    # RemotionClient.slot_busy() intentionally returns false on health error,
    # which is not safe enough for this pilot. Require a real health response.
    try:
        health = renderer.get_health()
        active = int(health.get("remotionActiveRenders"))
        capacity = int(health.get("remotionMaxConcurrent"))
    except Exception as exc:
        raise ReviewLaunchUnverified("remotion_capacity_unverified") from exc
    if capacity < 1 or active < 0 or active >= capacity:
        _fail("remotion_slot_not_available")

    # Durable, exact, atomic reservation before the irreversible /render POST.
    try:
        reservation = operations.reserve_launch_intent(
            job["job_id"], job["lease_fence"], payload_hash)
    except Exception as exc:
        raise ReviewLaunchUnverified("launch_intent_unverified") from exc
    intent = operations.read_launch_intent(job["job_id"])
    if (not isinstance(intent, dict) or intent.get("verified") is not True or
        intent.get("job_id") != job["job_id"] or
        intent.get("lease_fence") != job["lease_fence"] or
        intent.get("payload_hash") != payload_hash):
        _fail("launch_intent_readback_failed")
    if not isinstance(reservation, dict):
        _fail("launch_reservation_unverified")
    if reservation.get("created") is not True:
        return {
            "ok": False, "status": "reconciliation_required",
            "reason": "existing_render_launch_intent",
            "job_id": job["job_id"], "attempt_id": job["attempt_id"],
            "render_post_retried": False, "public_post_created": False,
        }
    if reservation.get("verified") is not True:
        _fail("launch_reservation_unverified")
    # A reviewer can cancel after the intent is reserved. That must not
    # launch new work. The intent stays durable for audited recovery.
    latest = operations.read_authority(job["job_id"])
    _verify_current_authority(latest, job)
    try:
        remote = renderer.post_render(payload)
    except Exception as exc:
        # A timeout may mean Remotion accepted the job. Do not try again.
        raise ReviewLaunchUnverified("remotion_launch_ambiguous_reconcile") from exc
    remotion_job_id = str(remote.get("jobId") or "").strip() if isinstance(remote, dict) else ""
    status_url = str(remote.get("statusUrl") or "").strip() if isinstance(remote, dict) else ""
    if not remotion_job_id or not _status_url_for_renderer(status_url, renderer_base):
        _fail("remotion_launch_receipt_untrusted")
    try:
        operations.persist_launch_receipt(
            job["job_id"], job["lease_fence"], payload_hash,
            remotion_job_id, status_url)
        receipt = operations.read_launch_receipt(job["job_id"])
    except Exception as exc:
        raise ReviewLaunchUnverified("remotion_receipt_persistence_unverified") from exc
    if (not isinstance(receipt, dict) or receipt.get("verified") is not True or
        receipt.get("job_id") != job["job_id"] or
        receipt.get("lease_fence") != job["lease_fence"] or
        receipt.get("payload_hash") != payload_hash or
        receipt.get("remotion_job_id") != remotion_job_id or
        receipt.get("status_url") != status_url):
        _fail("remotion_receipt_readback_mismatch")
    return {
        "ok": True, "status": "rendering",
        "job_id": job["job_id"], "attempt_id": job["attempt_id"],
        "remotion_job_id": remotion_job_id,
        "status_url": status_url,
        "payload_sha256": payload_hash,
        "public_post_created": False,
        "original_output_modified": False,
        "render_post_retried": False,
        "promotion_pending_validation": True,
    }
