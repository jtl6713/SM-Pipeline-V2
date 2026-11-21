"""Sanitized, read-only discovery of a Studio Worker's Supabase target.

Input is a Cloudflare active-version resources.bindings list. Never emit
secret values or treat a discovered project as independently approved.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

KNOWN_NONPRODUCTION_REFS = frozenset({
    "vkwvscgisqsbuwagdvtb",  # connected sm-pipeline-v2-dev
    "yxhfaksetrxdezoodibq",  # connected Task Organizer
})


def ref_from_url(url: str | None) -> str | None:
    parsed = urlsplit(str(url or "").strip())
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return None
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.port:
        return None
    host = parsed.hostname or ""
    match = re.fullmatch(r"([a-z0-9]{20})\.supabase\.co", host)
    return match.group(1) if match else None


def inspect_studio_bindings(bindings: list[dict], github_url: str | None = None) -> dict:
    """Report a candidate REF, never a credential or a production attestation."""
    if not isinstance(bindings, list):
        bindings = []
    urls = [b for b in bindings if isinstance(b, dict) and b.get("name") == "SUPABASE_URL"]
    roles = [b for b in bindings if isinstance(b, dict) and b.get("name") == "SUPABASE_SERVICE_ROLE_KEY"]
    url = urls[0].get("text") if len(urls) == 1 and urls[0].get("type") == "plain_text" else None
    ref = ref_from_url(url)
    role_ok = len(roles) == 1 and roles[0].get("type") == "secret_text"
    github_ref = ref_from_url(github_url) if github_url else None
    return {
        "candidate_project_ref": ref,
        "candidate_is_known_nonproduction": ref in KNOWN_NONPRODUCTION_REFS if ref else False,
        "worker_supabase_binding_types_valid": bool(ref and role_ok),
        "github_project_ref_matches": (github_ref == ref) if github_url else None,
        "independently_verified_production": False,
        "credential_values_collected": False,
        "audit_only": True,
    }


def assert_approved_target(
    bindings: list[dict], approved_ref: str | None, github_url: str | None
) -> dict:
    """Match both trusted configurations to an independently approved REF."""
    from studio_api_binding_contract import assert_production_supabase_target

    summary = inspect_studio_bindings(bindings, github_url)
    if not summary["worker_supabase_binding_types_valid"]:
        raise SystemExit("Studio Worker Supabase binding is missing or invalid")
    if not github_url or summary["github_project_ref_matches"] is not True:
        raise SystemExit("GitHub Supabase project does not match active Worker")
    ref = summary["candidate_project_ref"]
    assert_production_supabase_target(f"https://{ref}.supabase.co", approved_ref)
    assert_production_supabase_target(github_url, approved_ref)
    # A configuration match is NOT independent proof of ownership.
    return {**summary, "approved_project_configuration_matches": True}
