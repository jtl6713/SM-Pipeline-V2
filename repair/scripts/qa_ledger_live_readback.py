#!/usr/bin/env python3
"""Non-mutating live Supabase QA ledger readback against frozen Airtable exports.

This script cannot apply a schema, backfill, publish, approve a release or revoke
tokens. It requires exact frozen source exports outside the repository, a
separately confirmed project ref, and a server-held service role credential.
It prints aggregate counts/digests ONLY, never the source rows or credentials.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler

from qa_ledger_backfill_preflight import load_rows, reconcile, source_inventory

PROJECT_RE = re.compile(r"^[a-z0-9]{20}$")
TABLES = ("studio_qa_runs", "studio_qa_events")
# Fetch all canonical operational fields, not just the archived provenance.
# A target row can have intact legacy JSON but corrupted canonical QA columns.
SELECT_BY_TABLE = {
    "studio_qa_runs": (
        "run_id,catalog_revision,environment,deployment,created_by,"
        "created_at_utc,status,idempotency_key,payload_hash,"
        "legacy_record_id,legacy_source_fields,legacy_row_sha256"
    ),
    "studio_qa_events": (
        "run_id,execution_id,test_id,event_kind,actor_id,recorded_at_utc,"
        "payload_json,idempotency_key,payload_hash,"
        "legacy_record_id,legacy_source_fields,legacy_row_sha256"
    ),
}
MAX_RECORDS = 10000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_rows(
    project_ref: str, key: str, table: str,
    expected_count: int, requester=None,
) -> list[dict]:
    if not isinstance(project_ref, str) or not PROJECT_RE.fullmatch(project_ref):
        raise ValueError("Invalid approved production project ref")
    if not isinstance(key, str) or not key.strip():
        raise ValueError("Missing server-side Supabase service role credential")
    if table not in TABLES:
        raise ValueError("Unapproved QA readback table")
    if type(expected_count) is not int or expected_count < 0 or expected_count > MAX_RECORDS:
        raise ValueError("Unbounded or invalid expected QA source count")
    opener = build_opener(NoRedirect())
    requester = requester or (lambda req: opener.open(req, timeout=12))
    result: list[dict] = []
    offset = 0
    while True:
        limit = min(100, expected_count + 1 - offset)
        if limit < 1:
            raise ValueError("QA target has more rows than approved frozen source")
        query = urlencode({
            "select": SELECT_BY_TABLE[table],
            "order": "legacy_record_id.asc.nullslast",
            "limit": str(limit),
            "offset": str(offset),
        })
        url = f"https://{project_ref}.supabase.co/rest/v1/{table}?{query}"
        request = Request(url, headers={
            "Accept": "application/json",
            "apikey": key,
            "Authorization": "Bearer " + key,
        }, method="GET")
        try:
            response = requester(request)
            with response:
                raw = response.read(2_000_001)
        except Exception as exc:
            raise ValueError("Supabase QA GET readback unavailable or forbidden") from exc
        if len(raw) > 2_000_000:
            raise ValueError("QA GET page exceeds 2 MB safe size")
        try:
            page = json.loads(raw)
        except Exception as exc:
            raise ValueError("Supabase QA GET response is not JSON") from exc
        if not isinstance(page, list) or len(page) > limit or any(
            not isinstance(row, dict) for row in page
        ):
            raise ValueError("Malformed or excessive QA readback records")
        result.extend(page)
        if len(result) > expected_count:
            raise ValueError("QA target exceeds approved source inventory")
        offset += len(page)
        if len(page) < limit:
            return result


def inspect(
    runs_source: list[dict], events_source: list[dict],
    project_ref: str, key: str, expected_runs: int, expected_events: int,
    requester=None,
) -> dict:
    runs = source_inventory(runs_source, "runs")
    events = source_inventory(events_source, "events")
    if (runs["count"], events["count"]) != (expected_runs, expected_events):
        raise ValueError("Frozen source inventory mismatches separately supplied counts")
    target_runs = fetch_rows(project_ref, key, TABLES[0], expected_runs, requester)
    target_events = fetch_rows(project_ref, key, TABLES[1], expected_events, requester)
    return reconcile(
        runs_source, events_source, target_runs, target_events,
        expected_runs, expected_events
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs-source", type=Path, required=True)
    parser.add_argument("--events-source", type=Path, required=True)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--expected-runs", type=int, required=True)
    parser.add_argument("--expected-events", type=int, required=True)
    args = parser.parse_args()
    ref = os.getenv("STUDIO_PRODUCTION_SUPABASE_PROJECT_REF", "")
    if args.project_ref != ref or not PROJECT_RE.fullmatch(ref):
        raise SystemExit("BLOCKED: project ref does not match independent approval")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    try:
        result = inspect(
            load_rows(args.runs_source, source=True),
            load_rows(args.events_source, source=True),
            ref, key, args.expected_runs, args.expected_events,
        )
    except (ValueError, OSError, json.JSONDecodeError):
        raise SystemExit("BLOCKED: independent QA source and target readback unavailable")
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["history_parity_verified"]:
        raise SystemExit("BLOCKED: QA historical data has not been reconciled")


if __name__ == "__main__":
    main()
