#!/usr/bin/env python3
"""One-shot guarded AP1C resume for 7856 and 7043; do not repeat generic failure retries."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "appe33zkZn35yirTL"
OUTPUT_TABLE = "tblrlPeboBthkplH0"
SLIDE_TABLE = "tblcnQDBvUngpjDED"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
TARGETS = {
    "recYjLdlux4hAvZts": 7856,
    "recr1riuXe2jYA5df": 7043,
}
PAT = os.environ["AIRTABLE_PAT"]
HEADERS = {"Authorization": "Bearer " + PAT, "Accept": "application/json"}


def fetch(url: str, *, headers: dict | None = None, data: bytes | None = None) -> dict:
    request = urllib.request.Request(url, headers=headers or HEADERS, data=data)
    with urllib.request.urlopen(request, timeout=35) as response:
        body = response.read(2_000_000)
        if data is not None and response.status not in (200, 201, 202):
            raise RuntimeError(f"Unexpected webhook HTTP {response.status}")
    try:
        return json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return {"ack": body.decode("utf-8", "replace")[:150]}


def record(table: str, rec_id: str) -> dict:
    return fetch(f"https://api.airtable.com/v0/{BASE}/{table}/{rec_id}")["fields"]


def values_setting(*keys: str) -> dict[str, str]:
    wanted = set(keys)
    formula = "OR(" + ",".join("{Setting_Name}='" + x + "'" for x in wanted) + ")"
    params = urllib.parse.urlencode({"filterByFormula": formula, "pageSize": 100})
    result = fetch(f"https://api.airtable.com/v0/{BASE}/{SETTINGS_TABLE}?{params}")
    rows = {
        row["fields"].get("Setting_Name"): row["fields"].get("Setting_Value")
        for row in result.get("records", [])
        if row.get("fields", {}).get("Active") is True
    }
    if any(not rows.get(k) for k in keys):
        raise RuntimeError("One or more required active Make integration settings unavailable")
    return rows


def preflight(rec_id: str, output_num: int) -> str:
    fields = record(OUTPUT_TABLE, rec_id)
    if int(fields.get("Output_ID", 0)) != output_num:
        raise RuntimeError("Output record identity changed")
    if fields.get("IG_Carousel_Status") != "Assets Ready":
        return "SKIP:" + str(fields.get("IG_Carousel_Status"))
    if (
        "Approved" not in str(fields.get("Output_Status", ""))
        or fields.get("Publish_Method") != "Automated"
        or fields.get("Auto_Publish_Enabled") is not True
        or fields.get("Do_Not_Publish")
        or fields.get("Published_At")
        or fields.get("Platform_Post_ID")
        or fields.get("Publish_Locked_At")
        or fields.get("IG_Carousel_Parent_Container_ID")
        or fields.get("IG_Carousel_Published_Media_ID")
        or fields.get("IG_Carousel_Retry_Count", 0)
    ):
        raise RuntimeError(f"Unsafe approval, lock, publication, or retry evidence on {output_num}")
    expected = json.loads(fields.get("Render_Clip_List_JSON", "[]"))
    linked = fields.get("Carousel Slides", [])
    if len(expected) != 4 or len(linked) != 4:
        raise RuntimeError(f"Source set incomplete for {output_num}")
    if len(set(x["googleDriveFileId"] for x in expected)) != 4:
        raise RuntimeError("Nonunique approved source file IDs")
    for idx, (slide_id, selected) in enumerate(zip(linked, expected)):
        slide = record(SLIDE_TABLE, slide_id)
        url = f"https://media.chicagoshining.com/studio/previews/lettered/{rec_id}/{idx}.jpg"
        if (
            int(slide.get("Current Order") or 0) != idx + 1
            or slide.get("Google Drive File ID") != selected["googleDriveFileId"]
            or any(slide.get(name) != url for name in (
                "IG_Public_Asset_URL", "Final Image URL", "Current Image URL",
                "Watermarked Image URL", "Asset_4x5_Public_URL"
            ))
            or selected.get("url") != url
            or slide.get("Deleted From Carousel")
            or slide.get("Approved For Final") is not True
            or slide.get("IG_Public_Asset_Status") != "Ready"
            or slide.get("IG_Child_Container_ID")
        ):
            raise RuntimeError(f"Approved-media mismatch for {output_num} slide {idx+1}")
    return "ELIGIBLE"


def main() -> None:
    snapshot = {r: preflight(r, n) for r, n in TARGETS.items()}
    print("AP1C_PREFLIGHT", json.dumps({TARGETS[k]: v for k, v in snapshot.items()}))
    if any(v not in ("ELIGIBLE",) and not v.startswith("SKIP:") for v in snapshot.values()):
        raise RuntimeError("Unsafe mixed preflight")
    active = [r for r, v in snapshot.items() if v == "ELIGIBLE"]
    if not active:
        print("AP1C_NO_WORK_ALREADY_ADVANCED")
        return

    settings = values_setting("AP1C_WEBHOOK_URL", "MAKE_API_BASE_URL", "MAKE_API_TOKEN")
    hook = str(settings["AP1C_WEBHOOK_URL"]).strip()
    parsed = urllib.parse.urlparse(hook)
    if parsed.scheme != "https" or parsed.hostname != "hook.us2.make.com" or not parsed.path.strip("/"):
        raise RuntimeError("AP1C webhook destination unexpectedly changed")
    base = str(settings["MAKE_API_BASE_URL"]).rstrip("/")
    if not base.startswith("https://"):
        raise RuntimeError("Make API base is not HTTPS")
    make_headers = {"Authorization": "Token " + str(settings["MAKE_API_TOKEN"]).strip(),
                    "Accept": "application/json"}
    scenario = fetch(base + "/scenarios/5790745", headers=make_headers)
    details = scenario.get("scenario") or scenario.get("response") or scenario
    if details.get("isActive") is not True:
        raise RuntimeError("AP1C Make scenario is not active; stop instead of guessing a replacement")
    blueprint = fetch(base + "/scenarios/5790745/blueprint", headers=make_headers)
    serialized = json.dumps(blueprint).lower()
    if not any(k in serialized for k in ("output_record_id", "record_id", "platform_output_id")):
        raise RuntimeError("AP1C scenario input mapping could not be confirmed")
    print("AP1C_SCENARIO", json.dumps({"scenario_id": 5790745, "active": True,
                                        "webhook_host": parsed.hostname, "mapping_checked": True}))
    for rec_id in active:
        number = TARGETS[rec_id]
        if preflight(rec_id, number) != "ELIGIBLE":
            raise RuntimeError("Output state drifted during AP1C preflight")
        # All aliases identify the SAME Airtable record; never pass a numeric
        # display ID where a record ID is expected by a downstream stage.
        payload = json.dumps({"output_record_id": rec_id, "record_id": rec_id,
                              "platform_output_id": rec_id, "id": rec_id}).encode()
        response = fetch(hook, headers={"Content-Type":"application/json",
                                        "Accept":"application/json"}, data=payload)
        print("AP1C_TRIGGER", json.dumps({"output_id": number, "acknowledged": True,
                                         "response_kind": list(response)[:4]}))

    # Recheck each parent, never re-trigger on an unchanged state.
    for attempt in range(1, 9):
        statuses = {TARGETS[r]: record(OUTPUT_TABLE, r).get("IG_Carousel_Status")
                    for r in active}
        print("AP1C_FOLLOWUP", json.dumps({"attempt": attempt, "statuses": statuses}))
        if all(v != "Assets Ready" for v in statuses.values()):
            print("AP1C_RESUME_CONFIRMED")
            return
        time.sleep(15)
    raise RuntimeError("Make accepted AP1C requests but no output advanced; do not duplicate trigger")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("AP1C_RECOVERY_ERROR", type(exc).__name__, str(exc)[:250], file=sys.stderr)
        raise
