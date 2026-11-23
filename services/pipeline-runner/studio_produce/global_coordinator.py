"""Incident #2670: cross-host Supabase atomic admission client.

OFF unless STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED=true. The SQL migration
must exist and be verified on BOTH the Studio Worker and Windows Runner before
any production caller enables this. A failed/ambiguous RPC is NOT admission.
Never use this per-row or for an unconditional high-frequency poll.
"""
from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from typing import Any

import requests

_SCOPES = frozenset({"producer", "idea_generation", "native_gallery", "rendering_review"})
_SHA = re.compile(r"[a-f0-9]{64}\Z")
_URL = re.compile(r"https://[a-z0-9.-]+\.supabase\.co\Z", re.I)
_REASONS = frozenset({"overload", "timeout", "http_429", "http_5xx"})


class GlobalAdmissionUnavailable(RuntimeError):
    """No safe cross-host lease was verified. Keep canonical work queued."""


@dataclass(frozen=True)
class GlobalClaim:
    accepted: bool
    scope: str
    claim_key: str
    fence: str
    replay: bool = False
    reason: str = ""


def enabled() -> bool:
    return os.environ.get("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "").strip() == "true"


def claim_key(identity: str) -> str:
    if not isinstance(identity, str) or len(identity.strip()) < 12 or len(identity) > 1024:
        raise ValueError("global_workload_identity_invalid")
    return hashlib.sha256(("sm-pipeline-v2-global-2670|" + identity).encode()).hexdigest()


def _settings(settings: dict[str, Any] | None) -> tuple[str, str]:
    from config import load_settings
    cfg = settings if settings is not None else load_settings()
    base = str(cfg.get("supabase_url") or "").strip().rstrip("/")
    key = str(cfg.get("supabase_service_role_key") or "").strip()
    if not _URL.fullmatch(base) or len(key) < 32:
        raise GlobalAdmissionUnavailable("global_workload_authority_unavailable")
    return base, key


def _rpc(
    action: str, payload: dict, *, settings: dict | None = None,
    sender=None,
):
    base, secret = _settings(settings)
    sender = sender or requests.post
    try:
        response = sender(
            base + "/rest/v1/rpc/studio_global_workload_" + action,
            json=payload, headers={
                "apikey": secret, "Authorization": "Bearer " + secret,
                "Content-Type": "application/json",
            }, timeout=6, allow_redirects=False,
        )
    except (requests.RequestException, OSError) as exc:
        raise GlobalAdmissionUnavailable("global_workload_rpc_unconfirmed") from exc
    if response.status_code != 200:
        raise GlobalAdmissionUnavailable("global_workload_rpc_rejected")
    try:
        return response.json()
    except (ValueError, TypeError) as exc:
        raise GlobalAdmissionUnavailable("global_workload_rpc_receipt_invalid") from exc


def acquire(scope: str, identity: str, *, ttl_seconds: int = 600,
            settings: dict | None = None, sender=None) -> GlobalClaim:
    if not enabled():
        raise GlobalAdmissionUnavailable("global_workload_not_enabled")
    if scope not in _SCOPES or type(ttl_seconds) is not int or not 60 <= ttl_seconds <= 1800:
        raise GlobalAdmissionUnavailable("global_workload_request_invalid")
    key = claim_key(identity)
    if not _SHA.fullmatch(key):
        raise GlobalAdmissionUnavailable("global_workload_claim_hash_invalid")
    fence = str(uuid.uuid4())
    result = _rpc("acquire", {
        "p_scope": scope, "p_claim_key": key,
        "p_fence": fence, "p_ttl_seconds": ttl_seconds,
    }, settings=settings, sender=sender)
    if not isinstance(result, dict) or type(result.get("accepted")) is not bool:
        raise GlobalAdmissionUnavailable("global_workload_acquire_receipt_invalid")
    return GlobalClaim(result["accepted"], scope, key, fence,
                       result.get("replay") is True, str(result.get("reason") or "")[:64])


def renew(claim: GlobalClaim, *, ttl_seconds: int = 600,
          settings: dict | None = None, sender=None) -> bool:
    if not isinstance(claim, GlobalClaim) or not claim.accepted:
        raise GlobalAdmissionUnavailable("global_workload_missing_owner")
    if not 60 <= ttl_seconds <= 1800:
        raise GlobalAdmissionUnavailable("global_workload_invalid_ttl")
    result = _rpc("renew", {
        "p_scope": claim.scope, "p_claim_key": claim.claim_key,
        "p_fence": claim.fence, "p_ttl_seconds": ttl_seconds,
    }, settings=settings, sender=sender)
    if type(result) is not bool:
        raise GlobalAdmissionUnavailable("global_workload_renew_receipt_invalid")
    return result


def release(claim: GlobalClaim, *, verified_progress: bool = False,
            settings: dict | None = None, sender=None) -> bool:
    if not isinstance(claim, GlobalClaim) or not claim.accepted:
        raise GlobalAdmissionUnavailable("global_workload_missing_owner")
    result = _rpc("release", {
        "p_scope": claim.scope, "p_claim_key": claim.claim_key,
        "p_fence": claim.fence, "p_verified_progress": verified_progress is True,
    }, settings=settings, sender=sender)
    if type(result) is not bool:
        raise GlobalAdmissionUnavailable("global_workload_release_receipt_invalid")
    return result


def trip(reason: str, *, cooldown_seconds: int = 90,
         settings: dict | None = None, sender=None) -> bool:
    if reason not in _REASONS or not 60 <= cooldown_seconds <= 600:
        raise GlobalAdmissionUnavailable("global_workload_trip_parameters_invalid")
    if not enabled():
        raise GlobalAdmissionUnavailable("global_workload_not_enabled")
    result = _rpc("trip", {
        "p_reason": reason, "p_cooldown_seconds": cooldown_seconds,
    }, settings=settings, sender=sender)
    if type(result) is not bool:
        raise GlobalAdmissionUnavailable("global_workload_trip_receipt_invalid")
    return result
