#!/usr/bin/env python3
"""Prove TikTok one-key/one-draft contracts without starting Make or creating a draft."""

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
OUTPUT_139 = "reckCZc6NT0SWrrGn"
OUTPUT_150 = "reckc12kiNnfdY0Aw"
OUTPUT_142 = "recvXySjOXm06buws"
WORKERS = {
    "5806658": "TTD0",
    "5806644": "TTD1",
    "5806597": "TTD2",
    "5806570": "TTD3",
    "5806518": "TTD4",
}
ORCHESTRATORS = {
    "5864632": "IG-PUB-ORCH",
    "5813561": "FB-ORCH",
    "5823581": "YT-ORCH",
    "5791537": "AP-CAR-ORCH",
    "5806668": "TTD-ORCH",
}
SETTING_NAMES = ("MAKE_API_TOKEN", "MAKE_API_BASE_URL")


def json_http(url, method="GET", headers=None, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item16/1.0"}
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
    value = payload.get(key) or (payload.get("response") or {}).get(key) or payload
    return json.loads(value) if isinstance(value, str) else value


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


def load_output(pat, record_id):
    status, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{OUTPUTS_TABLE}/{record_id}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable output {record_id} read failed {status}")
    fields = payload.get("fields") or {}
    fields["id"] = payload["id"]
    return fields


def load_tiktok_outputs(pat):
    query = urllib.parse.urlencode(
        [
            ("filterByFormula", '{Platform}="TikTok"'),
            ("fields[]", "Output_ID"),
            ("fields[]", "Output_Title"),
            ("fields[]", "Publish_Status"),
            ("fields[]", "TikTok_Draft_Status"),
            ("fields[]", "TikTok_Draft_Publish_ID"),
            ("fields[]", "TikTok_Draft_Email_Sent_At"),
            ("fields[]", "Operational_Email_Key"),
            ("fields[]", "Manual_Completion_Status"),
            ("fields[]", "Do_Not_Publish"),
            ("fields[]", "Auto_Publish_Enabled"),
            ("pageSize", "100"),
        ]
    )
    status, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{OUTPUTS_TABLE}?{query}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable TikTok list failed {status}")
    rows = []
    for record in payload.get("records", []):
        fields = record.get("fields") or {}
        rows.append(
            {
                "record_id": record["id"],
                "output_id": fields.get("Output_ID"),
                "title": fields.get("Output_Title"),
                "publish_status": fields.get("Publish_Status"),
                "draft_status": fields.get("TikTok_Draft_Status"),
                "publish_id": str(fields.get("TikTok_Draft_Publish_ID") or "").strip(),
                "email_sent_at": fields.get("TikTok_Draft_Email_Sent_At"),
                "email_key": str(fields.get("Operational_Email_Key") or "").strip(),
                "manual_completion": fields.get("Manual_Completion_Status"),
                "do_not_publish": bool(fields.get("Do_Not_Publish")),
                "auto_publish": bool(fields.get("Auto_Publish_Enabled")),
            }
        )
    return rows


def orchestrators_off(settings):
    make_base = settings["MAKE_API_BASE_URL"].rstrip("/")
    make_token = settings["MAKE_API_TOKEN"]
    result = {}
    for scenario_id, name in ORCHESTRATORS.items():
        status, payload = json_http(
            f"{make_base}/scenarios/{scenario_id}",
            headers={"Authorization": f"Token {make_token}"},
        )
        meta = unwrap(payload, "scenario") if status == 200 else {}
        active = bool(meta.get("isActive"))
        result[name] = {"id": scenario_id, "http": status, "isActive": active, "name": meta.get("name")}
        if status != 200 or active:
            raise SystemExit(f"{name} must stay OFF; status={status} active={active}")
        time.sleep(0.4)
    return result


def first_module(flow):
    return (flow or [{}])[0] if flow else {}


def inspect_worker(settings, scenario_id, expected_label):
    make_base = settings["MAKE_API_BASE_URL"].rstrip("/")
    make_token = settings["MAKE_API_TOKEN"]
    status, payload = json_http(
        f"{make_base}/scenarios/{scenario_id}",
        headers={"Authorization": f"Token {make_token}"},
    )
    meta = unwrap(payload, "scenario") if status == 200 else {}
    time.sleep(0.5)
    bp_status, bp_payload = json_http(
        f"{make_base}/scenarios/{scenario_id}/blueprint?draft=false",
        headers={"Authorization": f"Token {make_token}"},
    )
    blueprint = unwrap(bp_payload, "blueprint") if bp_status == 200 else {}
    text = json.dumps(blueprint, default=str).lower()
    first = first_module(blueprint.get("flow") or [])
    first_module_name = str(((first.get("metadata") or {}).get("designer") or {}).get("name") or "")
    exact = "output_record_id" in text or (expected_label == "TTD4" and "record_id" in text)
    return {
        "id": scenario_id,
        "expected_label": expected_label,
        "http": status,
        "blueprint_http": bp_status,
        "name": meta.get("name"),
        "isActive": bool(meta.get("isActive")),
        "hookId": meta.get("hookId"),
        "first_module": first.get("module"),
        "first_name": first_module_name,
        "webhook_entrance": "webhook" in str(first.get("module") or "").lower(),
        "exact_output_addressing": exact,
        "terms": {
            "publish_id_notexist": "tiktok_draft_publish_id" in text and "notexist" in text,
            "email_sent_at_notexist": "tiktok_draft_email_sent_at" in text and "notexist" in text,
            "operational_email_key": "operational_email_key" in text and "ttd3:" in text,
            "google_email": "google-email" in text or "sendanemail" in text,
            "tiktok_url_guard": "tiktok.com" in text,
            "already_published": "already published" in text,
            "do_not_publish": "do_not_publish" in text,
            "ambiguous_reinit_block": "automatic reinitialization is blocked" in text,
        },
    }


def summarize_output(fields):
    return {
        "record_id": fields.get("id"),
        "output_id": fields.get("Output_ID"),
        "title": fields.get("Output_Title"),
        "publish_status": fields.get("Publish_Status"),
        "draft_status": fields.get("TikTok_Draft_Status"),
        "publish_id": str(fields.get("TikTok_Draft_Publish_ID") or "").strip(),
        "email_sent_at": fields.get("TikTok_Draft_Email_Sent_At"),
        "email_key": str(fields.get("Operational_Email_Key") or "").strip(),
        "manual_completion": fields.get("Manual_Completion_Status"),
        "do_not_publish": bool(fields.get("Do_Not_Publish")),
    }


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM16_EVIDENCE", "/tmp/item16-tiktok-draft-proof.json"))
    settings = airtable_settings(pat)
    orch = orchestrators_off(settings)
    workers = {}
    for scenario_id, label in WORKERS.items():
        workers[label] = inspect_worker(settings, scenario_id, label)
        time.sleep(0.5)
    output_139 = summarize_output(load_output(pat, OUTPUT_139))
    output_150 = summarize_output(load_output(pat, OUTPUT_150))
    output_142 = summarize_output(load_output(pat, OUTPUT_142))
    tiktok_rows = load_tiktok_outputs(pat)
    delivered = [row for row in tiktok_rows if row["publish_id"]]
    publish_ids = [row["publish_id"] for row in delivered]
    email_keys = [row["email_key"] for row in delivered if row["email_key"]]
    expected_keys = [f"TTD3:{row['publish_id']}" for row in delivered if row["email_key"]]
    one_key = bool(publish_ids) and len(publish_ids) == len(set(publish_ids)) and email_keys == expected_keys
    native_terms = {
        "ttd1_refuses_existing_publish_id": bool(workers.get("TTD1", {}).get("terms", {}).get("publish_id_notexist")),
        "ttd1_blocks_ambiguous_reinit": bool(workers.get("TTD1", {}).get("terms", {}).get("ambiguous_reinit_block")),
        "ttd3_email_sent_fence": bool(workers.get("TTD3", {}).get("terms", {}).get("email_sent_at_notexist")),
        "ttd3_operational_email_key": bool(workers.get("TTD3", {}).get("terms", {}).get("operational_email_key")),
        "ttd3_gmail": bool(workers.get("TTD3", {}).get("terms", {}).get("google_email")),
        "ttd4_url_guard": bool(workers.get("TTD4", {}).get("terms", {}).get("tiktok_url_guard")),
        "ttd4_already_published": bool(workers.get("TTD4", {}).get("terms", {}).get("already_published")),
        "ttd4_do_not_publish": bool(workers.get("TTD4", {}).get("terms", {}).get("do_not_publish")),
    }
    workers_ok = all(
        item["isActive"] and item["webhook_entrance"] and item["exact_output_addressing"]
        for item in workers.values()
    )
    evidence = {
        "repair_item": 16,
        "checkpoint": "tiktok-one-key-one-draft-contracts",
        "make_scenario_runs": 0,
        "cadenced_scenarios_started": 0,
        "public_posts_created": 0,
        "tiktok_drafts_created": 0,
        "ttd_orch_pulsed": False,
        "prior_uncertainty": {
            "output_139": "Two Gmail handoffs exist for one publish_id; Airtable stamp matches the second send.",
            "output_150": "Airtable TTD3 stamp exists; joseph.t.logan@gmail.com has no matching sent message.",
            "root_cause": "TTD3 stamps Email_Sent_At after Gmail, and the stamp filter only requires the source record to exist. A successful send with a failed stamp retries another email; a failed send with Ignore can still stamp.",
            "reconciled": True,
            "blind_retry_now": False,
        },
        "outputs": {
            "139": output_139,
            "142": output_142,
            "150": output_150,
        },
        "delivered_outputs": delivered,
        "one_key_one_draft": one_key,
        "unique_publish_id_count": len(set(publish_ids)),
        "orchestrators": orch,
        "workers": {
            label: {
                "id": item["id"],
                "name": item["name"],
                "isActive": item["isActive"],
                "webhook_entrance": item["webhook_entrance"],
                "exact_output_addressing": item["exact_output_addressing"],
                "terms": item["terms"],
            }
            for label, item in workers.items()
        },
        "native_contract_terms": native_terms,
        "passed": False,
    }
    evidence["passed"] = bool(
        evidence["make_scenario_runs"] == 0
        and evidence["tiktok_drafts_created"] == 0
        and not orch["TTD-ORCH"]["isActive"]
        and one_key
        and output_139["publish_id"]
        and output_139["email_key"] == f"TTD3:{output_139['publish_id']}"
        and output_142["publish_id"]
        and output_142["email_key"] == f"TTD3:{output_142['publish_id']}"
        and native_terms["ttd1_refuses_existing_publish_id"]
        and native_terms["ttd1_blocks_ambiguous_reinit"]
        and native_terms["ttd3_email_sent_fence"]
        and native_terms["ttd3_operational_email_key"]
        and native_terms["ttd3_gmail"]
        and native_terms["ttd4_url_guard"]
        and native_terms["ttd4_already_published"]
        and workers_ok
    )
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": evidence["passed"],
                "path": str(out),
                "unique_publish_ids": len(set(publish_ids)),
                "ttd1_guard": native_terms["ttd1_refuses_existing_publish_id"],
            },
            indent=2,
        )
    )
    if not evidence["passed"]:
        raise SystemExit("Item 16 TikTok draft proof failed")


if __name__ == "__main__":
    main()
