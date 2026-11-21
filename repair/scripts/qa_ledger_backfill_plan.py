#!/usr/bin/env python3
"""Prepare private, no-network, append-only Studio QA history import payloads.

This utility NEVER calls Airtable, Supabase or GitHub, and NEVER applies SQL.
It transforms a separately approved complete legacy QA export into two
service-role PostgREST JSON import payloads, preserving source fields,
legacy IDs, payload-hash strings and independent SHA-256 reconciliation hashes.

Only use after freezing an independently counted export. Treat outputs as
sensitive private records; NEVER commit or upload them as public CI artifacts.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from qa_ledger_backfill_preflight import load_rows, sha256, source_inventory


EVENT_KINDS = {
    "ManualResult", "AutomatedObservation", "HumanApproval", "Waiver", "RunFinalized"
}


def required(fields: dict[str, Any], key: str) -> str:
    value = fields.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing canonical legacy {key}")
    return value


def timestamp(value: str) -> str:
    # Preserve the original timestamp inside legacy_source_fields but validate
    # the target column cannot acquire implicit host-local timezone semantics.
    if not value.endswith("Z") and not value.endswith("+00:00"):
        raise ValueError("QA legacy timestamp must be explicit UTC")
    candidate = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise ValueError("Invalid canonical QA timestamp") from exc
    if parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("Non-UTC QA timestamp")
    return value


def payload_object(fields: dict[str, Any], key: str) -> dict[str, Any]:
    raw = required(fields, key)
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid legacy {key}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"Legacy {key} must be a JSON object")
    return value


def prepare_import(
    runs_source: list[dict[str, Any]],
    events_source: list[dict[str, Any]],
    expected_runs: int,
    expected_events: int,
) -> dict[str, Any]:
    run_inventory = source_inventory(runs_source, "runs")
    event_inventory = source_inventory(events_source, "events")
    if expected_runs < 0 or expected_events < 0 or (
        len(runs_source), len(events_source)
    ) != (expected_runs, expected_events):
        raise ValueError("QA source record count mismatch; export must be complete")

    runs: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    run_ids: set[str] = set()
    event_exec_ids: set[str] = set()

    for source in runs_source:
        fields = source["fields"]
        run_id = required(fields, "Run ID")
        if run_id in run_ids:
            raise ValueError("Duplicate legacy QA run identity")
        run_ids.add(run_id)
        runs.append({
            "run_id": run_id,
            "catalog_revision": required(fields, "Catalog Revision"),
            "environment": required(fields, "Environment"),
            "deployment": payload_object(fields, "Deployment JSON"),
            "created_by": required(fields, "Created By"),
            "created_at_utc": timestamp(required(fields, "Created At UTC")),
            "status": required(fields, "Status"),
            "idempotency_key": required(fields, "Idempotency Key"),
            # The old hash is immutable provenance, even if it was not SHA-256.
            "payload_hash": required(fields, "Payload Hash"),
            "legacy_record_id": source["id"],
            "legacy_source_fields": fields,
            "legacy_row_sha256": sha256(fields),
        })

    for source in events_source:
        fields = source["fields"]
        event_run_id = required(fields, "Run ID")
        if event_run_id not in run_ids:
            raise ValueError("Orphan historical QA event; never discard it")
        execution_id = required(fields, "Execution ID")
        if execution_id in event_exec_ids:
            raise ValueError("Duplicate historical execution identity")
        event_exec_ids.add(execution_id)
        kind = required(fields, "Event Kind")
        if kind not in EVENT_KINDS:
            raise ValueError("Unrecognized immutable historical QA event kind")
        events.append({
            "run_id": event_run_id,
            "execution_id": execution_id,
            "test_id": required(fields, "Test ID"),
            "event_kind": kind,
            "actor_id": required(fields, "Actor ID"),
            "recorded_at_utc": timestamp(required(fields, "Recorded At UTC")),
            "payload_json": payload_object(fields, "Payload JSON"),
            "idempotency_key": required(fields, "Idempotency Key"),
            "payload_hash": required(fields, "Payload Hash"),
            "legacy_record_id": source["id"],
            "legacy_source_fields": fields,
            "legacy_row_sha256": sha256(fields),
        })

    # A plan is never migration approval. Commit runs before dependent events.
    return {
        "runs": runs, "events": events,
        "summary": {
            "source_runs": len(runs), "source_events": len(events),
            "runs_digest": run_inventory["digest"],
            "events_digest": event_inventory["digest"],
            "network_requests": 0, "production_mutations": 0,
            "approved_to_apply": False,
        },
    }


def write_private(path: Path, rows: list[dict[str, Any]]) -> None:
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    fd = os.open(str(path), flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as target:
            json.dump(rows, target, ensure_ascii=False, indent=2)
            target.write("\n")
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs-source", type=Path, required=True)
    parser.add_argument("--events-source", type=Path, required=True)
    parser.add_argument("--expected-runs", type=int, required=True)
    parser.add_argument("--expected-events", type=int, required=True)
    parser.add_argument("--private-output-dir", type=Path, required=True)
    args = parser.parse_args()

    output = args.private_output_dir.resolve()
    repo = Path(__file__).resolve().parents[2]
    if output == repo or repo in output.parents:
        raise SystemExit("BLOCKED: never store historical QA exports in the repo")
    if output.exists():
        raise SystemExit("BLOCKED: refuse to overwrite a pre-existing export folder")
    planned = prepare_import(
        load_rows(args.runs_source, source=True),
        load_rows(args.events_source, source=True),
        args.expected_runs, args.expected_events
    )
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    try:
        write_private(output / "qa-runs-import.json", planned["runs"])
        write_private(output / "qa-events-import.json", planned["events"])
    except BaseException:
        for name in ("qa-runs-import.json", "qa-events-import.json"):
            (output / name).unlink(missing_ok=True)
        output.rmdir()
        raise
    print(json.dumps({
        **planned["summary"],
        "private_files_prepared": True,
        "source_fields_logged": False,
        "must_execute_reviewed_import_separately": True,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
