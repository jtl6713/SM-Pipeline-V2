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

def complete_hours(start, end):
    """UTC hour keys only for complete, aligned, bounded windows."""
    if start.minute or start.second or start.microsecond or end.minute or end.second or end.microsecond:
        raise ValueError("partial UTC hours")
    length = int((end - start).total_seconds())
    if length < 86400 or length > 72 * 3600 or length % 3600:
        raise ValueError("period must contain 24 to 72 complete UTC hours")
    return [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00:00Z")
            for i in range(length // 3600)]


def source_hour_gaps(sources, required_hours):
    """Absent manifests/attestations are unknown, never observed zero."""
    gaps = {}
    for source in REQUIRED:
        meta = sources.get(source, {})
        if not isinstance(meta, dict):
            gaps[source] = ["invalid_source"]
            continue
        expected = meta.get("expected_hours", [])
        attestations = meta.get("hourly_attestations", {})
        if not isinstance(expected, list) or not isinstance(attestations, dict):
            gaps[source] = ["invalid_hour_manifest"]
            continue
        # A source cannot attest its own absence by reporting no expected hours.
        if not expected:
            gaps[source] = ["no_expected_hour_manifest"]
            continue
        canonical = set()
        try:
            for hour in expected:
                stamp = parse_time(hour)
                if stamp.minute or stamp.second or stamp.microsecond:
                    raise ValueError("partial UTC hour")
                canonical.add(stamp.strftime("%Y-%m-%dT%H:00:00Z"))
        except (ValueError, TypeError, OverflowError):
            gaps[source] = ["invalid_hour_manifest"]
            continue
        missing = [h for h in required_hours if h not in canonical
                   or not isinstance(attestations.get(h), dict)
                   or attestations[h].get("collector_ok") is not True
                   or attestations[h].get("complete") is not True]
        if missing:
            gaps[source] = missing
    return gaps


def assess(coverage, baseline=None, candidate=None):
    sources = coverage.get("sources", {})
    if not isinstance(sources, dict):
        sources = {}
    missing_sources = [s for s in REQUIRED if
                       not isinstance(sources.get(s), dict) or
                       sources[s].get("instrumented") is not True]
    missing_hours = source_hour_gaps(sources, [])
    result = {
        "source_universe": list(REQUIRED),
        "missing_sources": missing_sources,
        "missing_hours": missing_hours,
        "system_wide_complete": False,
        "net_saved_requests": None,
        "baseline_eligibility": "unavailable",
        "workload_comparability": "unverified",
        "reconcile_attribution_observed": coverage.get("reconcile_attribution_observed") is True,
        "zero_activity_verified": False,
        "measurement_plan": (
            "Instrument every standalone/external writer and prove an independent source-hour "
            "heartbeat for each completed UTC hour; collect prospective 24h baseline/candidate "
            "periods with source revisions, read flags, and comparable workload. Historical "
            "unobserved hours cannot be backfilled as zero."
        ),
    }
    if baseline is None or candidate is None:
        return result
    try:
        bs, be = parse_time(baseline["start_utc"]), parse_time(baseline["end_utc"])
        cs, ce = parse_time(candidate["start_utc"]), parse_time(candidate["end_utc"])
        if not (be > bs and ce > cs and be - bs == ce - cs):
            return {**result, "baseline_eligibility": "unequal_or_short_windows"}
        try:
            required = complete_hours(bs, be) + complete_hours(cs, ce)
        except ValueError:
            return {**result, "baseline_eligibility": "unaligned_or_short_windows"}
        result["missing_hours"] = source_hour_gaps(sources, required)
        if (baseline.get("source_universe") != candidate.get("source_universe")
                or set(baseline.get("source_universe", [])) != set(REQUIRED)):
            return {**result, "baseline_eligibility": "source_universe_mismatch"}
        if not (isinstance(baseline.get("read_flags"), dict)
                and isinstance(candidate.get("read_flags"), dict)):
            return {**result, "baseline_eligibility": "missing_read_flags"}
        if baseline["read_flags"] == candidate["read_flags"]:
            return {**result, "baseline_eligibility": "no_treatment_difference"}
        if not (baseline.get("complete") is True and candidate.get("complete") is True):
            return {**result, "baseline_eligibility": "incomplete_period"}
        if (not isinstance(baseline.get("source_revisions"), dict)
                or baseline.get("source_revisions") != candidate.get("source_revisions")
                or set(baseline["source_revisions"]) != set(REQUIRED)):
            return {**result, "baseline_eligibility": "source_revision_unverified"}
        result["baseline_eligibility"] = "eligible"
        units = ("reads", "writes", "outputs", "refreshes", "dirty_updates", "reconciliations")
        bw, cw = baseline.get("workload", {}), candidate.get("workload", {})
        if not isinstance(bw, dict) or not isinstance(cw, dict):
            return {**result, "workload_comparability": "missing_workload_dimensions"}
        if any(k not in bw or k not in cw for k in units):
            return {**result, "workload_comparability": "missing_workload_dimensions"}
        if any(not isinstance(bw[k], (int, float)) or isinstance(bw[k], bool) or
               not isinstance(cw[k], (int, float)) or isinstance(cw[k], bool) or
               bw[k] < 0 or cw[k] < 0 for k in units):
            return {**result, "workload_comparability": "invalid_workload"}
        if any(abs(cw[k] - bw[k]) > max(1, bw[k] * 0.1) for k in units):
            return {**result, "workload_comparability": "workload_outside_10pct"}
        result["workload_comparability"] = "matched_within_10pct"
        if missing_sources or result["missing_hours"]:
            return result
        if not (result["reconcile_attribution_observed"]
                and coverage.get("exclusive_source_attribution_verified") is True):
            return result
        a, b = baseline["total_attempts"], candidate["total_attempts"]
        if not (type(a) is int and type(b) is int and a >= 0 and b >= 0):
            return {**result, "baseline_eligibility": "invalid_attempt_totals"}
        result["system_wide_complete"] = True
        result["zero_activity_verified"] = True
        result["net_saved_requests"] = a - b
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
