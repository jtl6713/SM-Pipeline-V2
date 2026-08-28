#!/usr/bin/env python3
"""Create Studio Insights Airtable tables for persistent analytics learning.

Run once against the ChicagoShining base after setting:
  export AIRTABLE_PAT=...
  export AIRTABLE_BASE_ID=appe33zkZn35yirTL

Then add the returned table IDs to the Studio API Worker environment
(optional — the Worker already defaults to the bootstrap IDs below):
  STUDIO_INSIGHTS_OBSERVATIONS_TABLE_ID=tblcDNIZs125iVi2B
  STUDIO_INSIGHTS_LEARNED_TABLE_ID=tblb6LfRv7CemHHN6
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "appe33zkZn35yirTL")
PAT = os.environ.get("AIRTABLE_PAT", "")

OBSERVATIONS_TABLE = {
    "name": "Studio Insights Observations",
    "description": "Historical post observations from similar Chicago accounts and first-party publishes.",
    "fields": [
        {"name": "Observation_Key", "type": "singleLineText"},
        {"name": "Source", "type": "singleSelect", "options": {"choices": [
            {"name": "similar_account"}, {"name": "first_party"},
        ]}},
        {"name": "Profile", "type": "singleSelect", "options": {"choices": [
            {"name": "chicago"}, {"name": "la"}, {"name": "nyc"},
        ]}},
        {"name": "Platform", "type": "singleLineText"},
        {"name": "Account_Handle", "type": "singleLineText"},
        {"name": "Platform_Output_Type", "type": "singleLineText"},
        {"name": "Published_At", "type": "dateTime", "options": {"timeZone": "America/Chicago", "dateFormat": {"name": "iso"}, "timeFormat": {"name": "24hour"}}},
        {"name": "Chicago_Weekday", "type": "singleSelect", "options": {"choices": [
            {"name": day} for day in ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        ]}},
        {"name": "Chicago_Hour", "type": "number", "options": {"precision": 0}},
        {"name": "Chicago_Season", "type": "singleSelect", "options": {"choices": [
            {"name": s} for s in ["winter", "spring", "summer", "fall"]
        ]}},
        {"name": "Views", "type": "number", "options": {"precision": 0}},
        {"name": "Likes", "type": "number", "options": {"precision": 0}},
        {"name": "Comments", "type": "number", "options": {"precision": 0}},
        {"name": "Engagement_Score", "type": "number", "options": {"precision": 2}},
        {"name": "Caption", "type": "multilineText"},
        {"name": "Caption_Length", "type": "number", "options": {"precision": 0}},
        {"name": "Hashtag_Count", "type": "number", "options": {"precision": 0}},
        {"name": "Emoji_Count", "type": "number", "options": {"precision": 0}},
        {"name": "Caption_Has_CTA", "type": "checkbox", "options": {"icon": "check", "color": "greenBright"}},
        {"name": "Caption_Has_Question", "type": "checkbox", "options": {"icon": "check", "color": "blueBright"}},
        {"name": "External_Post_ID", "type": "singleLineText"},
        {"name": "Fetched_At", "type": "dateTime", "options": {"timeZone": "utc", "dateFormat": {"name": "iso"}, "timeFormat": {"name": "24hour"}}},
        {"name": "Active", "type": "checkbox", "options": {"icon": "check", "color": "greenBright"}},
    ],
}

LEARNED_TABLE = {
    "name": "Studio Insights Learned",
    "description": "Aggregated posting-time and caption recommendations per profile, platform, and season.",
    "fields": [
        {"name": "Learned_Key", "type": "singleLineText"},
        {"name": "Profile", "type": "singleSelect", "options": {"choices": [
            {"name": "chicago"}, {"name": "la"}, {"name": "nyc"},
        ]}},
        {"name": "Platform", "type": "singleLineText"},
        {"name": "Output_Type", "type": "singleLineText"},
        {"name": "Season", "type": "singleSelect", "options": {"choices": [
            {"name": s} for s in ["winter", "spring", "summer", "fall", "all"]
        ]}},
        {"name": "Metric_Type", "type": "singleSelect", "options": {"choices": [
            {"name": "post_time"}, {"name": "caption"},
        ]}},
        {"name": "Days", "type": "singleLineText"},
        {"name": "Windows", "type": "singleLineText"},
        {"name": "Label", "type": "singleLineText"},
        {"name": "Caption_Patterns_JSON", "type": "multilineText"},
        {"name": "Sample_Size", "type": "number", "options": {"precision": 0}},
        {"name": "Score", "type": "number", "options": {"precision": 2}},
        {"name": "Source", "type": "singleSelect", "options": {"choices": [
            {"name": "first_party"}, {"name": "similar_accounts"}, {"name": "blended"}, {"name": "industry_default"},
        ]}},
        {"name": "As_Of", "type": "dateTime", "options": {"timeZone": "utc", "dateFormat": {"name": "iso"}, "timeFormat": {"name": "24hour"}}},
    ],
}


def meta_request(method: str, path: str, payload: dict | None = None) -> dict:
    url = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}{path}"
    data = None
    headers = {"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Airtable meta API {method} {path} failed ({exc.code}): {body}") from exc


def list_tables() -> list[dict]:
    body = meta_request("GET", "/tables")
    return body.get("tables") or []


def create_table(spec: dict) -> dict:
    return meta_request("POST", "/tables", spec)


def main() -> int:
    if not PAT:
        print("Set AIRTABLE_PAT before running.", file=sys.stderr)
        return 1
    existing = {table.get("name"): table for table in list_tables()}
    created = {}
    for spec in (OBSERVATIONS_TABLE, LEARNED_TABLE):
        name = spec["name"]
        if name in existing:
            created[name] = existing[name]["id"]
            print(f"exists: {name} -> {existing[name]['id']}")
            continue
        result = create_table(spec)
        created[name] = result["id"]
        print(f"created: {name} -> {result['id']}")
    print("\nWorker env vars:")
    print(f"STUDIO_INSIGHTS_OBSERVATIONS_TABLE_ID={created[OBSERVATIONS_TABLE['name']]}")
    print(f"STUDIO_INSIGHTS_LEARNED_TABLE_ID={created[LEARNED_TABLE['name']]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
