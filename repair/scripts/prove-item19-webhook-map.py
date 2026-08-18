#!/usr/bin/env python3
"""Build the read-only scenario-to-startup-webhook map without rotating identities.

Safety:
- Never create, update, delete, or learn hooks.
- Never start, stop, or run Make scenarios.
- Cadenced orchestrators must already be OFF and must stay OFF.
- R4 is a scheduled Airtable consumer (hookId null), not a webhook scenario.
- Exactly one bounded invocation: GET /hooks/{id}/ping after the map is verified.
  That call returns hook status only and does not execute the attached scenario.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_ID = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
TEAM_ID = 2410882
R4_ID = 5556716
PING_HOOK_ID = 2549733
ORCHESTRATORS = {
    "5864632": "IG-PUB-ORCH",
    "5813561": "FB-ORCH",
    "5823581": "YT-ORCH",
    "5791537": "AP-CAR-ORCH",
    "5806668": "TTD-ORCH",
}
SCHEDULED_CONSUMERS = {
    5556716: "R4",
    5557966: "R3",
    5565333: "R5",
    5576363: "RR1",
    5536624: "P5",
}
PRESERVED = {
    5524092: {"label": "I4", "hook_id": 2549733},
    5533802: {"label": "P4", "hook_id": 2567873},
    5531703: {"label": "P3", "hook_id": 2567877},
    5612096: {"label": "AP0", "hook_id": 2653029},
    5816409: {"label": "FBS1", "hook_id": 2639647},
}
STARTUP = {
    "AP0_WEBHOOK_URL": {"label": "AP0", "scenario_id": 5612096, "hook_id": 2653029},
    "AP0C_WEBHOOK_URL": {"label": "AP0C", "scenario_id": 5786899},
    "AP1_IG_WEBHOOK_URL": {"label": "AP1-IG", "scenario_id": 5862882},
    "AP1C_WEBHOOK_URL": {"label": "AP1C", "scenario_id": 5790745, "hook_id": 2628156, "historical": True},
    "AP2C_WEBHOOK_URL": {"label": "AP2C", "scenario_id": 5791231},
    "AP3C_WEBHOOK_URL": {"label": "AP3C", "scenario_id": 5791273},
    "AP3P_WEBHOOK_URL": {"label": "AP3P", "scenario_id": 5791336},
    "AP4C_WEBHOOK_URL": {"label": "AP4C", "scenario_id": 5791356},
    "AP4R_WEBHOOK_URL": {"label": "AP4R", "scenario_id": 5791396},
    "AP5C_WEBHOOK_URL": {"label": "AP5C", "scenario_id": 5791424},
    "FB0_WEBHOOK_URL": {"label": "FB0", "scenario_id": 5813463},
    "FB1_WEBHOOK_URL": {"label": "FB1", "scenario_id": 5813487},
    "FB2_WEBHOOK_URL": {"label": "FB2", "scenario_id": 5813511},
    "FB3_WEBHOOK_URL": {"label": "FB3", "scenario_id": 5813534},
    "FBS1_WEBHOOK_URL": {"label": "FBS1", "scenario_id": 5816409, "hook_id": 2639647},
    "FBS4_WEBHOOK_URL": {"label": "FBS4", "scenario_id": 5816520},
    "TTD0_WEBHOOK_URL": {"label": "TTD0", "scenario_id": 5806658},
    "TTD1_WEBHOOK_URL": {"label": "TTD1", "scenario_id": 5806644},
    "TTD2_WEBHOOK_URL": {"label": "TTD2", "scenario_id": 5806597},
    "TTD3_WEBHOOK_URL": {"label": "TTD3", "scenario_id": 5806570},
    "TTD4_WEBHOOK_URL": {"label": "TTD4", "scenario_id": 5806518},
    "YT0_WEBHOOK_URL": {"label": "YT0", "scenario_id": 5823572},
    "YTP1_WEBHOOK_URL": {"label": "YTP1", "scenario_id": 5830810},
    "YTS1_WEBHOOK_URL": {"label": "YTS1", "scenario_id": 5830609},
    "YTS2_WEBHOOK_URL": {"label": "YTS2", "scenario_id": 5830616},
    "YTS3_WEBHOOK_URL": {"label": "YTS3", "scenario_id": 5830623},
}


def json_http(url, method="GET", headers=None, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item19/1.0"}
    request_headers.update(headers or {})
    if data is not None:
        request_headers.setdefault("Content-Type", "application/json")
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


def unwrap(payload, key):
    if isinstance(payload, list):
        return payload
    value = payload.get(key) or (payload.get("response") or {}).get(key) or payload
    return json.loads(value) if isinstance(value, str) else value


def hook_token(url):
    value = str(url or "").strip()
    if not value:
        return ""
    if "@hook." in value:
        return value.split("@", 1)[0].strip()
    parsed = urllib.parse.urlparse(value)
    return parsed.path.strip("/").split("/")[-1]


def token_hash(token):
    if not token:
        return None
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


def airtable_settings(pat):
    formula = (
        "AND({Active}=1,OR("
        "FIND('WEBHOOK',UPPER({Setting_Name})),"
        "{Setting_Name}='MAKE_API_TOKEN',"
        "{Setting_Name}='MAKE_API_BASE_URL'"
        "))"
    )
    records = []
    offset = None
    while True:
        params = [
            ("filterByFormula", formula),
            ("fields[]", "Setting_Name"),
            ("fields[]", "Setting_Value"),
            ("pageSize", "100"),
        ]
        if offset:
            params.append(("offset", offset))
        status, payload = json_http(
            f"https://api.airtable.com/v0/{BASE_ID}/{SETTINGS_TABLE}?{urllib.parse.urlencode(params)}",
            headers={"Authorization": f"Bearer {pat}"},
        )
        if status != 200:
            raise SystemExit(f"Airtable settings read failed {status}")
        records.extend(payload.get("records") or [])
        offset = payload.get("offset")
        if not offset:
            break
    values = {}
    for row in records:
        fields = row.get("fields") or {}
        name = str(fields.get("Setting_Name") or "").strip()
        if name:
            values[name] = str(fields.get("Setting_Value") or "").strip()
    return values


def make_headers(token):
    return {"Authorization": f"Token {token}"}


def extract_hooks(payload):
    if isinstance(payload, list):
        return payload
    for key in ("hooks", "hook"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    response = payload.get("response") or {}
    if isinstance(response, list):
        return response
    for key in ("hooks", "hook"):
        value = response.get(key)
        if isinstance(value, list):
            return value
    return None


def list_hooks(make_base, token):
    hooks = []
    seen = set()
    offset = 0
    pages = 0
    while pages < 20:
        query = urllib.parse.urlencode({"teamId": TEAM_ID, "pg[limit]": 100, "pg[offset]": offset})
        status, payload = json_http(
            f"{make_base}/hooks?{query}",
            headers=make_headers(token),
        )
        if status != 200:
            raise SystemExit(f"Make hooks list failed {status}")
        batch = extract_hooks(payload)
        if not isinstance(batch, list):
            raise SystemExit("Make hooks list did not return an array")
        pages += 1
        new_count = 0
        for hook in batch:
            hook_id = int(hook.get("id") or 0)
            if hook_id and hook_id not in seen:
                seen.add(hook_id)
                hooks.append(hook)
                new_count += 1
        if not batch or new_count == 0:
            break
        offset += max(len(batch), 1)
        time.sleep(0.35)
    return hooks, pages


def compact_hook(hook):
    token = str(hook.get("udid") or hook_token(hook.get("url")) or "")
    return {
        "id": int(hook.get("id") or 0),
        "name": str(hook.get("name") or ""),
        "type": str(hook.get("type") or ""),
        "enabled": hook.get("enabled") is True,
        "gone": hook.get("gone") is True,
        "scenario_id": hook.get("scenarioId"),
        "scenario_name": hook.get("scenarioName"),
        "scenario_active": hook.get("scenarioIsActive"),
        "token_hash": token_hash(token),
    }


def first_module(flow):
    return (flow or [{}])[0] if flow else {}


def inspect_scenario(make_base, token, scenario_id):
    status, payload = json_http(
        f"{make_base}/scenarios/{scenario_id}",
        headers=make_headers(token),
    )
    meta = unwrap(payload, "scenario") if status == 200 else {}
    if isinstance(meta, list):
        meta = meta[0] if meta else {}
    time.sleep(0.4)
    bp_status, bp_payload = json_http(
        f"{make_base}/scenarios/{scenario_id}/blueprint?draft=false",
        headers=make_headers(token),
    )
    blueprint = unwrap(bp_payload, "blueprint") if bp_status == 200 else {}
    first = first_module(blueprint.get("flow") or [])
    first_name = str(((first.get("metadata") or {}).get("designer") or {}).get("name") or "")
    module_name = str(first.get("module") or "")
    hook_param = (first.get("parameters") or {}).get("hook")
    scheduling = meta.get("scheduling") or {}
    return {
        "http": status,
        "blueprint_http": bp_status,
        "id": int(meta.get("id") or scenario_id),
        "name": meta.get("name"),
        "isActive": bool(meta.get("isActive")),
        "hookId": meta.get("hookId"),
        "teamId": meta.get("teamId"),
        "scheduling_type": scheduling.get("type"),
        "scheduling_interval": scheduling.get("interval"),
        "first_module": module_name,
        "first_name": first_name,
        "blueprint_hook": hook_param,
        "webhook_entrance": "webhook" in module_name.lower() or "gateway-webhook" in module_name.lower(),
    }


def orchestrators_off(make_base, token):
    result = {}
    for scenario_id, name in ORCHESTRATORS.items():
        status, payload = json_http(
            f"{make_base}/scenarios/{scenario_id}",
            headers=make_headers(token),
        )
        meta = unwrap(payload, "scenario") if status == 200 else {}
        if isinstance(meta, list):
            meta = meta[0] if meta else {}
        active = bool(meta.get("isActive"))
        result[name] = {
            "id": int(scenario_id),
            "http": status,
            "isActive": active,
            "hookId": meta.get("hookId"),
            "name": meta.get("name"),
        }
        if status != 200 or active:
            raise SystemExit(f"{name} must stay OFF; status={status} active={active}")
        time.sleep(0.35)
    return result


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM19_EVIDENCE", "/tmp/item19-webhook-map-proof.json"))
    settings = airtable_settings(pat)
    make_base = str(settings.get("MAKE_API_BASE_URL") or "").rstrip("/")
    make_token = str(settings.get("MAKE_API_TOKEN") or "").strip()
    if not make_base or not make_token:
        raise SystemExit("MAKE_API_BASE_URL or MAKE_API_TOKEN missing from Pipeline Settings")

    webhook_settings = {
        name: value
        for name, value in settings.items()
        if re.search(r"WEBHOOK", name, re.I) and name not in {"MAKE_API_TOKEN", "MAKE_API_BASE_URL"}
    }
    orch = orchestrators_off(make_base, make_token)
    hooks, hook_pages = list_hooks(make_base, make_token)
    by_token = {}
    by_id = {}
    for hook in hooks:
        compact = compact_hook(hook)
        by_id[compact["id"]] = compact
        token = str(hook.get("udid") or hook_token(hook.get("url")) or "")
        if token:
            by_token[token] = compact

    mapped = []
    unmatched = []
    identity_ok = []
    identity_mismatch = []
    for name, url in sorted(webhook_settings.items()):
        token = hook_token(url)
        expected = STARTUP.get(name, {"label": name.replace("_WEBHOOK_URL", "").replace("_", "-")})
        matched = by_token.get(token)
        row = {
            "setting": name,
            "label": expected.get("label"),
            "active_setting": True,
            "url_present": bool(token),
            "token_hash": token_hash(token),
            "expected_scenario_id": expected.get("scenario_id"),
            "expected_hook_id": expected.get("hook_id"),
            "historical_hook": bool(expected.get("historical")),
        }
        if not matched:
            unmatched.append(name)
            row.update({"matched": False, "hook_id": None, "scenario_id": None})
            mapped.append(row)
            continue
        row.update(
            {
                "matched": True,
                "hook_id": matched["id"],
                "hook_name": matched["name"],
                "hook_enabled": matched["enabled"],
                "hook_gone": matched["gone"],
                "scenario_id": matched["scenario_id"],
                "scenario_name": matched["scenario_name"],
                "scenario_active": matched["scenario_active"],
            }
        )
        expected_hook = expected.get("hook_id")
        expected_scenario = expected.get("scenario_id")
        if expected_hook and matched["id"] != expected_hook:
            if expected.get("historical"):
                row["historical_hook_id"] = expected_hook
                row["live_differs_from_historical"] = True
            else:
                identity_mismatch.append(f"{name}: hook {matched['id']} != {expected_hook}")
        elif expected_hook and matched["id"] == expected_hook:
            identity_ok.append(name)
        if expected_scenario and matched["scenario_id"] not in (None, expected_scenario):
            identity_mismatch.append(
                f"{name}: scenario {matched['scenario_id']} != {expected_scenario}"
            )
        mapped.append(row)

    inspected = {}
    inspect_ids = {R4_ID}
    inspect_ids.update(SCHEDULED_CONSUMERS)
    inspect_ids.update(PRESERVED)
    for spec in STARTUP.values():
        if spec.get("scenario_id"):
            inspect_ids.add(spec["scenario_id"])
    for scenario_id in sorted(inspect_ids):
        inspected[str(scenario_id)] = inspect_scenario(make_base, token=make_token, scenario_id=scenario_id)
        time.sleep(0.35)

    r4 = inspected[str(R4_ID)]
    preserved_live = {}
    for scenario_id, spec in PRESERVED.items():
        live = inspected[str(scenario_id)]
        preserved_live[spec["label"]] = {
            "scenario_id": scenario_id,
            "hookId": live.get("hookId"),
            "expected_hook_id": spec["hook_id"],
            "webhook_entrance": live.get("webhook_entrance"),
            "blueprint_hook": live.get("blueprint_hook"),
            "isActive": live.get("isActive"),
            "name": live.get("name"),
        }
        live_hook = live.get("hookId")
        blueprint_hook = live.get("blueprint_hook")
        if live_hook != spec["hook_id"]:
            identity_mismatch.append(f"{spec['label']}: hookId {live_hook} != {spec['hook_id']}")
        if blueprint_hook not in (None, spec["hook_id"], str(spec["hook_id"])):
            try:
                if int(blueprint_hook) != spec["hook_id"]:
                    identity_mismatch.append(f"{spec['label']}: blueprint hook {blueprint_hook} != {spec['hook_id']}")
            except (TypeError, ValueError):
                identity_mismatch.append(f"{spec['label']}: blueprint hook {blueprint_hook} != {spec['hook_id']}")

    ap1c = inspected.get("5790745") or {}
    ap1c_hook = by_id.get(2628156)
    scheduled = {
        label: {
            "id": scenario_id,
            "hookId": inspected[str(scenario_id)].get("hookId"),
            "isActive": inspected[str(scenario_id)].get("isActive"),
            "scheduling_type": inspected[str(scenario_id)].get("scheduling_type"),
            "scheduling_interval": inspected[str(scenario_id)].get("scheduling_interval"),
            "webhook_entrance": inspected[str(scenario_id)].get("webhook_entrance"),
            "name": inspected[str(scenario_id)].get("name"),
        }
        for scenario_id, label in SCHEDULED_CONSUMERS.items()
    }

    unmatched_required = [name for name in unmatched if name in STARTUP]
    map_verified = (
        not unmatched_required
        and not identity_mismatch
        and r4.get("hookId") is None
        and r4.get("isActive") is False
        and r4.get("webhook_entrance") is False
        and r4.get("scheduling_type") == "indefinitely"
        and int(r4.get("scheduling_interval") or 0) == 900
        and all(item["hookId"] is None and item["webhook_entrance"] is False for item in scheduled.values())
        and all(not item["isActive"] for item in orch.values())
        and PING_HOOK_ID in by_id
        and by_id[PING_HOOK_ID]["gone"] is False
        and by_id[PING_HOOK_ID]["enabled"] is True
        and 2653029 in by_id
    )

    ping = {"invoked": False}
    if not map_verified:
        raise SystemExit(
            "Item 19 map failed before ping: "
            + json.dumps(
                {
                    "unmatched_required": unmatched_required,
                    "unmatched": unmatched,
                    "identity_mismatch": identity_mismatch,
                    "r4_hookId": r4.get("hookId"),
                    "hooks_listed": len(hooks),
                    "ap0_listed": 2653029 in by_id,
                }
            )
        )

    ping_status, ping_payload = json_http(
        f"{make_base}/hooks/{PING_HOOK_ID}/ping",
        headers=make_headers(token=make_token),
    )
    ping_body = ping_payload if isinstance(ping_payload, dict) else {}
    ping_hook = unwrap(ping_body, "hook") if ping_status == 200 else ping_body
    if isinstance(ping_hook, list):
        ping_hook = ping_hook[0] if ping_hook else {}
    ping = {
        "invoked": True,
        "method": "GET",
        "path": f"/hooks/{PING_HOOK_ID}/ping",
        "hook_id": PING_HOOK_ID,
        "label": "I4",
        "http": ping_status,
        "attached_scenario_id": ping_hook.get("scenarioId") or by_id[PING_HOOK_ID]["scenario_id"],
        "enabled": ping_hook.get("enabled", by_id[PING_HOOK_ID]["enabled"]),
        "gone": ping_hook.get("gone", by_id[PING_HOOK_ID]["gone"]),
        "learning": ping_hook.get("learning"),
        "runs_scenario": False,
    }

    evidence = {
        "repair_item": 19,
        "checkpoint": "readonly-scenario-to-startup-webhook-map",
        "schema": "make-webhook-admin-map-v1",
        "make_scenario_runs": 0,
        "cadenced_scenarios_started": 0,
        "hooks_created": 0,
        "hooks_deleted": 0,
        "hooks_updated": 0,
        "hooks_rotated": False,
        "r4_pulsed": False,
        "team_id": TEAM_ID,
        "hooks_list_pages": hook_pages,
        "hooks_listed": len(hooks),
        "pipeline_webhook_settings": len(webhook_settings),
        "i3_decision_in_airtable": "I3_DECISION_WEBHOOK_URL" in webhook_settings,
        "unmatched_settings": unmatched,
        "unmatched_required": unmatched_required,
        "identity_mismatch": identity_mismatch,
        "identity_preserved": identity_ok,
        "r4": {
            "id": R4_ID,
            "hookId": r4.get("hookId"),
            "isActive": r4.get("isActive"),
            "scheduling_type": r4.get("scheduling_type"),
            "scheduling_interval": r4.get("scheduling_interval"),
            "webhook_entrance": r4.get("webhook_entrance"),
            "name": r4.get("name"),
        },
        "scheduled_consumers": scheduled,
        "preserved_identities": preserved_live,
        "ap1c_historical_hook": {
            "id": 2628156,
            "present": 2628156 in by_id,
            "gone": bool(ap1c_hook and ap1c_hook.get("gone")),
            "enabled": bool(ap1c_hook and ap1c_hook.get("enabled")),
            "scenario_id": ap1c_hook.get("scenario_id") if ap1c_hook else None,
            "live_scenario_hookId": ap1c.get("hookId"),
            "rotated": False,
        },
        "orchestrators": orch,
        "map": mapped,
        "ping": ping,
        "passed": False,
    }
    evidence["passed"] = bool(
        map_verified
        and ping["invoked"]
        and ping["http"] == 200
        and ping["runs_scenario"] is False
        and evidence["make_scenario_runs"] == 0
        and evidence["hooks_created"] == 0
        and evidence["hooks_rotated"] is False
        and r4.get("hookId") is None
        and not evidence["i3_decision_in_airtable"]
    )
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": evidence["passed"],
                "hooks_listed": evidence["hooks_listed"],
                "pipeline_webhook_settings": evidence["pipeline_webhook_settings"],
                "unmatched_required": unmatched_required,
                "unmatched": unmatched,
                "identity_mismatch": identity_mismatch,
                "r4_hookId": r4.get("hookId"),
                "ping_http": ping.get("http"),
                "ap1c_historical_gone": evidence["ap1c_historical_hook"]["gone"],
            },
            indent=2,
        )
    )
    if not evidence["passed"]:
        raise SystemExit("Item 19 webhook map proof failed")


if __name__ == "__main__":
    main()
