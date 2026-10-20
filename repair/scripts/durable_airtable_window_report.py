#!/usr/bin/env python3
"""Compare complete UTC-hour Airtable egress windows from durable snapshots.
Does not claim net savings absent complete system-wide source attestation.
"""
import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

def hour_key(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Timestamp must specify UTC offset")
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)

def count(data, start, end):
    if data.get("ok") is not True:
        return None
    result = defaultdict(int)
    for item in data.get("hourly", []):
        if start <= hour_key(item["hour_utc"]) < end:
            n = int(item["attempts"])
            if n < 0:
                raise ValueError("Negative attempt count")
            result[str(item["source"])] += n
    return dict(result)

def compare(worker, runner, start, hours):
    end = start + timedelta(hours=hours)
    a, b = count(worker, start, end), count(runner, start, end)
    if a is None or b is None:
        return {"ok": False, "reason": "source_unavailable", "window": [start.isoformat(), end.isoformat()]}
    merged = dict(a)
    for key, value in b.items():
        merged[key] = merged.get(key, 0) + value
    return {"ok": True, "window": [start.isoformat(), end.isoformat()],
            "by_source": merged, "total_instrumented": sum(merged.values())}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", required=True)
    ap.add_argument("--runner", required=True)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--hours", type=int, default=24)
    args = ap.parse_args()
    if args.hours < 1:
        raise SystemExit("Invalid window size")
    worker = json.loads(Path(args.worker).read_text())
    runner = json.loads(Path(args.runner).read_text())
    baseline = compare(worker, runner, hour_key(args.baseline), args.hours)
    candidate = compare(worker, runner, hour_key(args.candidate), args.hours)
    valid = baseline["ok"] and candidate["ok"]
    report = {"baseline": baseline, "candidate": candidate,
              "instrumented_comparison_available": valid,
              "system_wide_complete": False,
              "net_saved_requests": None,
              "net_saved_percent": None,
              "coverage_gap": "Other direct processes, zero-versus-missing hourly attestations, and matched-traffic baseline not proven"}
    if valid:
        report["instrumented_request_delta"] = baseline["total_instrumented"] - candidate["total_instrumented"]
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
