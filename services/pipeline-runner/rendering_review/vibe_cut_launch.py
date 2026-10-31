"""One-shot, non-publishing Remotion launch for an owned music-only Vibe Cut.

The caller, never an HTTP body, supplies independently checked Airtable and
Google Drive evidence, the claimed job lease, and the existing protected Worker
launch ledger. A reserved intent can never authorize a second render POST.
"""
from __future__ import annotations

from rendering_review.vibe_cut_revision import (
    VibeRevisionDenied, compile_vibe_review_payload,
)
from rendering_review.isolated_launch import (
    ReviewLaunchUnverified, _verify_current_authority, _digest,
    _status_url_for_renderer,
)


def _fail(code):
    raise ReviewLaunchUnverified(code)


def launch_vibe_review_once(*, job, plan, source, music, watermark,
                            authorized_profiles, operations, renderer,
                            renderer_base):
    """Launch one frozen Vibe Cut plan. This does not upload, approve or publish.

    The same protected Worker lease/hold/launch-ledger contract used for
    narrated video is required here. The separate final MP4 validator and
    Drive upload/readback are required before the resulting attempt is ready.
    """
    if (not isinstance(job,dict) or
        not isinstance(job.get("lease_owner"),str) or
        not job["lease_owner"]):
        _fail("vibe_lease_owner_missing")
    needed=("read_authority","reserve_launch_intent","read_launch_intent",
            "persist_launch_receipt","read_launch_receipt")
    if not all(callable(getattr(operations,name,None)) for name in needed):
        _fail("vibe_launch_ledger_unavailable")
    if not all(callable(getattr(renderer,name,None))
               for name in ("get_health","post_render")):
        _fail("vibe_remotion_client_unavailable")
    try:
        payload=compile_vibe_review_payload(
            job=job,plan=plan,source=source,music=music,
            watermark=watermark,authorized_profiles=authorized_profiles,
        )
    except VibeRevisionDenied as exc:
        raise ReviewLaunchUnverified("vibe_inputs_not_verified:"+str(exc)) from exc
    payload_hash=_digest(payload)
    _verify_current_authority(operations.read_authority(job["job_id"]),job)
    try:
        health=renderer.get_health()
        active=int(health.get("remotionActiveRenders"))
        maximum=int(health.get("remotionMaxConcurrent"))
    except Exception as exc:
        raise ReviewLaunchUnverified("vibe_remotion_capacity_unverified") from exc
    if maximum<1 or active<0 or active>=maximum:
        _fail("vibe_remotion_slot_unavailable")
    # Durable write-once intent BEFORE calling the irreversible /render.
    try:
        reservation=operations.reserve_launch_intent(
            job["job_id"],job["lease_fence"],payload_hash)
        intent=operations.read_launch_intent(job["job_id"])
    except Exception as exc:
        raise ReviewLaunchUnverified("vibe_intent_ambiguous_reconcile") from exc
    if (not isinstance(intent,dict) or intent.get("verified") is not True or
        intent.get("job_id")!=job["job_id"] or
        intent.get("lease_fence")!=job["lease_fence"] or
        intent.get("payload_hash")!=payload_hash):
        _fail("vibe_intent_readback_unverified")
    if not isinstance(reservation,dict) or reservation.get("verified") is not True:
        _fail("vibe_intent_reservation_unverified")
    if reservation.get("created") is not True:
        return {"ok":False,"status":"reconciliation_required",
                "reason":"existing_vibe_launch_intent",
                "job_id":job["job_id"],"attempt_id":job["attempt_id"],
                "remotion_post_retried":False,"public_post_created":False}
    _verify_current_authority(operations.read_authority(job["job_id"]),job)
    try:
        response=renderer.post_render(payload)
    except Exception as exc:
        # This exception does not establish that the remote POST failed.
        raise ReviewLaunchUnverified("vibe_remotion_ambiguous_no_retry") from exc
    remote_id=str(response.get("jobId") or "") if isinstance(response,dict) else ""
    status_url=str(response.get("statusUrl") or "") if isinstance(response,dict) else ""
    if (not remote_id or
        not _status_url_for_renderer(status_url,renderer_base) or
        status_url!=renderer_base.rstrip("/")+"/status/"+remote_id):
        _fail("vibe_remotion_receipt_untrusted")
    try:
        operations.persist_launch_receipt(job["job_id"],job["lease_fence"],
            payload_hash,remote_id,status_url)
        receipt=operations.read_launch_receipt(job["job_id"])
    except Exception as exc:
        raise ReviewLaunchUnverified("vibe_receipt_ambiguous_reconcile") from exc
    if (not isinstance(receipt,dict) or receipt.get("verified") is not True or
        receipt.get("job_id")!=job["job_id"] or
        receipt.get("lease_fence")!=job["lease_fence"] or
        receipt.get("payload_hash")!=payload_hash or
        receipt.get("remotion_job_id")!=remote_id or
        receipt.get("status_url")!=status_url):
        _fail("vibe_receipt_readback_unverified")
    return {"ok":True,"status":"rendering","media_kind":"vibe_cut",
            "output_id":job["output_id"],"job_id":job["job_id"],
            "attempt_id":job["attempt_id"],
            "remotion_job_id":remote_id,"status_url":status_url,
            "payload_sha256":payload_hash,
            "expected_duration_seconds":payload["durationSeconds"],
            "aspect_ratio":plan["aspect_ratio"],
            "validation_required":True,
            "public_post_created":False,"original_output_modified":False,
            "remotion_post_retried":False}
