#!/usr/bin/env python3
"""Read-only 48-hour Airtable request rollup from sanitized durable snapshots.

A successful source export is not proof that all processes/periods are covered.
Never label baseline/candidate differences as net savings without a verified
traffic-matched treatment and independent other-writer coverage.
"""
import argparse
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


def utc(value):
    value = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Time must include UTC offset")
    return value.astimezone(timezone.utc)


def gather(worker, runner):
    rows = []
    for name, data in (("worker", worker), ("runner", runner)):
        if data.get("ok") is not True or not isinstance(data.get("hourly"), list):
            continue
        for row in data["hourly"]:
            n = int(row["attempts"])
            if n < 0:
                raise ValueError("negative count")
            at = utc(row["hour_utc"])
            if at.minute or at.second or at.microsecond:
                raise ValueError("hour is not aligned to UTC")
            rows.append((at, str(row["source"]), str(row["method"]), str(row["status_class"]), n, name))
    return rows


def window(rows, start, end):
    sources, classes, rate_limited_by_source = defaultdict(int), defaultdict(int), defaultdict(int)
    observed_hours = set()
    for hour, source, method, status, count, provider in rows:
        if start <= hour < end:
            sources[source] += count
            classes[status] += count
            if status == "429":
                rate_limited_by_source[source] += count
            observed_hours.add((provider, hour))
    return {"start_utc": start.isoformat(), "end_utc": end.isoformat(),
            "attempts_observed": sum(sources.values()),
            "by_source": dict(sorted(sources.items())),
            "by_status_class": dict(sorted(classes.items())),
            "known_429_attempts": sum(rate_limited_by_source.values()),
            "known_429_by_source": dict(sorted(rate_limited_by_source.items())),
            "ambiguous_legacy_4xx_attempts": classes.get("4xx", 0),
            "429_coverage_note": "Known 429s are a lower bound; historical 4xx and missing writers cannot be assumed zero.",
            "worker_hours_with_events": len({h for p, h in observed_hours if p == "worker"}),
            "runner_hours_with_events": len({h for p, h in observed_hours if p == "runner"}),
            "note": "Hours with no events are ambiguous (zero activity or missing exporter)."}


def report(worker, runner, captured_at):
    captured = utc(captured_at)
    boundary = captured.replace(minute=0, second=0, microsecond=0)
    rows = gather(worker, runner)
    older = window(rows, boundary - timedelta(hours=48), boundary - timedelta(hours=24))
    recent = window(rows, boundary - timedelta(hours=24), boundary)
    present = worker.get("ok") is True and runner.get("ok") is True
    # A missing hour is not zero traffic. Withhold differences until both
    # sources have activity in every hour of both windows. This conservative
    # check cannot certify zero-activity hours; those require independent
    # collector liveness attestations before a complete savings claim.
    comparable = present and all(
        snapshot["worker_hours_with_events"] == 24 and
        snapshot["runner_hours_with_events"] == 24
        for snapshot in (older, recent)
    )
    return {"captured_at": captured.isoformat(), "core_sources_collected": present,
            "hourly_coverage_sufficient_for_observed_difference": comparable,
            "prior_24h": older, "latest_complete_24h": recent,
            "observed_difference_requests": (older["attempts_observed"] - recent["attempts_observed"]) if comparable else None,
            "system_wide_complete": False, "net_saved_requests": None,
            "not_yet_proven": ["complete 24-hour instrumentation history", "standalone and external Airtable writers",
                               "matched workload/traffic comparability", "zero-versus-missing hour attestations"],
            "interpretation": "Observed difference only; never equate to treatment-driven net savings."}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", required=True)
    parser.add_argument("--runner", required=True)
    parser.add_argument("--captured-at", required=True)
    parser.add_argument("--output", default="airtable-hourly-rollup.json")
    args = parser.parse_args()
    data = report(json.loads(Path(args.worker).read_text()), json.loads(Path(args.runner).read_text()), args.captured_at)
    Path(args.output).write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
