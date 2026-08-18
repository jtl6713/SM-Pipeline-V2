#!/usr/bin/env python3
"""Prove Item 20 diagnostics: live binding contract, version labels, and no-secret inventory."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from studio_api_binding_contract import (
    AUTHORITATIVE_SERVICES,
    CONTRACT_ID,
    CORE_BINDINGS,
    REQUIRED_SECRETS,
    assert_live_contract,
    binding_map,
    evaluate_bindings,
)

WORKER = ROOT / "apps/studio-api/worker.js"
WEB = ROOT / "apps/studio-web/assets/app-item4-0619.js"
HTML = ROOT / "apps/studio-web/index.html"
DEPLOY_WORKER = ROOT / ".github/workflows/deploy-cloudflare-worker-production.yml"
SAFE_ROLLOUT = ROOT / ".github/workflows/cloudflare-production-safe-rollout.yml"
BINDINGS_AUDIT = ROOT / ".github/workflows/cloudflare-production-bindings-audit.yml"
WORKFLOWS = ROOT / ".github/workflows"
SOURCE_VERSION = "0.10.8-item20-source-identity"
UI_BUILD = "0.6.21"
STALE_V86 = "fbcf7fbd-7935-44dd-b195-094f505b7df6"
AUTHORITATIVE_WORKER_NAMES = {
    service["name"] for service in AUTHORITATIVE_SERVICES if service["kind"] == "worker"
}
FIXED_GATE_WORKFLOWS = {
    "deploy-cloudflare-worker-production.yml",
    "cloudflare-production-safe-rollout.yml",
    "cloudflare-production-bindings-audit.yml",
}


def json_http(url, headers=None, timeout=60):
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item20/1.0"}
    request_headers.update(headers or {})
    req = urllib.request.Request(url, method="GET", headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {
                    "raw": raw[:300],
                    "access_protected": "cloudflareaccess.com" in raw.lower() or "Sign in" in raw,
                }
            return response.status, payload
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw[:300]}
        return error.code, payload


def text_http(url, timeout=30):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "SM-Pipeline-V2-Item20/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")[:500]
    except Exception as error:
        return 0, str(error)[:240]


def remaining_stale_v86_pins():
    hits = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        text = path.read_text(encoding="utf-8")
        if STALE_V86 in text:
            hits.append(path.name)
    return hits


def source_checks():
    worker = WORKER.read_text(encoding="utf-8")
    web = WEB.read_text(encoding="utf-8")
    html = HTML.read_text(encoding="utf-8")
    deploy = DEPLOY_WORKER.read_text(encoding="utf-8")
    rollout = SAFE_ROLLOUT.read_text(encoding="utf-8")
    audit = BINDINGS_AUDIT.read_text(encoding="utf-8")
    stale_pins = remaining_stale_v86_pins()
    return {
        "worker_source_version": SOURCE_VERSION in worker,
        "worker_contract_id": CONTRACT_ID in worker,
        "worker_elevenlabs_not_required": "elevenlabs_required: false" in worker
        and "Boolean(env.ELEVENLABS_API_KEY)" in worker,
        "ui_build": UI_BUILD in html and f'BUILD_ID = "item4-{UI_BUILD}-upload-preview-self-heal"' in web,
        "deploy_imports_contract": "studio_api_binding_contract" in deploy,
        "deploy_does_not_require_elevenlabs": "assert_live_contract" in deploy
        and "AIRTABLE_PAT','ELEVENLABS_API_KEY" not in deploy,
        "rollout_imports_contract": "studio_api_binding_contract" in rollout,
        "rollout_not_pinned_to_v86": STALE_V86 not in rollout,
        "audit_imports_contract": "studio_api_binding_contract" in audit,
        "audit_not_requiring_11": "matches_expected_11" not in audit and STALE_V86 not in audit,
        "fixed_gates_unpinned": not any(name in stale_pins for name in FIXED_GATE_WORKFLOWS),
    }


def live_studio_api(account_id, token):
    api = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/chicagoshining-studio-api"
    headers = {"Authorization": f"Bearer {token}"}
    dep_status, dep = json_http(f"{api}/deployments", headers=headers)
    versions = (((dep.get("result") or {}).get("deployments") or [{}])[0].get("versions") or [])
    active = max(versions, key=lambda row: row.get("percentage") or 0) if versions else {}
    version_id = str(active.get("version_id") or "")
    ver_status, ver = json_http(f"{api}/versions/{version_id}", headers=headers) if version_id else (0, {})
    result = ver.get("result") or {}
    bindings = ((result.get("resources") or {}).get("bindings") or [])
    got = binding_map(bindings)
    contract = evaluate_bindings(got)
    assert_live_contract(got, "live chicagoshining-studio-api")
    scripts_status, scripts = json_http(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts",
        headers=headers,
    )
    names = sorted(
        str(row.get("id") or row.get("name") or "")
        for row in (scripts.get("result") or [])
        if isinstance(row, dict)
    )
    leftover = [name for name in names if name and name not in AUTHORITATIVE_WORKER_NAMES]
    return {
        "deployments_http": dep_status,
        "version_http": ver_status,
        "scripts_http": scripts_status,
        "active_version_id": version_id,
        "active_percentage": active.get("percentage"),
        "version_number": result.get("number"),
        "pinned_to_stale_v86": version_id == STALE_V86,
        "contract": contract,
        "worker_names": names,
        "leftover_workers": leftover,
    }


def main():
    out = Path(os.environ.get("ITEM20_EVIDENCE", "/tmp/item20-diagnostics-proof.json"))
    checks = source_checks()
    worker_text = WORKER.read_text(encoding="utf-8")
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not account_id or not token:
        raise SystemExit("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required")
    live = live_studio_api(account_id, token)
    pages_status, pages_html = text_http("https://studio.chicagoshining.com/")
    pages = {
        "http": pages_status,
        "access_protected": "cloudflareaccess.com" in (pages_html or "").lower() or "Sign in" in (pages_html or ""),
        "ui_build_0621": "UI build 0.6.21" in (pages_html or ""),
        "item18_cache_bust": "item18-upload-preview" in (pages_html or ""),
    }
    health_status, health = json_http("https://studio.chicagoshining.com/api/health")
    if not isinstance(health, dict):
        health = {}
    live_health = {
        "http": health_status,
        "access_protected": bool(health.get("access_protected")),
        "version": health.get("version"),
        "binding_contract": health.get("binding_contract"),
        "source_identity": health.get("source_identity"),
        "drift_from_repo_version": health.get("version") != SOURCE_VERSION if health.get("version") else None,
    }
    stale_pins = remaining_stale_v86_pins()
    evidence = {
        "repair_item": 20,
        "checkpoint": "cloudflare-github-diagnostics-binding-contract",
        "schema": "item20-diagnostics-v1",
        "make_scenario_runs": 0,
        "cadenced_scenarios_started": 0,
        "production_worker_traffic_switched": False,
        "contract": CONTRACT_ID,
        "core_binding_count": len(CORE_BINDINGS),
        "required_secrets": list(REQUIRED_SECRETS),
        "elevenlabs_required": False,
        "authoritative_services": list(AUTHORITATIVE_SERVICES),
        "remaining_stale_v86_pins": stale_pins,
        "repo": {
            "studio_api_source_version": SOURCE_VERSION,
            "studio_api_source_sha256": hashlib.sha256(worker_text.encode("utf-8")).hexdigest(),
            "studio_ui_build": UI_BUILD,
        },
        "source_checks": checks,
        "live_worker": {
            "name": "chicagoshining-studio-api",
            "active_version_id": live.get("active_version_id"),
            "version_number": live.get("version_number"),
            "percentage": live.get("active_percentage"),
            "pinned_to_stale_v86": live.get("pinned_to_stale_v86"),
            "binding_count": (live.get("contract") or {}).get("binding_count"),
            "core_ok": (live.get("contract") or {}).get("core_ok"),
            "elevenlabs_present": ((live.get("contract") or {}).get("optional_present") or {}).get("ELEVENLABS_API_KEY"),
            "contract_ok": (live.get("contract") or {}).get("ok"),
            "worker_names": live.get("worker_names"),
            "leftover_workers": live.get("leftover_workers"),
        },
        "live_pages": pages,
        "live_health": live_health,
        "passed": False,
    }
    evidence["passed"] = bool(
        all(checks.values())
        and live.get("contract", {}).get("ok") is True
        and bool(live.get("active_version_id"))
        and evidence["production_worker_traffic_switched"] is False
        and evidence["make_scenario_runs"] == 0
        and not any(name in stale_pins for name in FIXED_GATE_WORKFLOWS)
    )
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": evidence["passed"],
                "failed_source": [key for key, value in checks.items() if not value],
                "live_version_id": live.get("active_version_id"),
                "live_binding_count": (live.get("contract") or {}).get("binding_count"),
                "elevenlabs_present": ((live.get("contract") or {}).get("optional_present") or {}).get(
                    "ELEVENLABS_API_KEY"
                ),
                "leftover_workers": live.get("leftover_workers"),
                "remaining_stale_v86_pins": stale_pins,
                "health_http": health_status,
                "health_version": health.get("version"),
                "pages_ui_build": pages.get("ui_build_0621"),
            },
            indent=2,
        )
    )
    if not evidence["passed"]:
        raise SystemExit("Item 20 diagnostics proof failed")


if __name__ == "__main__":
    main()
