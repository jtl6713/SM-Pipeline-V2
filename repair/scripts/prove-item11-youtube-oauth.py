#!/usr/bin/env python3
"""Prove YouTube OAuth refresh and private video read without uploading or starting Make."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path


BASE_ID = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
YT_ORCH = "5823581"
VIDEO_ID = "4HAhk2Lg7GE"


def json_http(url, method="GET", headers=None, body=None, timeout=30):
    data = None if body is None else json.dumps(body).encode()
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item11/1.0"}
    request_headers.update(headers or {})
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
    formula = (
        "AND({Active}=1,OR("
        "{Setting_Name}='MAKE_API_TOKEN',"
        "{Setting_Name}='MAKE_API_BASE_URL',"
        "{Setting_Name}='YOUTUBE_UPLOAD_SERVICE_URL',"
        "{Setting_Name}='YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET'"
        "))"
    )
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


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM11_EVIDENCE", "/tmp/item11-oauth-proof.json"))
    settings = airtable_settings(pat)
    make_base = settings["MAKE_API_BASE_URL"].rstrip("/")
    make_token = settings["MAKE_API_TOKEN"]
    uploader = settings["YOUTUBE_UPLOAD_SERVICE_URL"].rstrip("/")
    secret = settings["YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET"]
    orch_status, orch = json_http(
        f"{make_base}/scenarios/{YT_ORCH}",
        headers={"Authorization": f"Token {make_token}", "Content-Type": "application/json"},
    )
    meta = unwrap(orch, "scenario") if orch_status == 200 else {}
    if orch_status != 200 or meta.get("isActive"):
        raise SystemExit(f"YT-ORCH must stay OFF; status={orch_status} active={meta.get('isActive')}")
    auth = {"X-SM-Pipeline-Key": secret}
    health_status, health = json_http(f"{uploader}/health")
    oauth_status, oauth = json_http(f"{uploader}/youtube/oauth/status", headers=auth)
    video_status, video = json_http(f"{uploader}/youtube/videos/{VIDEO_ID}", headers=auth)
    item = (video.get("items") or [{}])[0] if isinstance(video, dict) else {}
    evidence = {
        "repair_item": 11,
        "checkpoint": "oauth-refresh-no-republish",
        "yt_orch_active": False,
        "make_scenario_runs": 0,
        "upload_attempted": False,
        "health_status": health_status,
        "health": health,
        "oauth_status_http": oauth_status,
        "oauth": {
            "ok": oauth.get("ok"),
            "refresh_ok": oauth.get("refresh_ok"),
            "truncated": oauth.get("truncated"),
            "refresh_token_length": oauth.get("refresh_token_length"),
            "access_token_expires_in": oauth.get("access_token_expires_in"),
            "version": oauth.get("version"),
            "error": oauth.get("error"),
            "durable_requirement": oauth.get("durable_requirement"),
        },
        "video_status_http": video_status,
        "video": {
            "id": item.get("id"),
            "privacyStatus": ((item.get("status") or {}).get("privacyStatus")),
            "title": ((item.get("snippet") or {}).get("title")),
        },
        "passed": False,
    }
    evidence["passed"] = bool(
        health.get("ok")
        and oauth.get("refresh_ok")
        and not oauth.get("truncated")
        and int(oauth.get("refresh_token_length") or 0) >= 40
        and item.get("id") == VIDEO_ID
        and not meta.get("isActive")
        and evidence["upload_attempted"] is False
    )
    out.write_text(json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(evidence, indent=2, sort_keys=True))
    if not evidence["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    import urllib.error

    main()
