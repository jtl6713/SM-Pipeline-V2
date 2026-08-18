#!/usr/bin/env python3
"""Prove R2 report-first lifecycle cleanup without starting Make.

Safety:
- Never start, activate, or pulse Make scenarios.
- Cadenced orchestrators must already be OFF and must stay OFF.
- Delete only allowlisted Output 157 orphans and the Item 12 marker.
- Refuse deletion of production key publish/platform-output-151.mp4.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_ID = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
OUTPUTS_TABLE = "tblrlPeboBthkplH0"
WORKER_VERSION = "1.1.0-lifecycle"
ORPHAN_PREFIX = "publish/platform-output-157/"
PROOF_PREFIX = "publish/item12-lifecycle-proof/"
PROOF_KEY = "publish/item12-lifecycle-proof/marker.txt"
DENY_KEY = "publish/platform-output-151.mp4"
ORCHESTRATORS = {
    "5864632": "IG-PUB-ORCH",
    "5813561": "FB-ORCH",
    "5823581": "YT-ORCH",
    "5791537": "AP-CAR-ORCH",
    "5806668": "TTD-ORCH",
}
SETTING_NAMES = (
    "MAKE_API_TOKEN",
    "MAKE_API_BASE_URL",
    "R2_UPLOAD_WORKER_URL",
    "R2_UPLOAD_WORKER_SECRET",
)


def json_http(url, method="GET", headers=None, body=None, timeout=30):
    data = body
    if isinstance(body, (dict, list)):
        data = json.dumps(body).encode()
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item12/1.0"}
    request_headers.update(headers or {})
    if data is not None and "Content-Type" not in {key.title(): key for key in request_headers}:
        if isinstance(body, (dict, list)):
            request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw[:500]}
        return error.code, payload


def airtable_settings(pat):
    formula = "AND({Active}=1,OR(" + ",".join(f"{{Setting_Name}}='{name}'" for name in SETTING_NAMES) + "))"
    query = urllib.parse.urlencode(
        [("filterByFormula", formula), ("fields[]", "Setting_Name"), ("fields[]", "Setting_Value")]
    )
    status, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{SETTINGS_TABLE}?{query}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable settings read failed {status}")
    return {
        row["fields"]["Setting_Name"]: str(row["fields"].get("Setting_Value") or "").strip()
        for row in payload.get("records", [])
    }


def unwrap(payload, key):
    value = payload.get(key) or (payload.get("response") or {}).get(key) or payload
    return json.loads(value) if isinstance(value, str) else value


def count_output(pat, output_id):
    query = urllib.parse.urlencode(
        [
            ("filterByFormula", f"{{Output_ID}}={int(output_id)}"),
            ("fields[]", "Output_ID"),
            ("maxRecords", "5"),
        ]
    )
    status, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{OUTPUTS_TABLE}?{query}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable Output {output_id} lookup failed {status}")
    return len(payload.get("records") or [])


def orchestrators_off(settings):
    make_base = settings["MAKE_API_BASE_URL"].rstrip("/")
    make_token = settings["MAKE_API_TOKEN"]
    result = {}
    for scenario_id, name in ORCHESTRATORS.items():
        status, payload = json_http(
            f"{make_base}/scenarios/{scenario_id}",
            headers={"Authorization": f"Token {make_token}", "Content-Type": "application/json"},
        )
        meta = unwrap(payload, "scenario") if status == 200 else {}
        active = bool(meta.get("isActive"))
        result[name] = {"id": scenario_id, "http": status, "isActive": active}
        if status != 200 or active:
            raise SystemExit(f"{name} must stay OFF; status={status} active={active}")
    return result


def wait_for_version(worker, settings):
    deadline = time.time() + 300
    last = {}
    last_status = 0
    route_status = 0
    while time.time() < deadline:
        last_status, last = json_http(f"{worker}/health")
        route_status, _ = report(worker, settings, PROOF_PREFIX)
        if last.get("ok") and last.get("version") == WORKER_VERSION and route_status != 405:
            return last_status, last
        time.sleep(10)
    raise SystemExit(
        f"R2 worker version {WORKER_VERSION} not live: health={last_status} {last} report={route_status}"
    )


def auth_headers(settings, extra=None):
    headers = {"x-pipeline-secret": settings["R2_UPLOAD_WORKER_SECRET"]}
    if extra:
        headers.update(extra)
    return headers


def report(worker, settings, prefix):
    query = urllib.parse.urlencode({"prefix": prefix})
    return json_http(f"{worker}/lifecycle/report?{query}", headers=auth_headers(settings))


def head_object(worker, settings, key):
    query = urllib.parse.urlencode({"key": key})
    return json_http(f"{worker}/lifecycle/object?{query}", headers=auth_headers(settings))


def delete_keys(worker, settings, keys, dry_run=False, confirm=True):
    query = urllib.parse.urlencode({"dry_run": "true" if dry_run else "false"})
    extra = {"x-lifecycle-confirm": "DELETE"} if confirm else {}
    return json_http(
        f"{worker}/lifecycle/objects?{query}",
        method="DELETE",
        headers=auth_headers(settings, extra),
        body={"keys": keys},
    )


def put_marker(worker, settings):
    body = f"item12-lifecycle-proof {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n".encode()
    query = urllib.parse.urlencode({"key": PROOF_KEY})
    return json_http(
        f"{worker}?{query}",
        method="PUT",
        headers=auth_headers(
            settings,
            {
                "Content-Type": "text/plain; charset=UTF-8",
                "x-output-id": "157",
                "x-final-file-id": "item12-marker",
                "x-retain-class": "proof",
            },
        ),
        body=body,
    )


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM12_EVIDENCE", "/tmp/item12-r2-lifecycle-proof.json"))
    settings = airtable_settings(pat)
    worker = settings["R2_UPLOAD_WORKER_URL"].rstrip("/")
    orch = orchestrators_off(settings)
    airtable_157 = count_output(pat, 157)
    airtable_151 = count_output(pat, 151)
    health_status, health = wait_for_version(worker, settings)
    before_157_status, before_157 = report(worker, settings, ORPHAN_PREFIX)
    put_status, put_payload = put_marker(worker, settings)
    marker_status, marker = head_object(worker, settings, PROOF_KEY)
    deny_status, deny = delete_keys(worker, settings, [DENY_KEY], dry_run=False, confirm=True)
    production_status, production = head_object(worker, settings, DENY_KEY)
    orphan_keys = [obj.get("key") for obj in (before_157.get("objects") or []) if obj.get("key")]
    cleanup_keys = list(dict.fromkeys(orphan_keys + [PROOF_KEY]))
    dry_status, dry = delete_keys(worker, settings, cleanup_keys, dry_run=True, confirm=False)
    delete_status, deleted = delete_keys(worker, settings, cleanup_keys, dry_run=False, confirm=True)
    after_157_status, after_157 = report(worker, settings, ORPHAN_PREFIX)
    after_proof_status, after_proof = report(worker, settings, PROOF_PREFIX)
    after_prod_status, after_prod = head_object(worker, settings, DENY_KEY)
    after_orch = orchestrators_off(settings)
    evidence = {
        "repair_item": 12,
        "checkpoint": "report-first-allowlisted-cleanup",
        "worker_version": health.get("version"),
        "ttl_policy": health.get("ttl_policy"),
        "make_scenario_runs": 0,
        "orchestrators": after_orch,
        "airtable_output_157_count": airtable_157,
        "airtable_output_151_count": airtable_151,
        "health_status": health_status,
        "orphan_prefix": ORPHAN_PREFIX,
        "before_157": {
            "http": before_157_status,
            "count": before_157.get("count"),
            "keys": orphan_keys,
        },
        "marker_put": {"http": put_status, "ok": put_payload.get("ok"), "key": put_payload.get("key")},
        "marker_head": {
            "http": marker_status,
            "retain_class": ((marker.get("object") or {}).get("retain_class")),
            "output_id": ((marker.get("object") or {}).get("output_id")),
            "custom_metadata": ((marker.get("object") or {}).get("custom_metadata")),
        },
        "deny_production_delete": {
            "http": deny_status,
            "error": deny.get("error"),
            "denied": deny.get("denied"),
        },
        "production_before": {
            "http": production_status,
            "ok": production.get("ok"),
            "key": ((production.get("object") or {}).get("key")),
            "size": ((production.get("object") or {}).get("size")),
        },
        "dry_run": {"http": dry_status, "ok": dry.get("ok"), "would_delete": dry.get("would_delete")},
        "cleanup": {"http": delete_status, "ok": deleted.get("ok"), "deleted": deleted.get("deleted")},
        "after_157": {"http": after_157_status, "count": after_157.get("count"), "keys": [obj.get("key") for obj in (after_157.get("objects") or [])]},
        "after_proof_prefix": {"http": after_proof_status, "count": after_proof.get("count")},
        "production_after": {
            "http": after_prod_status,
            "ok": after_prod.get("ok"),
            "key": ((after_prod.get("object") or {}).get("key")),
            "size": ((after_prod.get("object") or {}).get("size")),
        },
        "passed": False,
    }
    marker_meta = evidence["marker_head"]["custom_metadata"] or {}
    evidence["passed"] = bool(
        health.get("ok")
        and health.get("version") == WORKER_VERSION
        and airtable_157 == 0
        and airtable_151 == 1
        and before_157_status == 200
        and put_payload.get("ok")
        and marker.get("ok")
        and marker_meta.get("retainClass") == "proof"
        and deny_status == 403
        and DENY_KEY in (deny.get("denied") or [])
        and production.get("ok")
        and ((production.get("object") or {}).get("key")) == DENY_KEY
        and dry.get("ok")
        and dry.get("dry_run") is True
        and set(dry.get("would_delete") or []) == set(cleanup_keys)
        and deleted.get("ok")
        and set(deleted.get("deleted") or []) == set(cleanup_keys)
        and after_157.get("count") == 0
        and after_proof.get("count") == 0
        and after_prod.get("ok")
        and ((after_prod.get("object") or {}).get("key")) == DENY_KEY
        and ((after_prod.get("object") or {}).get("size")) == ((production.get("object") or {}).get("size"))
        and evidence["make_scenario_runs"] == 0
        and all(not item["isActive"] for item in after_orch.values())
    )
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "path": str(out), "deleted": deleted.get("deleted")}, indent=2))
    if not evidence["passed"]:
        raise SystemExit("Item 12 R2 lifecycle proof failed")


if __name__ == "__main__":
    main()
