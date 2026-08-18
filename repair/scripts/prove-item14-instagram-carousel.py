#!/usr/bin/env python3
"""Prove native Instagram carousel object and AP0C–AP5C contracts without starting Make."""

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
CAROUSEL_RECORD = "recLLuOk36NXDMhCc"
AP_CAR_ORCH = "5791537"
WORKERS = {
    "5786899": "AP0C",
    "5790745": "AP1C",
    "5791231": "AP2C",
    "5791273": "AP3C",
    "5791336": "AP3P",
    "5791356": "AP4C",
    "5791396": "AP4R",
    "5791424": "AP5C",
}
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
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
)


def json_http(url, method="GET", headers=None, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item14/1.0"}
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


def load_output(pat):
    status, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{OUTPUTS_TABLE}/{CAROUSEL_RECORD}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable Output 126 read failed {status}")
    fields = payload.get("fields") or {}
    fields["id"] = payload["id"]
    return fields


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
        "exact_output_record_id": "output_record_id" in text,
        "terms": {
            "is_carousel_item": "is_carousel_item" in text,
            "media_type_carousel": "carousel" in text and "media_type" in text,
            "children": "children" in text,
            "do_not_publish": "do_not_publish" in text,
            "reconcile": "reconcil" in text,
        },
    }


def graph_media(settings, media_id, permalink=""):
    version = settings["FACEBOOK_GRAPH_API_VERSION"].strip("/")
    token = settings["FACEBOOK_PAGE_ACCESS_TOKEN"]
    ig_user = settings["INSTAGRAM_BUSINESS_ACCOUNT_ID"]
    fields = "id,media_type,permalink,children{id,media_type}"
    query = urllib.parse.urlencode({"fields": fields, "access_token": token})
    status, payload = json_http(f"https://graph.facebook.com/{version}/{media_id}?{query}")
    if status == 200 and payload.get("id"):
        payload["_lookup"] = "direct"
        return status, payload
    list_query = urllib.parse.urlencode({"fields": fields, "limit": "50", "access_token": token})
    list_status, listed = json_http(f"https://graph.facebook.com/{version}/{ig_user}/media?{list_query}")
    rows = (listed.get("data") or []) if list_status == 200 else []
    shortcode = ""
    if "/p/" in permalink:
        shortcode = permalink.split("/p/")[-1].strip("/").split("?")[0]
    match = next(
        (
            row
            for row in rows
            if str(row.get("id")) == str(media_id) or (shortcode and shortcode in str(row.get("permalink") or ""))
        ),
        None,
    )
    if match:
        match["_lookup"] = "ig_user_media"
        return 200, match
    error = (payload.get("error") or listed.get("error") or {"message": "Instagram media not readable"})
    return status if status != 200 else list_status, {
        "error": error,
        "listed_http": list_status,
        "listed_count": len(rows),
        "listed_types": [row.get("media_type") for row in rows[:12]],
    }


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM14_EVIDENCE", "/tmp/item14-instagram-carousel-proof.json"))
    settings = airtable_settings(pat)
    output = load_output(pat)
    orch = orchestrators_off(settings)
    workers = {}
    for scenario_id, label in WORKERS.items():
        workers[label] = inspect_worker(settings, scenario_id, label)
        time.sleep(0.5)
    media_id = str(output.get("IG_Carousel_Published_Media_ID") or output.get("Platform_Post_ID") or "").strip()
    airtable_permalink = str(output.get("Platform_Post_URL") or "").strip()
    graph_status, graph = graph_media(settings, media_id, airtable_permalink)
    children = ((graph.get("children") or {}).get("data") if isinstance(graph.get("children"), dict) else graph.get("children")) or []
    child_types = [row.get("media_type") for row in children if isinstance(row, dict)]
    native_terms = {
        "is_carousel_item": any(item["terms"]["is_carousel_item"] for item in workers.values()),
        "media_type_carousel": any(item["terms"]["media_type_carousel"] for item in workers.values()),
        "children": any(item["terms"]["children"] for item in workers.values()),
        "ap4r_reconcile": bool(workers.get("AP4R", {}).get("terms", {}).get("reconcile"))
        or "reconcil" in str(workers.get("AP4R", {}).get("name") or "").lower(),
    }
    evidence = {
        "repair_item": 14,
        "checkpoint": "native-carousel-object-and-contracts",
        "make_scenario_runs": 0,
        "cadenced_scenarios_started": 0,
        "public_posts_created": 0,
        "ap_car_orch_pulsed": False,
        "output": {
            "record_id": output.get("id"),
            "output_id": output.get("Output_ID"),
            "platform_output_type": output.get("Platform_Output_Type"),
            "ig_carousel_status": output.get("IG_Carousel_Status"),
            "child_count": output.get("IG_Carousel_Child_Count"),
            "last_stage": output.get("IG_Carousel_Last_Completed_Stage"),
            "media_id": media_id,
            "do_not_publish": bool(output.get("Do_Not_Publish")),
            "permalink": airtable_permalink,
        },
        "orchestrators": orch,
        "workers": {
            label: {
                "id": item["id"],
                "name": item["name"],
                "isActive": item["isActive"],
                "webhook_entrance": item["webhook_entrance"],
                "exact_output_record_id": item["exact_output_record_id"],
                "terms": item["terms"],
            }
            for label, item in workers.items()
        },
        "native_contract_terms": native_terms,
        "graph": {
            "http": graph_status,
            "id": graph.get("id"),
            "media_type": graph.get("media_type"),
            "permalink": graph.get("permalink") or airtable_permalink,
            "lookup": graph.get("_lookup"),
            "listed_count": graph.get("listed_count"),
            "child_count": len(children),
            "child_media_types": child_types,
            "error": (graph.get("error") or {}).get("message") if isinstance(graph.get("error"), dict) else graph.get("error"),
        },
        "passed": False,
    }
    permalink = str(graph.get("permalink") or airtable_permalink).lower()
    native_feed_url = "/instagram.com/p/" in permalink and "/reel/" not in permalink
    graph_ok = (
        graph_status == 200
        and graph.get("media_type") == "CAROUSEL_ALBUM"
        and len(children) >= 2
        and not any(kind in ("VIDEO", "REELS") for kind in child_types)
    )
    airtable_ok = (
        str(output.get("IG_Carousel_Status") or "") == "Published"
        and str(output.get("IG_Carousel_Last_Completed_Stage") or "") == "AP5C"
        and int(output.get("IG_Carousel_Child_Count") or 0) >= 2
        and native_feed_url
    )
    workers_ok = all(
        item["isActive"] and item["webhook_entrance"] and item["exact_output_record_id"]
        for item in workers.values()
    )
    evidence["passed"] = bool(
        evidence["make_scenario_runs"] == 0
        and evidence["cadenced_scenarios_started"] == 0
        and evidence["public_posts_created"] == 0
        and not orch["AP-CAR-ORCH"]["isActive"]
        and str(output.get("Platform_Output_Type") or "") == "Instagram Carousel"
        and native_feed_url
        and (graph_ok or airtable_ok)
        and native_terms["is_carousel_item"]
        and native_terms["media_type_carousel"]
        and native_terms["children"]
        and native_terms["ap4r_reconcile"]
        and workers_ok
    )
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "path": str(out), "media_type": graph.get("media_type"), "children": len(children)}, indent=2))
    if not evidence["passed"]:
        raise SystemExit("Item 14 Instagram carousel proof failed")


if __name__ == "__main__":
    main()
