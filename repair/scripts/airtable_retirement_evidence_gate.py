#!/usr/bin/env python3
"""Fail-closed evidence-shape checker for the Airtable retirement release.

This tool neither collects data nor authorizes deployment. Artifact references
must be independently inspected by an operator; otherwise a claimed zero count
could merely mean that a collector was not running.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

SOURCES = (
    "studio_worker", "pipeline_runner", "standalone_scripts",
    "github_actions", "make_scenarios", "external_integrations",
)
PROOFS = (
    "production_identity", "production_schema", "qa_ledger_migration", "worker_bindings",
    "runner_environment", "external_integrations", "nonpublishing_canary",
    "rollback_plan",
)
# The live Studio project retains the old "dev" name. Only the unrelated
# Task Organizer project is excluded by identity.
NONPRODUCTION_REFS = frozenset({"yxhfaksetrxdezoodibq"})


def utc(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("timestamp must end in Z")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.utcoffset() != timedelta(0):
        raise ValueError("timestamp must be UTC")
    return result.astimezone(timezone.utc)


def evidence_shape(manifest, *, now=None):
    """Report only whether an operator-supplied evidence packet is complete.

    A consistent packet is not independently authenticated and does NOT
    authorize merging, deploying, publishing, or revoking a provider token.
    """
    now = now or datetime.now(timezone.utc)
    problems = []
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        return {"evidence_layout_complete": False, "release_authorized": False,
                "manual_verification_required": True, "blockers": ["unsupported manifest schema"]}
    ref = manifest.get("production_project_ref")
    if not isinstance(ref, str) or not re.fullmatch(r"[a-z0-9]{20}", ref) or ref in NONPRODUCTION_REFS:
        problems.append("production Supabase project reference is absent, invalid, or known non-production")

    modes = manifest.get("runtime_source_modes")
    modes = modes if isinstance(modes, dict) else {}
    for name in ("studio_primary_read_source", "studio_sync_read_source",
                 "pipeline_runner_write_source"):
        if modes.get(name) != "supabase":
            problems.append(f"production runtime source not Supabase: {name}")

    proofs = manifest.get("proofs")
    if not isinstance(proofs, dict):
        proofs = {}
    for key in PROOFS:
        item = proofs.get(key)
        if not isinstance(item, dict) or item.get("verified") is not True or not isinstance(item.get("artifact_ref"), str) or not item["artifact_ref"].strip():
            problems.append(f"missing independently reviewable evidence: {key}")

    quiet = manifest.get("quiet_window")
    quiet = quiet if isinstance(quiet, dict) else {}
    start = end = None
    hours = []
    try:
        start, end = utc(quiet.get("start_utc")), utc(quiet.get("end_utc"))
        if any((start.minute, start.second, start.microsecond, end.minute, end.second, end.microsecond)):
            raise ValueError("window boundaries must be complete UTC hours")
        duration = (end - start).total_seconds() / 3600
        if duration != int(duration) or duration < 6 or duration > 72:
            raise ValueError("window must contain 6-72 complete UTC hours")
        if end > now:
            raise ValueError("quiet window has not completed")
        hours = [start + timedelta(hours=i) for i in range(int(duration))]
    except (TypeError, ValueError) as error:
        problems.append(f"invalid complete quiet window: {error}")

    sources = quiet.get("sources")
    if not isinstance(sources, dict):
        sources = {}
    if set(sources) != set(SOURCES):
        problems.append("missing or unexpected independently monitored sources")

    for source in SOURCES:
        samples = sources.get(source)
        if not isinstance(samples, list):
            problems.append(f"{source}: no hourly collector evidence")
            continue
        if not hours or len(samples) != len(hours):
            problems.append(f"{source}: incomplete hourly collector coverage")
            continue
        observed = {}
        for row in samples:
            if not isinstance(row, dict):
                problems.append(f"{source}: malformed hourly evidence")
                continue
            try:
                hour = utc(row.get("hour_utc"))
            except (TypeError, ValueError):
                problems.append(f"{source}: missing or invalid hourly timestamp")
                continue
            if hour in observed:
                problems.append(f"{source}: duplicate hourly evidence")
            observed[hour] = row
            attempts = row.get("attempts")
            if type(attempts) is not int or attempts != 0:
                problems.append(f"{source}: nonzero or unverified Airtable attempts")
            if row.get("collector_ok") is not True:
                problems.append(f"{source}: missing healthy collector heartbeat")
            if not isinstance(row.get("artifact_ref"), str) or not row["artifact_ref"].strip():
                problems.append(f"{source}: missing hourly source artifact")
        if set(observed) != set(hours):
            problems.append(f"{source}: missing or out-of-window hours")

    return {
        "evidence_layout_complete": len(problems) == 0,
        "release_authorized": False,
        "manual_verification_required": True,
        "source_count_required": len(SOURCES),
        "complete_hours_required": max(len(hours), 6),
        "blockers": sorted(set(problems)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    result = evidence_shape(json.loads(Path(args.manifest).read_text()))
    output = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(output)
    print(output, end="")
    raise SystemExit(0 if result["evidence_layout_complete"] else 1)


if __name__ == "__main__":
    main()
