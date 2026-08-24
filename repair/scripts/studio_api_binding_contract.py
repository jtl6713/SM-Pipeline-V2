"""Canonical Studio API Worker binding contract.

Live production uses 10 core bindings. ELEVENLABS_API_KEY is optional secret_text.
Pipeline-runner vars (PIPELINE_RUNNER_URL, PIPELINE_RUNNER_SHARED_SECRET,
STAGE_BACKEND_SMV1, STAGE_BACKEND_R2, STAGE_BACKEND_R3, STAGE_BACKEND_R4,
STAGE_BACKEND_R5, STAGE_BACKEND_RR1, STAGE_BACKEND_RR2, STAGE_BACKEND_R2B, STAGE_BACKEND_P2, STAGE_BACKEND_P3, STAGE_BACKEND_P4, STAGE_BACKEND_P5, STAGE_BACKEND_C2, STAGE_BACKEND_C3, STAGE_BACKEND_C3B, STAGE_BACKEND_SAI1, STAGE_BACKEND_C4, STAGE_BACKEND_C5, STAGE_BACKEND_C6, STAGE_BACKEND_C7, STAGE_BACKEND_C8, STAGE_BACKEND_C9, STAGE_BACKEND_I1, STAGE_BACKEND_I2, STAGE_BACKEND_I3, STAGE_BACKEND_I4) may already exist on the live Worker; treat them as optional.
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

OPTIONAL_BINDINGS = {
    "ELEVENLABS_API_KEY": "secret_text",
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
    "STAGE_BACKEND_P2": "plain_text",
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


def evaluate_bindings(got):
    got = {str(k): str(v) for k, v in (got or {}).items() if k}
    missing = {name: expected for name, expected in CORE_BINDINGS.items() if got.get(name) != expected}
    unexpected = {
        name: found
        for name, found in got.items()
        if name not in CORE_BINDINGS and name not in OPTIONAL_BINDINGS
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
        "ok": not missing and not unexpected and not optional_mismatch,
        "missing": missing,
        "unexpected": unexpected,
        "optional_present": {name: name in got for name in OPTIONAL_BINDINGS},
        "optional_mismatch": optional_mismatch,
        "elevenlabs_required": False,
        "bindings": [{"name": name, "type": got[name]} for name in sorted(got)],
    }


def assert_live_contract(got, label="bindings"):
    result = evaluate_bindings(got)
    if not result["ok"]:
        raise SystemExit(
            f"{label} failed {CONTRACT_ID}: missing={result['missing']} unexpected={result['unexpected']} "
            f"optional_mismatch={result['optional_mismatch']}"
        )
    return result
