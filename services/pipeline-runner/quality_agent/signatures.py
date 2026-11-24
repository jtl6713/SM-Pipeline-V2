from __future__ import annotations

from typing import Any


TIKTOK_DUPLICATE_SLIDES = "QA-TT-DUPLICATE-SLIDES"
PROMOTED_PROFILE_DRIFT = "QA-PROMOTED-PROFILE-DRIFT"


def _clean_ids(values: list[str] | tuple[str, ...] | set[str] | None) -> list[str]:
    return [str(value or "").strip() for value in (values or []) if str(value or "").strip()]


def detect_tiktok_duplicate_slides(
    *,
    actual: int,
    expected: int | None,
    stamped_urls: list[str] | None = None,
) -> dict[str, Any] | None:
    """Recognize the Output 997 duplicate-carousel signature.

    Signature:
    - TikTok photo package expects N approved images.
    - Ready Carousel Slide rows linked to the output total exactly 2*N.
    - The stamped output package still contains exactly N authoritative images.

    The stamped manifest requirement makes automatic recovery conservative: a
    doubled database link set alone is not enough to guess which assets belong.
    """
    try:
        actual_n = int(actual)
        expected_n = int(expected) if expected is not None else 0
    except (TypeError, ValueError):
        return None

    urls = [str(url or "").strip() for url in (stamped_urls or []) if str(url or "").strip()]
    if expected_n <= 0 or actual_n != expected_n * 2 or len(urls) != expected_n:
        return None

    return {
        "id": TIKTOK_DUPLICATE_SLIDES,
        "platform": "TikTok",
        "stage": "TTD0_ASSETS",
        "actual_ready_slides": actual_n,
        "expected_slides": expected_n,
        "duplicate_factor": 2,
        "authoritative_manifest_count": len(urls),
        "auto_repair_safe": True,
    }


def detect_promoted_profile_drift(
    *,
    candidate_status: str,
    promoted_content_record_id: str | None,
    authoritative_asset_profile_ids: list[str] | None,
    candidate_profile_ids: list[str] | None = None,
    content_profile_ids: list[str] | None = None,
    production_brand_ids: list[str] | None = None,
    production_output_brand_ids: list[str] | None = None,
    profile_to_brand: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    """Recognize a promoted item that was attached to the wrong city/profile.

    This is deliberately conservative because changing profile ownership is a
    cross-record repair. Automatic recovery is allowed only when:
    - the Idea Candidate is already Promoted and has a promoted Content Item;
    - every authoritative selected media asset points to the same Content Profile;
    - that unanimous media profile disagrees with at least one promoted-chain
      profile/brand field.

    This matches the Lower East Side incident: the candidate/content/production
    chain was Chicago while all seven selected source assets were NYC.
    """
    status = str(candidate_status or "").strip().casefold()
    promoted_id = str(promoted_content_record_id or "").strip()
    if status != "promoted" or not promoted_id.startswith("rec"):
        return None

    asset_profiles = _clean_ids(authoritative_asset_profile_ids)
    canonical_profiles = sorted(set(asset_profiles))
    if len(canonical_profiles) != 1:
        # Missing or mixed source ownership is not enough evidence to move a
        # promoted item between city profiles automatically.
        return None

    canonical_profile_id = canonical_profiles[0]
    candidate_profiles = sorted(set(_clean_ids(candidate_profile_ids)))
    content_profiles = sorted(set(_clean_ids(content_profile_ids)))
    request_brands = sorted(set(_clean_ids(production_brand_ids)))
    output_brands = sorted(set(_clean_ids(production_output_brand_ids)))

    expected_brand_id = str((profile_to_brand or {}).get(canonical_profile_id) or "").strip()

    mismatches: list[str] = []
    if candidate_profiles and candidate_profiles != [canonical_profile_id]:
        mismatches.append("Idea Candidate.Content_Profile")
    if content_profiles and content_profiles != [canonical_profile_id]:
        mismatches.append("Content Item.Content_Profile")
    if expected_brand_id and request_brands and request_brands != [expected_brand_id]:
        mismatches.append("Production Request.Brand")
    if expected_brand_id and output_brands and output_brands != [expected_brand_id]:
        mismatches.append("Production Request Outputs.Brand")

    if not mismatches:
        return None

    repair: dict[str, Any] = {
        "Idea Candidate.Content_Profile": [canonical_profile_id],
        "Content Item.Content_Profile": [canonical_profile_id],
        "Platform Outputs": "lookup-derived from Content Item; verify propagation after repair",
    }
    if expected_brand_id:
        repair["Production Request.Brand"] = [expected_brand_id]
        repair["Production Request Outputs.Brand"] = [expected_brand_id]

    return {
        "id": PROMOTED_PROFILE_DRIFT,
        "stage": "PROMOTION_PROFILE",
        "promoted_content_record_id": promoted_id,
        "canonical_profile_id": canonical_profile_id,
        "authoritative_asset_count": len(asset_profiles),
        "authoritative_asset_profile_count": 1,
        "expected_brand_id": expected_brand_id or None,
        "mismatches": mismatches,
        "repair": repair,
        "verify_after_repair": [
            "Platform Outputs.Content_Profile",
            "Platform Outputs.Market_Name",
        ],
        "auto_repair_safe": True,
    }

IG_STALE_UPLOAD = "QA-IG-STALE-UPLOAD"
IG_STALE_LOCK_SECONDS = 30 * 60


def detect_ig_stale_upload(
    row: dict[str, Any],
    *,
    now_utc: str,
    runner_heartbeat_utc: str | None = None,
    runner_lease_expires_utc: str | None = None,
    threshold_seconds: int = IG_STALE_LOCK_SECONDS,
) -> dict[str, Any] | None:
    """Classify an orphaned AP1-IG lock; do not mutate or claim provider success.

    The coordinator must independently verify lease ownership and remote identity
    before executing any suggested recovery. Unknown heartbeat/lease is unsafe.
    """
    from datetime import datetime, timezone

    def parse(value: object) -> datetime | None:
        if not value:
            return None
        try:
            result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return result.astimezone(timezone.utc) if result.tzinfo else None
        except (ValueError, TypeError):
            return None

    fields = row.get("fields", row)
    get = lambda name: fields.get(name)
    if (
        str(get("Platform") or "").lower() != "instagram"
        or str(get("Platform_Output_Type") or "").lower() != "instagram reel"
        or str(get("Publish_Status") or "") != "Publishing"
        or str(get("Publish_Locked_By") or "") != "AP1-IG"
        or str(get("Review_Status") or "") != "Approved"
        or str(get("Output_Status") or "") != "Approved for Publishing"
        or str(get("Publish_Method") or "") != "Automated"
        or get("Auto_Publish_Enabled") is not True
        or get("Do_Not_Publish") is True
        or any(get(name) for name in (
            "Test_Run_ID", "Replace_Transaction_ID", "Published_At",
            "Studio_Render_Review_Hold_Active", "Studio_Render_Review_Hold_ID",
            "Studio_Render_Review_Hold_Owner", "Studio_Review_Hold_ID",
            "Studio_Review_Hold_Owner", "Studio_Render_Review_Session_ID",
        ))
    ):
        return None
    now = parse(now_utc)
    locked = parse(get("Publish_Locked_At"))
    attempted = parse(get("Last_Publish_Attempt_At"))
    if not now or not locked or not attempted:
        return None
    age = (now - max(locked, attempted)).total_seconds()
    if age < max(60, threshold_seconds):
        return None
    cooldown = parse(get("Publish_Next_Retry_At"))
    if cooldown and cooldown > now:
        return None
    heartbeat = parse(runner_heartbeat_utc)
    lease = parse(runner_lease_expires_utc)
    if (heartbeat and (now - heartbeat).total_seconds() < max(60, threshold_seconds)
            or lease and lease > now):
        return None

    remote = bool(get("Platform_Post_ID") or get("Platform_Post_URL")
                  or get("Platform_Media_ID"))
    # No provider identifiers is NOT proof that a Graph create never happened.
    # Provider reconciliation is mandatory before releasing the exact lock.
    return {
        "id": IG_STALE_UPLOAD,
        "record_id": row.get("id"),
        "output_id": get("Output_ID"),
        "stage": "AP1-IG",
        "age_seconds": int(age),
        "remote_identity_saved": remote,
        "action": "verify_existing_provider_post" if remote else "reconcile_before_requeue",
        "heartbeat_observed": heartbeat is not None,
        "lease_observed": lease is not None,
        "auto_repair_safe": False,
        "requires": [
            "fresh_authoritative_readback", "independent_runner_lease_probe",
            "provider_identity_reconciliation", "exact_output_fencing",
            "MAE_atomic_reservation", "append_only_recovery_audit",
        ],
    }


def reconcile_ig_stale_upload(
    row: dict[str, Any],
    *,
    now_utc: str,
    read_authoritative,
    inspect_runner,
    inspect_provider,
    append_audit,
    recover_under_fence,
    threshold_seconds: int = IG_STALE_LOCK_SECONDS,
) -> dict[str, Any]:
    """Guarded orchestration seam; all side effects are injected and fail closed.

    The recovery adapter MUST own the atomic per-output fencing and MAE
    reservation transaction. This function does not publish or guess remote
    identity. No direct Airtable patch is authorized by classification alone.
    """
    record_id = row.get("id")
    audit = {"signature": IG_STALE_UPLOAD, "record_id": record_id,
             "outcome": "blocked", "at": now_utc}
    def conclude(reason: str, *, action: str = "needs_eyes") -> dict[str, Any]:
        event = {**audit, "reason": reason, "action": action}
        append_audit(event)  # Audit failure must prevent any subsequent mutation.
        return event

    fresh = read_authoritative(record_id)
    if not fresh or fresh.get("id") != record_id:
        return conclude("authoritative_identity_unavailable")
    keys = ("Output_ID", "Publish_Locked_By", "Publish_Locked_At",
            "Last_Publish_Attempt_At", "Platform_Media_ID", "Platform_Post_ID",
            "Platform_Post_URL", "Published_At", "Review_Status",
            "Do_Not_Publish", "Publish_Status", "Scheduled_Post_Date")
    previous = row.get("fields", row)
    current = fresh.get("fields", fresh)
    if any(previous.get(key) != current.get(key) for key in keys):
        return conclude("authoritative_snapshot_changed", action="rescan")
    runner = inspect_runner(fresh)
    if not isinstance(runner, dict) or runner.get("verified") is not True:
        return conclude("runner_lease_probe_unavailable")
    detection = detect_ig_stale_upload(
        fresh, now_utc=now_utc,
        runner_heartbeat_utc=runner.get("heartbeat_utc"),
        runner_lease_expires_utc=runner.get("lease_expires_utc"),
        threshold_seconds=threshold_seconds,
    )
    if not detection:
        return conclude("stale_signature_no_longer_matches", action="rescan")
    if runner.get("active") is not False or runner.get("owner_fenceable") is not True:
        return conclude("runner_live_or_fence_unknown")
    provider = inspect_provider(fresh)
    if not isinstance(provider, dict) or provider.get("verified") is not True:
        return conclude("provider_identity_unverified")
    state = provider.get("state")
    if state in ("published", "processing", "ambiguous"):
        return conclude("provider_" + state, action=(
            "finalize_existing" if state == "published" else
            "resume_saved_container" if state == "processing" else "needs_eyes"
        ))
    if state != "conclusively_absent":
        return conclude("unrecognized_provider_state")
    if provider.get("identity_match") is not True:
        return conclude("provider_attribution_unverified")
    # Write audit intent BEFORE any mutation; no recovery if audit is unavailable.
    intent = {**audit, "outcome": "authorized_intent",
              "action": "fenced_atomic_mae_reschedule",
              "previous_lock": current.get("Publish_Locked_By"),
              "previous_scheduled_at": current.get("Scheduled_Post_Date"),
              "duplicate_possible": True}
    append_audit(intent)
    # Adapter must atomically fence exact identity, release lock, and commit a
    # MAE reservation. No external publishing is performed on this invocation.
    result = recover_under_fence(fresh, expected=keys,
                                 provider_evidence=provider,
                                 audit_intent=intent)
    if not isinstance(result, dict) or result.get("committed") is not True:
        return conclude("atomic_recovery_not_confirmed", action="reconcile")
    event = {**intent, "outcome": "rescheduled",
             "new_scheduled_at": result.get("scheduled_at"),
             "reservation_id": result.get("reservation_id")}
    append_audit(event)
    return event


STALLED_PENDING_CROPS = "QA-PRODUCTION-STALLED-PENDING-CROPS-v1"
CREATIVE_IMAGE_ADVISORY = "QA-CREATIVE-IMAGE-ADVISORY-v1"
PENDING_CROP_STALL_SECONDS = 30 * 60


def detect_stalled_pending_crops(
    *, request_id: str, request_status: str, master_status: str,
    plan_status: str, master_count: int, confirmed_master_count: int,
    ready_crops: int, target_crops: int, pending_crops: int,
    pending_attempted_count: int, last_pending_change_utc: str,
    now_utc: str, test_run_id: str | None = None,
    threshold_seconds: int = PENDING_CROP_STALL_SECONDS,
) -> dict[str, Any] | None:
    """Classify a stalled exact-request crop queue, not a failed photo upload.

    Counts must come from the same canonical request, current plan revision,
    and unique linked transfers. A detector result never grants write authority.
    Use actual transfer timestamps, not a regenerated manifest timestamp.
    """
    from datetime import datetime

    if not request_id.startswith("rec") or test_run_id:
        return None
    if request_status not in {"Draft", "Ready", "Promoted"}:
        return None
    if master_status != "Ready" or plan_status != "Ready":
        return None
    counts = (master_count, confirmed_master_count, ready_crops, target_crops,
              pending_crops, pending_attempted_count)
    if any(type(n) is not int or n < 0 for n in counts):
        return None
    if not (master_count > 0 and confirmed_master_count == master_count
            and target_crops > ready_crops and pending_crops == target_crops - ready_crops
            and pending_attempted_count == 0):
        return None
    try:
        last = datetime.fromisoformat(last_pending_change_utc.replace("Z", "+00:00"))
        now = datetime.fromisoformat(now_utc.replace("Z", "+00:00"))
        if last.tzinfo is None or now.tzinfo is None:
            return None
        age = (now - last).total_seconds()
    except (AttributeError, TypeError, ValueError):
        return None
    if age < max(60, threshold_seconds):
        return None
    return {
        "id": STALLED_PENDING_CROPS,
        "stage": "SMV1_PLATFORM_VARIANTS",
        "record_id": request_id,
        "confirmed_originals": confirmed_master_count,
        "ready_crops": ready_crops,
        "target_crops": target_crops,
        "pending_unattempted_crops": pending_crops,
        "age_seconds": int(age),
        "action": "verify_and_drain_exact_existing_crop_queue",
        "auto_repair_safe": False,
        "requires": [
            "fresh_exact_request_plan_and_transfer_identity",
            "no_live_or_ambiguous_transfer_claim",
            "governor_and_database_admission",
            "bounded_existing_smv1_drain",
            "canonical_variant_readback",
        ],
    }


def creative_image_advisory(*, evidence: list[str] | None) -> dict[str, Any] | None:
    """Creative suspicion is a human-review note, not an approval gate.

    This does not clear an existing independent hold or certify missing bytes,
    rights, tenant identity or technical package integrity.
    """
    notes = list(dict.fromkeys(_clean_ids(evidence)))[:20]
    if not notes:
        return None
    return {
        "id": CREATIVE_IMAGE_ADVISORY,
        "severity": "warning",
        "title": "Potential incorrect images identified",
        "notes": [note[:450] for note in notes],
        "blocks_approval": False,
        "action": "return_to_production_for_refinement",
    }
