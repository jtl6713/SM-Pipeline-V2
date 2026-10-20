#!/usr/bin/env python3
"""Report genuine observed 24-hour shadow deltas from hourly cumulative evidence.

Never infer missing samples, total Airtable request savings, or mutation-to-UI latency.
Accept a window only when boundary observations are within 75 minutes and cumulative
counters do not reset. Histogram buckets are disjoint, not cumulative.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

BUCKETS = [1000, 2500, 5000, 10000, 15000, 30000, 60000]
COUNTERS = ("dirty_enqueued", "dirty_applied", "airtable_dirty_batch_attempts",
            "airtable_dirty_batch_successes", "airtable_dirty_batch_errors")


def load(paths):
    rows = []
    for name in paths:
        data = json.loads(Path(name).read_text())
        at = datetime.fromisoformat(data["captured_at"].replace("Z", "+00:00"))
        if at.tzinfo is None:
            raise ValueError("Missing UTC offset")
        rows.append((at.astimezone(timezone.utc), data["evidence"]))
    return sorted(rows)


def delta(before, after):
    a, b = before[1], after[1]
    fields = {}
    for key in COUNTERS:
        diff = int(b.get(key, 0)) - int(a.get(key, 0))
        if diff < 0:
            raise ValueError("Cumulative counter reset: " + key)
        fields[key] = diff
    ah = {int(x["le_ms"]): int(x["count"]) for x in a["dirty_lag_le_buckets"]}
    bh = {int(x["le_ms"]): int(x["count"]) for x in b["dirty_lag_le_buckets"]}
    buckets = {}
    for bound in BUCKETS:
        count = bh[bound] - ah[bound]
        if count < 0:
            raise ValueError("Histogram counter reset: " + str(bound))
        buckets[bound] = count
    overflow = int(b.get("dirty_lag_over_60000", 0)) - int(a.get("dirty_lag_over_60000", 0))
    if overflow < 0 or sum(buckets.values()) + overflow != fields["dirty_applied"]:
        raise ValueError("Histogram counts differ from applied dirty count")
    total = fields["dirty_applied"]
    le15 = sum(v for k, v in buckets.items() if k <= 15000)
    p95_upper_bound = next((k for k in BUCKETS if sum(v for bound, v in buckets.items() if bound <= k) >= .95 * total), None) if total else None
    return {"counts": fields, "lag_bucket_counts": {str(k): v for k, v in buckets.items()},
            "lag_over_60000": overflow, "applied_within_15s": le15,
            "within_15s_fraction": le15 / total if total else None,
            "p95_upper_bound_ms": p95_upper_bound,
            "minimum_30_samples_met": total >= 30,
            "p95_15s_gate": total >= 30 and p95_upper_bound is not None and p95_upper_bound <= 15000,
            "interpretation": "Notification-to-application histogram bound, not Airtable-commit-to-browser latency"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("evidence", nargs="+")
    ap.add_argument("--hours", type=int, default=24)
    args = ap.parse_args()
    rows = load(args.evidence)
    if len(rows) < 2:
        raise SystemExit("Need at least two hourly snapshots")
    start, end = rows[0], rows[-1]
    elapsed = (end[0] - start[0]).total_seconds() / 3600
    if elapsed < args.hours - 1.25 or elapsed > args.hours + 1.25:
        raise SystemExit("Insufficient comparable elapsed hours: " + str(round(elapsed, 2)))
    out = delta(start, end)
    out.update({"window_start": start[0].isoformat(), "window_end": end[0].isoformat(),
                "hours_observed": round(elapsed, 2), "system_wide_airtable_savings": None,
                "requires": "Durable Worker + runner + direct + reconcile request counters for matched comparison"})
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
