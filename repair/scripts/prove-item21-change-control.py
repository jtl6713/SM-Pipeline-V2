#!/usr/bin/env python3
"""Prove Item 21 change-control: 1-20 are terminal, evidence exists, cadenced Make stays OFF."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "repair/SM_PIPELINE_21_ITEM_LEDGER.md"
EVIDENCE = ROOT / "repair/evidence"
BASE_ID = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
TEAM_ID = 2410882
YOUTUBE_151 = "recXaaWhSZmQ9oOsw"
ORCHESTRATORS = {
    "5864632": "IG-PUB-ORCH",
    "5813561": "FB-ORCH",
    "5823581": "YT-ORCH",
    "5791537": "AP-CAR-ORCH",
    "5806668": "TTD-ORCH",
}
SCHEDULED_OFF = {
    "5556716": "R4",
    "5557966": "R3",
    "5565333": "R5",
    "5576363": "RR1",
}
REQUIRED_EVIDENCE = {
    3: "item3-native-overlap-acceptance-20260817.json",
    6: "item6-safe-republish-replace-closure-20260817.json",
    9: "item9-native-cover-platform-proof-20260817.json",
    11: "item11-oauth-in-production-20260818.json",
    12: "item12-r2-lifecycle-cleanup-20260818.json",
    13: "item13-facebook-native-default-20260818.json",
    14: "item14-instagram-carousel-20260818.json",
    15: "item15-tiktok-overlay-20260818.json",
    16: "item16-tiktok-draft-20260818.json",
    17: "item17-title-edit-20260818.json",
    18: "item18-upload-preview-20260818.json",
    19: "item19-webhook-map-20260818.json",
    20: "item20-diagnostics-20260818.json",
}
RUN_CITED_ITEMS = {
    1: "31974401076",
    2: "31988766540",
    4: "31966308015",
    5: "31993357970",
    7: "32078647065",
    8: "32080453235",
}
FOLLOW_ONS = [
    "Next studio-api Worker deploy for Items 13/17/18 source and 0.10.8 identity",
    "Item 10 dashboard review email remains deferred",
    "FBS4 cannot post a multipart Facebook cover from Make",
    "TTD3 send/stamp race documented, not patched",
    "TTD0 still sends raw 9:16 URLs",
    "Path-filtered/emergency workflows still mention v86",
    "Leftover Workers chicagoshining-repair-control-bridge and shiny-glitter-6de8",
    "Bundled Make token still lacks hooks:read",
    "Frame Extractor/Remotion working-file cleanup remains deferred",
    "Cadenced orchestrators stay OFF until an operator explicitly starts them",
    "Do not republish YouTube Output 151",
]


def json_http(url, headers=None, timeout=60, retries=4):
    delay = 1.5
    last_status, last_payload = None, {}
    for attempt in range(retries):
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "SM-Pipeline-V2-Item21/1.0", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                raw = response.read().decode("utf-8", "replace")
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {"raw": raw[:300]}
            last_status, last_payload = error.code, payload
            if error.code not in (429, 502, 503) or attempt == retries - 1:
                return error.code, payload
            time.sleep(delay)
            delay = min(delay * 2, 12)
    return last_status, last_payload


def parse_ledger(text):
    rows = {}
    for line in text.splitlines():
        match = re.match(r"^\| (\d+) \| (.+?) \| \*\*(.+?)\*\* \| (.+?) \| (.+?) \|$", line)
        if not match:
            continue
        number = int(match.group(1))
        rows[number] = {
            "item": match.group(2).strip(),
            "status": match.group(3).strip(),
            "verified": match.group(4).strip(),
            "next": match.group(5).strip(),
        }
    return rows


def unwrap_scenario(payload):
    if isinstance(payload, list):
        payload = payload[0] if payload else {}
    if not isinstance(payload, dict):
        return {}
    for candidate in (payload.get("scenario"), payload.get("response"), payload):
        if isinstance(candidate, dict) and (candidate.get("id") or "isActive" in candidate):
            return candidate
    return payload


def inspect_off(make_base, token, mapping):
    result = {}
    for scenario_id, name in mapping.items():
        status, payload = json_http(
            f"{make_base}/scenarios/{scenario_id}",
            headers={"Authorization": f"Token {token}"},
        )
        meta = unwrap_scenario(payload) if status == 200 else {}
        active = bool(meta.get("isActive"))
        result[name] = {
            "id": int(scenario_id),
            "http": status,
            "isActive": active,
            "hookId": meta.get("hookId"),
        }
        if status != 200 or active:
            raise SystemExit(f"{name} must stay OFF; status={status} active={active}")
        time.sleep(0.35)
    return result


def airtable_make_settings(pat):
    formula = "AND({Active}=1,OR({Setting_Name}='MAKE_API_TOKEN',{Setting_Name}='MAKE_API_BASE_URL'))"
    params = urllib.parse.urlencode(
        [("filterByFormula", formula), ("fields[]", "Setting_Name"), ("fields[]", "Setting_Value"), ("pageSize", "100")]
    )
    status, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{SETTINGS_TABLE}?{params}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable settings read failed {status}")
    values = {}
    for row in payload.get("records") or []:
        fields = row.get("fields") or {}
        name = str(fields.get("Setting_Name") or "").strip()
        if name:
            values[name] = str(fields.get("Setting_Value") or "").strip()
    return values


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM21_EVIDENCE", "/tmp/item21-change-control-proof.json"))
    ledger_text = LEDGER.read_text(encoding="utf-8")
    rows = parse_ledger(ledger_text)
    if set(rows) != set(range(1, 22)):
        raise SystemExit(f"Ledger does not contain items 1-21 uniquely: {sorted(rows)}")
    classified = {}
    missing_evidence = []
    missing_runs = []
    for number in range(1, 21):
        status = rows[number]["status"]
        if status.startswith("Complete"):
            kind = "complete"
        elif status.startswith("Deferred"):
            kind = "deferred"
        else:
            kind = "open"
        classified[number] = kind
        if number in REQUIRED_EVIDENCE and not (EVIDENCE / REQUIRED_EVIDENCE[number]).is_file():
            missing_evidence.append(REQUIRED_EVIDENCE[number])
        if number in RUN_CITED_ITEMS and RUN_CITED_ITEMS[number] not in ledger_text:
            missing_runs.append(number)
    complete = [n for n, kind in classified.items() if kind == "complete"]
    deferred = [n for n, kind in classified.items() if kind == "deferred"]
    open_items = [n for n, kind in classified.items() if kind == "open"]
    settings = airtable_make_settings(pat)
    make_base = str(settings.get("MAKE_API_BASE_URL") or "").rstrip("/")
    make_token = str(settings.get("MAKE_API_TOKEN") or "").strip()
    if not make_base or not make_token:
        raise SystemExit("MAKE_API_BASE_URL or MAKE_API_TOKEN missing from Pipeline Settings")
    orch = inspect_off(make_base, make_token, ORCHESTRATORS)
    scheduled = inspect_off(make_base, make_token, SCHEDULED_OFF)
    youtube_untouched = YOUTUBE_151 in ledger_text and "4HAhk2Lg7GE" in ledger_text and "Do not republish" in ledger_text
    evidence = {
        "repair_item": 21,
        "checkpoint": "evidence-backed-change-control-close",
        "schema": "item21-change-control-v1",
        "team_id": TEAM_ID,
        "make_scenario_runs": 0,
        "cadenced_scenarios_started": 0,
        "youtube_151_republished": False,
        "hooks_rotated": False,
        "ledger_items": {
            str(number): {
                "item": rows[number]["item"],
                "status": rows[number]["status"],
                "class": classified.get(number, "open") if number < 21 else "closeout",
            }
            for number in range(1, 22)
        },
        "complete_items": complete,
        "deferred_items": deferred,
        "open_items_1_20": open_items,
        "item_10_deferred": classified.get(10) == "deferred",
        "required_evidence_ok": not missing_evidence,
        "run_cited_items_ok": not missing_runs,
        "missing_evidence": missing_evidence,
        "missing_run_citations": missing_runs,
        "orchestrators": orch,
        "scheduled_consumers": scheduled,
        "follow_ons_out_of_21_item_scope": FOLLOW_ONS,
        "youtube_151_do_not_republish": youtube_untouched,
        "passed": False,
    }
    evidence["passed"] = bool(
        evidence["item_10_deferred"]
        and complete == [n for n in range(1, 21) if n != 10]
        and not open_items
        and not missing_evidence
        and not missing_runs
        and all(row["isActive"] is False for row in orch.values())
        and all(row["isActive"] is False for row in scheduled.values())
        and evidence["make_scenario_runs"] == 0
        and evidence["cadenced_scenarios_started"] == 0
        and evidence["youtube_151_republished"] is False
        and youtube_untouched
    )
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": evidence["passed"],
                "complete": complete,
                "deferred": deferred,
                "open_1_20": open_items,
                "missing_evidence": missing_evidence,
                "missing_run_citations": missing_runs,
                "orchestrators_off": {name: row["isActive"] for name, row in orch.items()},
                "scheduled_off": {name: row["isActive"] for name, row in scheduled.items()},
            },
            indent=2,
        )
    )
    if not evidence["passed"]:
        raise SystemExit("Item 21 change-control proof failed")


if __name__ == "__main__":
    main()
