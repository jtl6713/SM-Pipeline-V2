#!/usr/bin/env python3
"""Fail-closed source/hour coverage and matched-period baseline assessment."""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

REQUIRED = ("studio_worker_gateway", "shadow_dirty_replay", "shadow_reconcile",
            "runner", "standalone_scripts", "external_integrations")

def parse_time(value):
    d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("timezone required")
    return d.astimezone(timezone.utc)

def assess(coverage, baseline=None, candidate=None):
    sources = coverage.get("sources", {})
    missing_sources = [s for s in REQUIRED if sources.get(s, {}).get("instrumented") is not True]
    missing_hours = {}
    for source in REQUIRED:
        meta = sources.get(source, {})
        expected = meta.get("expected_hours", [])
        attestations = meta.get("hourly_attestations", {})
        absent = [h for h in expected if attestations.get(h, {}).get("collector_ok") is not True]
        if absent or not expected:
            missing_hours[source] = absent if expected else ["no_expected_hour_manifest"]
    result = {
        "source_universe": list(REQUIRED), "missing_sources": missing_sources,
        "missing_hours": missing_hours, "system_wide_complete": False,
        "net_saved_requests": None, "baseline_eligibility": "unavailable",
        "workload_comparability": "unverified",
        "reconcile_attribution_observed": bool(coverage.get("reconcile_attribution_observed", False)),
    }
    if baseline is None or candidate is None:
        return result
    try:
        bs, be = parse_time(baseline["start_utc"]), parse_time(baseline["end_utc"])
        cs, ce = parse_time(candidate["start_utc"]), parse_time(candidate["end_utc"])
        if not (be > bs and ce > cs and be-bs == ce-cs and
                (be-bs).total_seconds() >= 86400):
            return {**result, "baseline_eligibility": "unequal_or_short_windows"}
        if (baseline.get("source_universe") != candidate.get("source_universe")
                or set(baseline.get("source_universe", [])) != set(REQUIRED)):
            return {**result, "baseline_eligibility": "source_universe_mismatch"}
        if baseline.get("read_flags") == candidate.get("read_flags"):
            return {**result, "baseline_eligibility": "no_treatment_difference"}
        if not (baseline.get("complete") is True and candidate.get("complete") is True):
            return {**result, "baseline_eligibility": "incomplete_period"}
        result["baseline_eligibility"] = "eligible"
        units = ("outputs", "refreshes", "dirty_updates", "reconciliations")
        bw, cw = baseline.get("workload", {}), candidate.get("workload", {})
        if any(k not in bw or k not in cw for k in units):
            return {**result, "workload_comparability": "missing_workload_dimensions"}
        if any(abs(cw[k]-bw[k]) > max(1, bw[k]*0.1) for k in units):
            return {**result, "workload_comparability": "workload_outside_10pct"}
        result["workload_comparability"] = "matched_within_10pct"
        if missing_sources or missing_hours:
            return result
        if not result["reconcile_attribution_observed"]:
            return result
        result["system_wide_complete"] = True
        result["net_saved_requests"] = int(baseline["total_attempts"])-int(candidate["total_attempts"])
    except (KeyError, ValueError, TypeError, OverflowError):
        result["baseline_eligibility"] = "invalid_period_metadata"
    return result

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--coverage", required=True)
    p.add_argument("--baseline")
    p.add_argument("--candidate")
    p.add_argument("--output", required=True)
    a = p.parse_args()
    read = lambda path: json.loads(Path(path).read_text()) if path else None
    output = assess(read(a.coverage), read(a.baseline), read(a.candidate))
    Path(a.output).write_text(json.dumps(output, indent=2)+"\n")

if __name__ == "__main__":
    main()
