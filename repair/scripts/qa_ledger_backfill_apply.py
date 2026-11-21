#!/usr/bin/env python3
"""Explicitly authorized, append-only historical Studio QA import.

NEVER called by CI or deployment. Import is DENIED by default.
Requires a separately reviewed private approval manifest, exact source
digests, owner-confirmed Supabase production project, backup and rollback
evidence references, plus a deliberate local execution confirmation.
This script cannot establish the truth of the approval/backup claims.
It cannot publish, change the Worker, rewrite QA rows or revoke credentials.

The importer is resumable: check exact legacy source identity before POST,
reject any conflict that is not byte-equivalent historical provenance and
run a complete independent readback reconciliation after importing.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from qa_ledger_backfill_plan import prepare_import
from qa_ledger_backfill_preflight import load_rows
from qa_ledger_live_readback import inspect

PROJECT_RE = re.compile(r"^[a-z0-9]{20}$")
CONFIRMATION = "APPLY-APPROVED-IMMUTABLE-QA-HISTORY"
TABLES = (("runs", "studio_qa_runs"), ("events", "studio_qa_events"))
MAX_ROWS = 10000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def verify_approval(
    manifest: dict, plan: dict, project_ref: str, confirmation: str,
) -> None:
    if confirmation != CONFIRMATION:
        raise ValueError("Operator execution confirmation missing")
    if not PROJECT_RE.fullmatch(project_ref):
        raise ValueError("Invalid independently approved project identity")
    if manifest.get("project_ref") != project_ref:
        raise ValueError("Private approval targets a different project")
    summary = plan["summary"]
    required_exact = {
        "source_runs": summary["source_runs"],
        "source_events": summary["source_events"],
        "runs_digest": summary["runs_digest"],
        "events_digest": summary["events_digest"],
    }
    if any(manifest.get(k) != v for k, v in required_exact.items()):
        raise ValueError("Approval source inventory does not match frozen export")
    if manifest.get("independent_review_approved") is not True:
        raise ValueError("Independent migration review not documented")
    for key in ("backup_evidence_ref", "rollback_evidence_ref",
                "reviewed_by", "reviewed_at_utc", "maintenance_change_id"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            raise ValueError("Migration approval lacks " + key)
    try:
        approved_at = datetime.fromisoformat(
            manifest["reviewed_at_utc"].replace("Z", "+00:00")
        )
    except (ValueError, TypeError) as exc:
        raise ValueError("Invalid approval time") from exc
    if approved_at.utcoffset() != timezone.utc.utcoffset(approved_at):
        raise ValueError("Migration approval must have an explicit UTC time")


def same_row(actual: dict, expected: dict) -> bool:
    if not isinstance(actual, dict):
        return False
    # For PostgreSQL JSONB, key reordering is immaterial. An immutable row
    # cannot be reused if any represented field differs or is missing.
    for field, value in expected.items():
        received = actual.get(field)
        if field in ("created_at_utc", "recorded_at_utc"):
            try:
                when = lambda x: datetime.fromisoformat(str(x).replace("Z", "+00:00"))
                if when(received) != when(value):
                    return False
            except (ValueError, TypeError):
                return False
        elif received != value:
            return False
    return True


def api_request(ref: str, credential: str, table: str, *,
                method: str, params: dict, payload: dict | None = None,
                requester=None) -> tuple[int, list[dict]]:
    if table not in [v for _, v in TABLES] or method not in ("GET", "POST"):
        raise ValueError("QA import operation not in exact allowlist")
    if not PROJECT_RE.fullmatch(ref) or not credential:
        raise ValueError("Missing approved Supabase project or private credential")
    url = f"https://{ref}.supabase.co/rest/v1/{table}?" + urlencode(params)
    headers = {
        "Accept": "application/json",
        "Authorization": "Bearer " + credential,
        "apikey": credential,
    }
    if method == "POST":
        headers.update({"Content-Type": "application/json",
                        "Prefer": "return=representation"})
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
    request = Request(url, headers=headers, data=data, method=method)
    opener = build_opener(NoRedirect())
    requester = requester or (lambda req: opener.open(req, timeout=12))
    try:
        response = requester(request)
        with response:
            status = response.status
            raw = response.read(2_000_001)
    except HTTPError as exc:
        if exc.code == 409:
            return 409, []
        raise ValueError("Supabase QA import HTTP request rejected") from None
    except Exception as exc:
        raise ValueError("Supabase QA import transport unavailable") from exc
    if status not in (200, 201) or len(raw) > 2_000_000:
        raise ValueError("Unexpected QA import response status or size")
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ValueError("Unreadable QA import response") from exc
    if not isinstance(parsed, list) or any(not isinstance(x, dict) for x in parsed):
        raise ValueError("Malformed QA import readback")
    return status, parsed


def apply_plan(
    plan: dict, manifest: dict, ref: str, key: str, confirmation: str,
    *, requester=None,
) -> dict:
    verify_approval(manifest, plan, ref, confirmation)
    if not isinstance(key, str) or not key.strip():
        raise ValueError("Supabase service-role key missing")
    if (len(plan["runs"]) + len(plan["events"])) > MAX_ROWS:
        raise ValueError("QA import exceeds reviewed maximum")
    outcome = {"runs_inserted":0, "runs_reused":0,
               "events_inserted":0, "events_reused":0,
               "release_authorized":False}
    for kind, table in TABLES:
        for row in plan[kind]:
            legacy_id = row["legacy_record_id"]
            lookup = {
                "select": ",".join(sorted(row)),
                "legacy_record_id": "eq." + legacy_id,
                "limit": "2",
            }
            status, existing = api_request(
                ref, key, table, method="GET", params=lookup, requester=requester,
            )
            if status != 200 or len(existing) > 1:
                raise ValueError("QA historical lookup ambiguous")
            if existing:
                if not same_row(existing[0], row):
                    raise ValueError("QA immutable history conflicts with source")
                outcome[kind + "_reused"] += 1
                continue
            status, inserted = api_request(
                ref, key, table, method="POST",
                params={"select": ",".join(sorted(row))}, payload=row,
                requester=requester,
            )
            if status == 409:
                # Concurrent retry: only accept the exact committed record.
                status, inserted = api_request(
                    ref, key, table, method="GET", params=lookup,
                    requester=requester,
                )
                if status != 200 or len(inserted) != 1 or not same_row(inserted[0], row):
                    raise ValueError("QA uniqueness conflict is not a verified replay")
                outcome[kind + "_reused"] += 1
            elif status != 201 or len(inserted) != 1 or not same_row(inserted[0], row):
                raise ValueError("QA historical insert returned unverified identity")
            else:
                outcome[kind + "_inserted"] += 1
    return outcome


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--runs-source", type=Path, required=True)
    p.add_argument("--events-source", type=Path, required=True)
    p.add_argument("--expected-runs", type=int, required=True)
    p.add_argument("--expected-events", type=int, required=True)
    p.add_argument("--private-approval", type=Path)
    p.add_argument("--apply", action="store_true",
                   help="Requires private approval and separate exact confirmation")
    args = p.parse_args()

    runs = load_rows(args.runs_source, source=True)
    events = load_rows(args.events_source, source=True)
    plan = prepare_import(runs, events, args.expected_runs, args.expected_events)
    if not args.apply:
        print(json.dumps({
            **plan["summary"], "mode":"offline-dry-run",
            "release_authorized":False,
            "network_requests":0,
        }, sort_keys=True))
        return

    if args.private_approval is None:
        raise SystemExit("BLOCKED: independently reviewed private approval missing")
    root = Path(__file__).resolve().parents[2]
    if (root == args.private_approval.resolve()
        or root in args.private_approval.resolve().parents):
        raise SystemExit("BLOCKED: never take migration approval from repository")
    ref = os.getenv("STUDIO_PRODUCTION_SUPABASE_PROJECT_REF", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    confirmation = os.getenv("STUDIO_QA_IMPORT_EXACT_CONFIRMATION", "")
    try:
        approval = json.loads(args.private_approval.read_text(encoding="utf-8"))
        outcome = apply_plan(plan, approval, ref, key, confirmation)
        # Independent full live readback is always required, even when all
        # rows existed already. This cannot authorize the product release.
        history = inspect(
            runs, events, ref, key, args.expected_runs, args.expected_events
        )
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError):
        raise SystemExit("BLOCKED: QA import incomplete or provenance unverified")
    print(json.dumps({"counts":outcome,
                      "source_history_digest":{
                          "runs":history["run_inventory_digest"],
                          "events":history["event_inventory_digest"]},
                      "history_parity_verified":history["history_parity_verified"],
                      "release_authorized":False}, sort_keys=True))
    if not history["history_parity_verified"]:
        raise SystemExit("BLOCKED: imported QA history does not reconcile")


if __name__ == "__main__":
    main()
