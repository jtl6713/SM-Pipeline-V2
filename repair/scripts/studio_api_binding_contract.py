"""Canonical Studio API Worker binding contract.

Live production uses 10 legacy core bindings plus the atomic scheduling reservation
feature-flag and Durable Object namespace after reservation bootstrap.
ELEVENLABS_API_KEY (TTS) and ELEVENLABS_VIDEO_API_KEY (paid video) are separate optional secret_text bindings.
Pipeline-runner vars (PIPELINE_RUNNER_URL, PIPELINE_RUNNER_SHARED_SECRET,
STAGE_BACKEND_SMV1, STAGE_BACKEND_R2, STAGE_BACKEND_R3, STAGE_BACKEND_R4,
STAGE_BACKEND_R5, STAGE_BACKEND_RR1, STAGE_BACKEND_RR2, STAGE_BACKEND_R2B, STAGE_BACKEND_P1, STAGE_BACKEND_P2, STAGE_BACKEND_P3, STAGE_BACKEND_P4, STAGE_BACKEND_P5, STAGE_BACKEND_C2, STAGE_BACKEND_C3, STAGE_BACKEND_C3B, STAGE_BACKEND_SAI1, STAGE_BACKEND_C4, STAGE_BACKEND_C5, STAGE_BACKEND_C6, STAGE_BACKEND_C7, STAGE_BACKEND_C8, STAGE_BACKEND_C9, STAGE_BACKEND_I1, STAGE_BACKEND_I2, STAGE_BACKEND_I3, STAGE_BACKEND_I4, STAGE_BACKEND_A2, STAGE_BACKEND_A2B, STAGE_BACKEND_A3, STAGE_BACKEND_A4, STAGE_BACKEND_A1P, STAGE_BACKEND_A1S, STAGE_BACKEND_M1, STAGE_BACKEND_AP0, STAGE_BACKEND_AP1_IG, STAGE_BACKEND_AP1_IGS, STAGE_BACKEND_FBS1, STAGE_BACKEND_FBS3, STAGE_BACKEND_YT0, STAGE_BACKEND_TTD0, STAGE_BACKEND_FB0, STAGE_BACKEND_AP0C, STAGE_BACKEND_TTD_ORCH, STAGE_BACKEND_YT_ORCH, STAGE_BACKEND_FB_ORCH, STAGE_BACKEND_APCAR_ORCH, STAGE_BACKEND_IG_ORCH, STAGE_BACKEND_P0202) may already exist on the live Worker; treat them as optional.
Supabase Phase 3 vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STUDIO_READ_SOURCE)
are optional so Pipeline can feature-flag reads without blocking deploys.
"""

from __future__ import annotations


CORE_BINDINGS = {
    "AIRTABLE_BASE_ID": "plain_text",
    "AIRTABLE_CONTENT_TABLE_ID": "plain_text",
    "AIRTABLE_IDEA_TABLE_ID": "plain_text",
    "AIRTABLE_MEDIA_TABLE_ID": "plain_text",
    "AIRTABLE_MUSIC_VIEW_ID": "plain_text",
    "AIRTABLE_OUTPUT_TABLE_ID": "plain_text",
    "AIRTABLE_PAT": "secret_text",
    "ALLOWED_ORIGINS": "plain_text",
    "I3_DECISION_WEBHOOK_URL": "plain_text",
    "STUDIO_MEDIA": "r2_bucket",
}

RESERVATION_BINDINGS = {
    "STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED": "plain_text",
    "STUDIO_SCHEDULE_RESERVATIONS": "durable_object_namespace",
}

OPTIONAL_BINDINGS = {
    # Separate, non-authoritative Home counter namespace (not schedule authority).
    "STUDIO_PROFILE_SUMMARIES": "durable_object_namespace",
    "STUDIO_HOME_PROFILE_SUMMARY_READS": "plain_text",
    "STUDIO_REFILL_PROFILE_SUMMARY_READS": "plain_text",
    "STUDIO_PROFILE_SUMMARY_CAPTURE_ENABLED": "plain_text",
    "STUDIO_PROFILE_SUMMARY_RECONCILE_ENABLED": "plain_text",
    # Background publication recovery is status-only. These flag NAMES and
    # types are allowlisted here; exact stage, canary, and bounded rates are
    # independently validated by the production deploy manifest.
    "PUBLICATION_RECONCILIATION_SCAN_ENABLED": "plain_text",
    "PUBLICATION_RECONCILIATION_ENABLED": "plain_text",
    "PUBLICATION_RECONCILIATION_BOUNDED_ENABLED": "plain_text",
    "PUBLICATION_RECONCILIATION_CANARY_RECORD": "plain_text",
    "PUBLICATION_RECONCILIATION_BATCH_SIZE": "plain_text",
    "PUBLICATION_RECONCILIATION_INTERVAL_MINUTES": "plain_text",
    "PUBLICATION_RECONCILIATION_COOLDOWN_MINUTES": "plain_text",
    "PUBLICATION_RECONCILIATION_MAX_ATTEMPTS": "plain_text",
    # Production rollout flags are allowlisted but validated by live release gates.
    "FACTORY_BATCH_APPROVALS_ENABLED": "plain_text",
    "FACTORY_BATCH_ROLLOUT_MODE": "plain_text",
    "FACTORY_BATCH_ROLLOUT_MAX_ITEMS": "plain_text",
    # The five global settings are allowed only by TYPE here; the production
    # deployment workflow separately enforces exact signed values and caps.
    "FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED": "plain_text",
    "FACTORY_BATCH_GLOBAL_MODE": "plain_text",
    "FACTORY_BATCH_GLOBAL_MAX_TOTAL": "plain_text",
    "FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE": "plain_text",
    "FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF": "plain_text",
    # Visual-aware voiceover rollout bindings are type-allowlisted here;
    # deploy-cloudflare-worker-production.yml separately enforces exact signed values.
    "STUDIO_VISUAL_TIMELINE_V1": "plain_text",
    "STUDIO_VISUAL_SCRIPT_V1": "plain_text",
    "STUDIO_VISUAL_CANARY_OUTPUT_IDS": "plain_text",
    # Scoped atomic scheduling allowlist; deployment verifies the exact value
    # against the explicitly confirmed single-lane activation input.
    "STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST": "plain_text",
    # Exact, disabled-by-default Chicago review pilot bindings deployed as
    # Cloudflare secret_text; no arbitrary new binding names or types allowed.
    "RENDERING_REVIEW_ATTEMPT_COMMIT_ENABLED": "secret_text",
    "RENDERING_REVIEW_COMPLETION_ENABLED": "secret_text",
    "RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED": "secret_text",
    "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED": "secret_text",
    "RENDERING_REVIEW_DISPATCH_SHARED_SECRET": "secret_text",
    "RENDERING_REVIEW_ENROLL_WRITES_ENABLED": "secret_text",
    "RENDERING_REVIEW_EXACT_OUTPUT_ID": "secret_text",
    "RENDERING_REVIEW_EXACT_RENDER_TRIGGER_ENABLED": "secret_text",
    "RENDERING_REVIEW_FEEDBACK_WRITES_ENABLED": "secret_text",
    "RENDERING_REVIEW_IG_DISPATCH_CLAIM_ENABLED": "secret_text",
    "RENDERING_REVIEW_INTEGRATION_VERIFIED": "secret_text",
    "RENDERING_REVIEW_JOB_CLAIM_ENABLED": "secret_text",
    "RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED": "secret_text",
    "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED": "secret_text",
    "RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED": "secret_text",
    "RENDERING_REVIEW_PRODUCER_WRITES_ENABLED": "secret_text",
    "RENDERING_REVIEW_REMOTION_BASE_URL": "secret_text",
    "RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET": "secret_text",
    "RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED": "secret_text",
    "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED": "secret_text",
    "ELEVENLABS_API_KEY": "secret_text",
    # Dedicated budget-capped video key. Preserve without replacing TTS secret.
    "ELEVENLABS_VIDEO_API_KEY": "secret_text",
    # Reviewed one-setting price only; no feature enablement, rights or watermark bypass.
    "STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT": "secret_text",
    "STUDIO_ELEVENLABS_VIDEO_CREDITS_4S_720P_9X16": "secret_text",
    # Guarded durable I1 activation is a separate release; preserve its
    # secret binding on every ordinary Worker deployment without changing
    # the live value or treating an arbitrary new binding as authorized.
    "STUDIO_I1_DURABLE_JOBS": "secret_text",
    "PIPELINE_RUNNER_SHARED_SECRET": "secret_text",
    "PIPELINE_RUNNER_URL": "plain_text",
    "STAGE_BACKEND_SMV1": "plain_text",
    "STAGE_BACKEND_R2": "plain_text",
    "STAGE_BACKEND_R3": "plain_text",
    "STAGE_BACKEND_R4": "plain_text",
    "STAGE_BACKEND_R5": "plain_text",
    "STAGE_BACKEND_RR1": "plain_text",
    "STAGE_BACKEND_RR2": "plain_text",
    "STAGE_BACKEND_R2B": "plain_text",
    "STAGE_BACKEND_P1": "plain_text",
    "STAGE_BACKEND_P2": "plain_text",
    "STAGE_BACKEND_M1": "plain_text",
    "STAGE_BACKEND_P3": "plain_text",
    "STAGE_BACKEND_P4": "plain_text",
    "STAGE_BACKEND_P5": "plain_text",
    "STAGE_BACKEND_C2": "plain_text",
    "STAGE_BACKEND_C3": "plain_text",
    "STAGE_BACKEND_C3B": "plain_text",
    "STAGE_BACKEND_SAI1": "plain_text",
    "STAGE_BACKEND_C4": "plain_text",
    "STAGE_BACKEND_C5": "plain_text",
    "STAGE_BACKEND_C6": "plain_text",
    "STAGE_BACKEND_C7": "plain_text",
    "STAGE_BACKEND_C8": "plain_text",
    "STAGE_BACKEND_C9": "plain_text",
    "STAGE_BACKEND_I1": "plain_text",
    "STAGE_BACKEND_I2": "plain_text",
    "STAGE_BACKEND_I3": "plain_text",
    "STAGE_BACKEND_I4": "plain_text",
    "STAGE_BACKEND_A2": "plain_text",
    "STAGE_BACKEND_A2B": "plain_text",
    "STAGE_BACKEND_A3": "plain_text",
    "STAGE_BACKEND_A4": "plain_text",
    "STAGE_BACKEND_A1P": "plain_text",
    "STAGE_BACKEND_A1S": "plain_text",
    "STAGE_BACKEND_AP0": "plain_text",
    "STAGE_BACKEND_AP1_IG": "plain_text",
    "STAGE_BACKEND_AP1_IGS": "plain_text",
    "STAGE_BACKEND_FBS1": "plain_text",
    "STAGE_BACKEND_FBS3": "plain_text",
    "STAGE_BACKEND_YT0": "plain_text",
    "STAGE_BACKEND_TTD0": "plain_text",
    "STAGE_BACKEND_FB0": "plain_text",
    "STAGE_BACKEND_AP0C": "plain_text",
    "STAGE_BACKEND_TTD_ORCH": "plain_text",
    "STAGE_BACKEND_YT_ORCH": "plain_text",
    "STAGE_BACKEND_FB_ORCH": "plain_text",
    "STAGE_BACKEND_APCAR_ORCH": "plain_text",
    "STAGE_BACKEND_IG_ORCH": "plain_text",
    "STAGE_BACKEND_P0202": "plain_text",
    "STUDIO_READ_SOURCE": "plain_text",
    # B2 independent content-list read gate is stored as a Cloudflare secret.
    # Preserve its exact secret_text type; do not print or change the live value.
    "STUDIO_CONTENT_READ_SOURCE": "secret_text",
    # B3 Factory desk + Ops queue read gate. Optional until the secret is set.
    # Preserve secret_text; do not print or change the live value.
    "STUDIO_FACTORY_OPS_READ_SOURCE": "secret_text",
    # Home overview read gate. Optional until the secret is set.
    # Preserve secret_text; do not print or change the live value.
    "STUDIO_HOME_READ_SOURCE": "secret_text",
    "SUPABASE_URL": "plain_text",
    "SUPABASE_SERVICE_ROLE_KEY": "secret_text",
}

CONTRACT_ID = "studio-api-10-core-elevenlabs-optional"
REQUIRED_SECRETS = ("AIRTABLE_PAT",)
AUTHORITATIVE_SERVICES = (
    {"name": "chicagoshining-studio-api", "kind": "worker", "role": "Studio API / repair controller"},
    {"name": "chicagoshining-studio-web", "kind": "pages", "role": "Studio UI"},
    {"name": "chicagoshining-studio-variant-service", "kind": "worker", "role": "fill-crop-v2 variants"},
    {"name": "chicagoshining-r2-upload", "kind": "worker", "role": "publish asset upload / lifecycle"},
    {"name": "chicagoshining-tiktok-auth", "kind": "worker", "role": "TikTok OAuth helper"},
    {"name": "chicagoshining-studio-media-bridge", "kind": "worker", "role": "media preview bridge"},
)


def binding_map(bindings):
    return {str(item.get("name") or ""): str(item.get("type") or "") for item in bindings or []}


def evaluate_bindings(got, *, allow_reservation_absent=False):
    got = {str(k): str(v) for k, v in (got or {}).items() if k}
    missing = {name: expected for name, expected in CORE_BINDINGS.items() if got.get(name) != expected}
    reservation_present = {name for name in RESERVATION_BINDINGS if name in got}
    reservation_missing = {
        name: expected
        for name, expected in RESERVATION_BINDINGS.items()
        if got.get(name) != expected
    }
    reservation_bootstrap_absent = (
        allow_reservation_absent
        and not reservation_present
    )
    effective_reservation_missing = {} if reservation_bootstrap_absent else reservation_missing
    unexpected = {
        name: found
        for name, found in got.items()
        if name not in CORE_BINDINGS
        and name not in RESERVATION_BINDINGS
        and name not in OPTIONAL_BINDINGS
    }
    optional_mismatch = {
        name: got[name]
        for name, expected in OPTIONAL_BINDINGS.items()
        if name in got and got[name] != expected
    }
    return {
        "contract": CONTRACT_ID,
        "binding_count": len(got),
        "core_ok": not missing,
        "reservation_ok": not effective_reservation_missing,
        "reservation_bootstrap_absent": reservation_bootstrap_absent,
        "ok": not missing and not effective_reservation_missing and not unexpected and not optional_mismatch,
        "missing": missing,
        "reservation_missing": effective_reservation_missing,
        "unexpected": unexpected,
        "optional_present": {name: name in got for name in OPTIONAL_BINDINGS},
        "reservation_present": {name: name in got for name in RESERVATION_BINDINGS},
        "optional_mismatch": optional_mismatch,
        "elevenlabs_required": False,
        "bindings": [{"name": name, "type": got[name]} for name in sorted(got)],
    }


def assert_live_contract(got, label="bindings", *, allow_reservation_absent=False):
    result = evaluate_bindings(got, allow_reservation_absent=allow_reservation_absent)
    if not result["ok"]:
        raise SystemExit(
            f"{label} failed {CONTRACT_ID}: missing={result['missing']} "
            f"reservation_missing={result['reservation_missing']} "
            f"unexpected={result['unexpected']} optional_mismatch={result['optional_mismatch']}"
        )
    return result

# Signed rollout values are verified separately from the type-only binding
# contract. Never accept a partial tuple or ad-hoc increased limits.
GLOBAL_FACTORY_BINDINGS = (
    "FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED",
    "FACTORY_BATCH_GLOBAL_MODE",
    "FACTORY_BATCH_GLOBAL_MAX_TOTAL",
    "FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE",
    "FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF",
)
GLOBAL_FACTORY_CAPS = {"pilot": (4, 2), "expanded": (20, 10)}
GLOBAL_FACTORY_CURRENT_MODE = "global_all_platforms_v2"
GLOBAL_FACTORY_MIGRATION_MODES = ("global_ig_reel_story_v1", GLOBAL_FACTORY_CURRENT_MODE)


def global_factory_manifest_values(rollout):
    item = rollout.get("global")
    if not isinstance(item, dict) or type(item.get("enabled")) is not bool:
        raise SystemExit("Missing signed global Factory release manifest")
    if item["enabled"]:
        stage = item.get("stage")
        if stage not in GLOBAL_FACTORY_CAPS:
            raise SystemExit("Unknown global Factory release stage")
        total, per_profile = GLOBAL_FACTORY_CAPS[stage]
        if (item.get("mode") != GLOBAL_FACTORY_CURRENT_MODE
                or item.get("max_total") != total
                or item.get("max_per_profile") != per_profile
                or item.get("production_signoff") != "explicit-review"):
            raise SystemExit("Global Factory release manifest does not match signed stage")
        return dict(zip(GLOBAL_FACTORY_BINDINGS,
            ("true", GLOBAL_FACTORY_CURRENT_MODE, str(total), str(per_profile), "explicit-review")))
    if (item.get("stage") != "disabled" or item.get("mode") != "disabled"
            or item.get("max_total") != 0 or item.get("max_per_profile") != 0
            or item.get("production_signoff") != "disabled"):
        raise SystemExit("Disabled global Factory release must use exact off values")
    return dict(zip(GLOBAL_FACTORY_BINDINGS, ("false", "disabled", "0", "0", "disabled")))


def assert_global_factory_binding_tuple(plain, label, allow_absent=False):
    found = {k: plain[k] for k in GLOBAL_FACTORY_BINDINGS if k in plain}
    if not found and allow_absent:
        return "absent"
    if len(found) != len(GLOBAL_FACTORY_BINDINGS):
        raise SystemExit(f"{label}: partial global Factory binding tuple")
    disabled = dict(zip(GLOBAL_FACTORY_BINDINGS, ("false", "disabled", "0", "0", "disabled")))
    if found == disabled:
        return "disabled"
    # During a signed mode migration the active Worker may still carry the
    # immediately previous exact tuple. Accept it as a valid source/rollback
    # state; the deployment workflow separately verifies that the postdeploy
    # bindings exactly match global_factory_manifest_values(), so legacy mode
    # cannot be accepted as the new release target.
    for mode in GLOBAL_FACTORY_MIGRATION_MODES:
        for stage, (total, per_profile) in GLOBAL_FACTORY_CAPS.items():
            expected = dict(zip(GLOBAL_FACTORY_BINDINGS,
                ("true", mode, str(total), str(per_profile), "explicit-review")))
            if found == expected:
                return stage
    raise SystemExit(f"{label}: unrecognized global Factory binding tuple")
