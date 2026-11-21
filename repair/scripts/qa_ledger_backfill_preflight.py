#!/usr/bin/env python3
"""Read-only QA ledger backfill reconciliation.

Consumes independently captured, private Airtable JSON exports and Supabase
REST readback JSON. NEVER reads provider credentials or writes to either
database. It cannot authorize a deployment, release or credential revocation.
Do not commit source/target export files to this repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


RECORD_ID = re.compile(r"^rec[A-Za-z0-9]{14}$")
QA_RUN_ID = re.compile(r"^qa-[0-9a-f-]{36}$", re.I)
QA_EXEC_ID = re.compile(r"^qaex-[0-9a-f-]{36}$", re.I)


def sha256(value: Any) -> str:
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_rows(path: Path, *, source: bool) -> list[dict[str, Any]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(document, dict):
        rows = document.get("records" if source else "rows")
    else:
        rows = document
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ValueError("Malformed QA ledger export/readback document")
    return rows


def source_inventory(rows: list[dict[str, Any]], kind: str) -> dict[str, Any]:
    if kind not in ("runs", "events"):
        raise ValueError("Unknown QA ledger type")
    by_id, keys = {}, set()
    run_ids = set()
    for row in rows:
        legacy_id, fields = row.get("id"), row.get("fields")
        if not isinstance(legacy_id, str) or not RECORD_ID.fullmatch(legacy_id):
            raise ValueError("Malformed source record ID")
        if not isinstance(fields, dict) or legacy_id in by_id:
            raise ValueError("Duplicate ID or invalid source record")
        key, payload_hash = fields.get("Idempotency Key"), fields.get("Payload Hash")
        if not isinstance(key, str) or not key or key in keys:
            raise ValueError("Missing or duplicate canonical idempotency key")
        if not isinstance(payload_hash, str) or not payload_hash:
            raise ValueError("Missing legacy payload hash; do not fabricate it")
        keys.add(key)
        run_id = fields.get("Run ID")
        if not isinstance(run_id, str) or not QA_RUN_ID.fullmatch(run_id):
            raise ValueError("Invalid QA run ID")
        if kind == "runs":
            if run_id in run_ids:
                raise ValueError("Duplicate QA run ID")
            run_ids.add(run_id)
            if not isinstance(fields.get("Deployment JSON"), str) or not isinstance(
                json.loads(fields["Deployment JSON"]), dict
            ):
                raise ValueError("Invalid QA run deployment JSON")
            for needed in ("Catalog Revision", "Created By", "Created At UTC", "Status", "Environment"):
                if not isinstance(fields.get(needed), str) or not fields[needed]:
                    raise ValueError("Incomplete QA run source provenance")
        else:
            for needed in ("Execution ID", "Test ID", "Event Kind", "Actor ID", "Recorded At UTC"):
                if not isinstance(fields.get(needed), str) or not fields[needed]:
                    raise ValueError("Incomplete immutable QA event provenance")
            if not QA_EXEC_ID.fullmatch(fields["Execution ID"]):
                raise ValueError("Invalid QA event execution identity")
            if not isinstance(fields.get("Payload JSON"), str) or not isinstance(
                json.loads(fields["Payload JSON"]), dict
            ):
                raise ValueError("Invalid QA event JSON")
        by_id[legacy_id] = {"fields": fields, "sha256": sha256(fields), "run_id": run_id}
    digest = sha256(sorted((k, v["sha256"]) for k, v in by_id.items()))
    return {"records": by_id, "count": len(by_id), "digest": digest}


def reconcile(
    source_runs: list[dict[str, Any]],
    source_events: list[dict[str, Any]],
    target_runs: list[dict[str, Any]] | None,
    target_events: list[dict[str, Any]] | None,
    expected_runs: int,
    expected_events: int,
) -> dict[str, Any]:
    blockers = []
    runs = source_inventory(source_runs, "runs")
    events = source_inventory(source_events, "events")
    if expected_runs < 0 or expected_events < 0:
        raise ValueError("Explicit expected record counts must be nonnegative")
    if (runs["count"], events["count"]) != (expected_runs, expected_events):
        blockers.append("Source counts disagree with independently recorded source inventory")
    observed_run_ids = {r["run_id"] for r in runs["records"].values()}
    if any(e["run_id"] not in observed_run_ids for e in events["records"].values()):
        blockers.append("Orphan QA events in source export")
    if (target_runs is None) != (target_events is None):
        blockers.append("Incomplete Supabase target snapshot")
    if target_runs is None or target_events is None:
        blockers.append("Independent Supabase target readback missing")
    else:
        for kind, source, target in (
            ("runs", runs, target_runs), ("events", events, target_events)
        ):
            ids = set()
            if len(target) != source["count"]:
                blockers.append(kind + ": target row count mismatch")
            for row in target:
                legacy_id = row.get("legacy_record_id")
                fields = row.get("legacy_source_fields")
                digest = row.get("legacy_row_sha256")
                if not isinstance(legacy_id, str) or legacy_id in ids:
                    blockers.append(kind + ": missing or duplicated legacy correlation ID")
                    continue
                ids.add(legacy_id)
                matching = source["records"].get(legacy_id)
                if matching is None or fields != matching["fields"] or digest != matching["sha256"]:
                    blockers.append(kind + ": source field/hash reconciliation failed")
                if matching is not None and row.get("run_id") != matching["run_id"]:
                    blockers.append(kind + ": stored QA run ID changed")
            if ids != set(source["records"]):
                blockers.append(kind + ": missing or extra legacy rows")
    return {
        "source_run_count": runs["count"],
        "source_event_count": events["count"],
        "expected_run_count": expected_runs,
        "expected_event_count": expected_events,
        "run_inventory_digest": runs["digest"],
        "event_inventory_digest": events["digest"],
        "history_parity_verified": not blockers,
        "release_authorized": False,
        "read_only": True,
        "blockers": sorted(set(blockers)),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--runs-source", type=Path, required=True)
    p.add_argument("--events-source", type=Path, required=True)
    p.add_argument("--runs-target", type=Path)
    p.add_argument("--events-target", type=Path)
    p.add_argument("--expected-runs", type=int, required=True)
    p.add_argument("--expected-events", type=int, required=True)
    args = p.parse_args()
    result = reconcile(
        load_rows(args.runs_source, source=True),
        load_rows(args.events_source, source=True),
        load_rows(args.runs_target, source=False) if args.runs_target else None,
        load_rows(args.events_target, source=False) if args.events_target else None,
        args.expected_runs, args.expected_events
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["history_parity_verified"]:
        raise SystemExit("BLOCKED: QA legacy history not independently reconciled")


if __name__ == "__main__":
    main()
