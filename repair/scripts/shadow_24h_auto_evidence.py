#!/usr/bin/env python3
"""Fail-closed rolling 24-hour shadow freshness evidence from retained Actions artifacts.

Reads the current and nearest ~24h-old sanitized cumulative evidence snapshots.
Never infers Airtable-commit-to-UI latency or total Airtable request savings.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from shadow_freshness_window_report import delta


def utc(value):
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Observation timestamp lacks timezone")
    return dt.astimezone(timezone.utc)


def compare(current, prior=None):
    result = {
        "ready": False,
        "freshness_gate_passed": False,
        "net_airtable_savings": None,
        "observation": "dirty notification to authoritative shadow apply; excludes Airtable write and browser rendering",
        "captured_at": current.get("captured_at"),
    }
    if not current.get("complete") or current.get("error"):
        return {**result, "reason": "current_shadow_unhealthy"}
    if prior is None:
        return {**result, "reason": "no_prior_24h_artifact"}
    if not prior.get("complete") or prior.get("error"):
        return {**result, "reason": "prior_shadow_unhealthy"}
    try:
        start, end = utc(prior["captured_at"]), utc(current["captured_at"])
        elapsed = (end-start).total_seconds()/3600
        result["hours_observed"] = round(elapsed, 3)
        result["window_start"] = start.isoformat()
        result["window_end"] = end.isoformat()
        if not (23 <= elapsed <= 25):
            return {**result, "reason": "not_a_24h_window"}
        metrics = delta((start, prior["evidence"]), (end, current["evidence"]))
    except (ValueError, KeyError, TypeError, OverflowError) as exc:
        return {**result, "reason": "missing_or_reset_shadow_counters", "error_type": type(exc).__name__}
    return {
        **result,
        "ready": True,
        "reason": "measured",
        "freshness_gate_passed": metrics["p95_15s_gate"],
        "minimum_30_samples_met": metrics["minimum_30_samples_met"],
        "p95_upper_bound_ms": metrics["p95_upper_bound_ms"],
        "observed_samples": metrics["counts"]["dirty_applied"],
        "dirty_record_notifications": metrics["counts"]["dirty_enqueued"],
        "airtable_dirty_reread_attempts": metrics["counts"]["airtable_dirty_batch_attempts"],
        "airtable_dirty_reread_errors": metrics["counts"]["airtable_dirty_batch_errors"],
        "applied_within_15s": metrics["applied_within_15s"],
        "within_15s_fraction": metrics["within_15s_fraction"],
        "histogram": metrics["lag_bucket_counts"],
        "over_60s": metrics["lag_over_60000"],
        "warning": "Freshness is notification-to-apply only. Do not enable Home reads or infer net Airtable savings from this result.",
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--current", required=True)
    p.add_argument("--prior")
    p.add_argument("--output", default="freshness-24h.json")
    args = p.parse_args()
    current = json.loads(Path(args.current).read_text())
    prior = json.loads(Path(args.prior).read_text()) if args.prior and Path(args.prior).exists() else None
    out = compare(current, prior)
    Path(args.output).write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
