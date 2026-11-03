"""Fail-closed durable creative review transition for native gallery attempts.

This is a Runner-side contract, not a publishing route. Storage implements
authoritative read plus compare-and-set and readback. No in-memory success may
authorize Factory, MAE, or a provider post.
"""
from __future__ import annotations

import re

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
DECISIONS = {"accept", "reject"}


class GalleryReviewDenied(ValueError):
    pass


def transition_gallery_creative_review(*, output_id, profile_id, attempt_id,
                                       manifest_sha256, decision, actor_id,
                                       operations):
    """One exact-revision creative decision, independently of Factory approval.

    operations must provide read_attempt, cas_review and read_review. A replay
    may return an existing identical decision, never overwrite a changed one.
    """
    if (not REC.fullmatch(str(output_id or "")) or
            not REC.fullmatch(str(profile_id or "")) or
            not re.fullmatch(r"[A-Za-z0-9_-]{8,120}", str(attempt_id or "")) or
            not SHA.fullmatch(str(manifest_sha256 or "")) or
            decision not in DECISIONS or
            not isinstance(actor_id, str) or not actor_id.strip() or
            not all(callable(getattr(operations, n, None)) for n in
                    ("read_attempt", "cas_review", "read_review"))):
        raise GalleryReviewDenied("gallery_creative_review_invalid")
    attempt = operations.read_attempt(attempt_id)
    if (not isinstance(attempt, dict) or
            attempt.get("output_id") != output_id or
            attempt.get("profile_id") != profile_id or
            attempt.get("attempt_id") != attempt_id or
            attempt.get("manifest_sha256") != manifest_sha256 or
            attempt.get("state") != "ready_for_review" or
            attempt.get("drive_readback_verified") is not True or
            attempt.get("rights_verified") is not True or
            attempt.get("hold_active") is not True or
            attempt.get("factory_approved") is not False or
            attempt.get("published") is not False or
            type(attempt.get("version")) is not int or
            attempt["version"] < 1):
        raise GalleryReviewDenied("gallery_creative_artifact_not_verified")
    existing = operations.read_review(attempt_id)
    if existing is not None:
        if (existing.get("manifest_sha256") == manifest_sha256 and
                existing.get("decision") == decision and
                existing.get("actor_id") == actor_id and
                existing.get("output_id") == output_id):
            return {"ok": True, "replay": True, "decision": decision,
                    "attempt_id": attempt_id, "manifest_sha256": manifest_sha256,
                    "factory_approved": False, "publication_authorized": False}
        raise GalleryReviewDenied("gallery_creative_review_conflict")
    receipt = {"output_id": output_id, "profile_id": profile_id,
               "attempt_id": attempt_id, "manifest_sha256": manifest_sha256,
               "decision": decision, "actor_id": actor_id,
               "factory_approved": False, "publication_authorized": False}
    # CAS must be an authoritative atomic transition under the verified hold.
    if operations.cas_review(attempt_id, attempt["version"], receipt) is not True:
        raise GalleryReviewDenied("gallery_creative_review_cas_unverified")
    saved = operations.read_review(attempt_id)
    if saved != receipt:
        raise GalleryReviewDenied("gallery_creative_review_readback_failed")
    return {"ok": True, "replay": False, "decision": decision,
            "attempt_id": attempt_id, "manifest_sha256": manifest_sha256,
            "factory_approved": False, "publication_authorized": False}
