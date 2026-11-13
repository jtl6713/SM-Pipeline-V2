"""Copy the transfer queue and three pipeline settings into Supabase.

Prints counts only. Setting values and queue error text stay out of the log.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "appe33zkZn35yirTL"
QUEUE = "tblBZLXPd1p2NRWRK"
SETTINGS = "tblpHPWeEkyJaF7ql"
SETTING_NAMES = (
    "ENGAGEMENT_STORE_V1",
    "SIMILAR_ACCOUNT_WATCHLIST",
    "SIMILAR_ACCOUNT_STATUS_CACHE",
)
QUEUE_FIELDS = [
    "Transfer_Status",
    "Error_Message",
    "Preview_Error",
    "Attempt_Count",
    "Last_Attempt_At",
    "Transfer_ID",
    "Production_Request_Record_ID",
    "Asset_Kind",
    "Source_Asset_ID",
    "Source_Name",
    "Source_Drive_File_ID",
    "Source_Media_Asset",
    "Generated_Media_Asset",
    "Aspect_Ratio",
    "Preview_Status",
    "Test_Run_ID",
    "Target_Production_Request_Outputs",
]
PAYLOAD_FIELDS = {
    "Transfer_ID": "transfer_id",
    "Production_Request_Record_ID": "production_request_record_id",
    "Asset_Kind": "asset_kind",
    "Source_Asset_ID": "source_asset_id",
    "Source_Name": "source_name",
    "Source_Drive_File_ID": "source_drive_file_id",
    "Source_Media_Asset": "source_media_asset_id",
    "Generated_Media_Asset": "generated_media_asset_id",
    "Aspect_Ratio": "aspect_ratio",
    "Preview_Status": "preview_status",
    "Test_Run_ID": "test_run_id",
}


def _request(url, *, method="GET", headers=None, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            if error.code in {429, 500, 502, 503, 504} and attempt < 5:
                time.sleep(2 + attempt * 2)
                continue
            detail = error.read().decode("utf-8", "replace")[:300]
            raise SystemExit(f"http {error.code} {method} failed {detail}") from error
    raise SystemExit("request retries exhausted")


def _text(value):
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("name") or value.get("id")
    text = str(value or "").strip()
    return text or None


def _rec_ids(value):
    items = value if isinstance(value, list) else ([] if value in (None, "") else [value])
    ids = []
    for item in items:
        if isinstance(item, dict):
            item = item.get("id")
        text = str(item or "").strip()
        if text.startswith("rec") and text not in ids:
            ids.append(text)
    return ids


def airtable_pages(pat, table, fields, formula=None):
    offset = None
    headers = {"Authorization": f"Bearer {pat}"}
    while True:
        params = {"pageSize": "100"}
        if formula:
            params["filterByFormula"] = formula
        if offset:
            params["offset"] = offset
        query = urllib.parse.urlencode(params, doseq=True)
        for field in fields:
            query += "&" + urllib.parse.urlencode({"fields[]": field})
        status, payload = _request(
            f"https://api.airtable.com/v0/{BASE}/{table}?{query}",
            headers=headers,
        )
        if status != 200 or not isinstance(payload, dict):
            raise SystemExit(f"airtable list failed {status}")
        yield payload.get("records") or []
        offset = payload.get("offset")
        if not offset:
            return


def queue_row(record):
    fields = record.get("fields") or {}
    payload = {}
    for airtable_key, column in PAYLOAD_FIELDS.items():
        if airtable_key not in fields:
            continue
        value = _text(fields.get(airtable_key))
        if airtable_key in {"Source_Media_Asset", "Generated_Media_Asset"} and value and not value.startswith("rec"):
            continue
        if value:
            payload[column] = value
    targets = _rec_ids(fields.get("Target_Production_Request_Outputs"))
    if targets:
        payload["target_production_request_output_ids"] = targets
    row = {
        "airtable_record_id": record["id"],
        "status": _text(fields.get("Transfer_Status")) or "Pending",
        "payload": payload,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if "Error_Message" in fields:
        row["error_message"] = _text(fields.get("Error_Message"))
    if "Preview_Error" in fields:
        row["preview_error"] = _text(fields.get("Preview_Error"))
    attempt = fields.get("Attempt_Count")
    if attempt not in (None, ""):
        try:
            row["attempt_count"] = int(attempt)
        except (TypeError, ValueError):
            pass
    stamp = _text(fields.get("Last_Attempt_At"))
    if stamp:
        row["last_attempt_at"] = stamp
    return row


def supabase_upsert_tolerant(url, key, table, rows):
    if not rows:
        return 0
    try:
        supabase_upsert(url, key, table, rows)
        return 0
    except SystemExit:
        if len(rows) == 1:
            row = dict(rows[0])
            if "last_attempt_at" in row:
                row.pop("last_attempt_at", None)
                try:
                    supabase_upsert(url, key, table, [row])
                    return 0
                except SystemExit:
                    pass
            return 1
        mid = max(1, len(rows) // 2)
        return supabase_upsert_tolerant(url, key, table, rows[:mid]) + supabase_upsert_tolerant(
            url, key, table, rows[mid:]
        )


def supabase_upsert(url, key, table, rows):
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}?on_conflict=airtable_record_id"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    status, _payload = _request(endpoint, method="POST", headers=headers, body=rows, timeout=120)
    if status not in {200, 201}:
        raise SystemExit(f"supabase upsert {table} failed {status}")


def supabase_count(url, key, table, extra=""):
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}?select=airtable_record_id{extra}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Prefer": "count=exact",
        "Range": "0-0",
    }
    req = urllib.request.Request(endpoint, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        content_range = resp.headers.get("content-range") or ""
    total = content_range.split("/")[-1]
    return int(total) if total.isdigit() else None


def log(message):
    print(message, flush=True)
    path = os.environ.get("CLOSEOUT_LOG")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")


def main():
    pat = os.environ["AIRTABLE_PAT"]
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    formula = "OR(" + ",".join(f'{{Setting_Name}}="{name}"' for name in SETTING_NAMES) + ")"
    saved_settings = 0
    for page in airtable_pages(pat, SETTINGS, ["Setting_Name", "Setting_Value", "Active", "Notes", "Last_Modified"], formula):
        rows = []
        for record in page:
            fields = dict(record.get("fields") or {})
            fields["source"] = "pipeline"
            rows.append({"airtable_record_id": record["id"], "payload": fields})
        if rows:
            supabase_upsert(url, key, "engagement_settings", rows)
            saved_settings += len(rows)
    log(f"settings_upserted={saved_settings}")
    saved_queue = 0
    skipped_queue = 0
    for page in airtable_pages(pat, QUEUE, QUEUE_FIELDS):
        rows = [queue_row(record) for record in page if record.get("id")]
        if rows:
            skipped_queue += supabase_upsert_tolerant(url, key, "studio_media_transfer_queue", rows)
            saved_queue += len(rows)
        if saved_queue and saved_queue % 1000 == 0:
            log(f"queue_upserted={saved_queue}")
    log(f"queue_upserted={saved_queue}")
    log(f"queue_rows_skipped={skipped_queue}")
    log(f"queue_supabase={supabase_count(url, key, 'studio_media_transfer_queue')}")
    ready = supabase_count(url, key, "studio_media_transfer_queue", "&status=eq.Ready")
    log(f"queue_ready_supabase={ready}")
    if ready is None or ready < 5000:
        raise SystemExit("ready_short")
    present = 0
    for name in SETTING_NAMES:
        count = supabase_count(
            url,
            key,
            "engagement_settings",
            "&payload->>Setting_Name=eq." + urllib.parse.quote(name),
        )
        present += 1 if count else 0
    log(f"settings_present={present}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as exc:
        kind = "http" if isinstance(exc.code, str) and str(exc.code).startswith("http") else "error"
        log(f"closeout_exit={kind}")
        raise
