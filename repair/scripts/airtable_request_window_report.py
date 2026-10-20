#!/usr/bin/env python3
"""Compare same-length hourly Airtable egress windows from structured event exports.

Input files are JSONL logs of studio_airtable_egress_v1 events, optionally prefixed
by a logger name; shadow evidence JSON snapshots can be supplied separately.
Fail closed on incomplete coverage: this script never treats missing sources as 0.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone


SOURCES = {"studio_worker_gateway", "pipeline_runner_http", "shadow_dirty_replay", "other_direct"}


def read_events(paths):
    events = []
    for path in paths:
        with open(path, encoding="utf-8") as stream:
            for line in stream:
                if "studio_airtable_egress_v1" not in line:
                    continue
                raw = line.split("studio_airtable_egress_v1", 1)[1].strip()
                item = json.loads(raw)
                if item.get("source") not in SOURCES:
                    raise ValueError("Unknown Airtable egress source " + str(item.get("source")))
                at = datetime.fromisoformat(item["at"].replace("Z", "+00:00"))
                if at.tzinfo is None:
                    raise ValueError("Naive timestamp")
                item["_at"] = at.astimezone(timezone.utc)
                events.append(item)
    return events


def summarize(events, start, hours):
    from datetime import timedelta
    end = start + timedelta(hours=hours)
    relevant = [e for e in events if start <= e["_at"] < end]
    sources = Counter()
    statuses = Counter()
    for event in relevant:
        count = int(event.get("request_count", 1))
        if count < 1:
            raise ValueError("Invalid request count")
        sources[event["source"]] += count
        statuses[str(event.get("status", 0))] += count
    return {"from": start.isoformat(), "to": end.isoformat(),
            "total_observed": sum(sources.values()), "by_source": dict(sources),
            "statuses": dict(statuses), "observed_events": len(relevant)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--events", nargs="+", required=True)
    parser.add_argument("--before", required=True, help="UTC ISO timestamp for baseline start")
    parser.add_argument("--after", required=True, help="UTC ISO timestamp for candidate start")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--coverage", nargs="*", default=[], help="Sources independently verified to have complete exports in both windows")
    args = parser.parse_args()
    if args.hours < 1:
        raise SystemExit("hours must be >=1")
    def parse(value):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not dt.tzinfo:
            raise ValueError("Timestamp needs offset")
        return dt.astimezone(timezone.utc)
    events = read_events(args.events)
    before = summarize(events, parse(args.before), args.hours)
    after = summarize(events, parse(args.after), args.hours)
    needed = sorted(SOURCES)
    fully_covered = set(args.coverage) >= SOURCES
    savings = before["total_observed"] - after["total_observed"] if fully_covered else None
    print(json.dumps({
        "before": before, "after": after,
        "coverage_asserted": sorted(set(args.coverage)), "required_sources": needed,
        "system_wide_complete": fully_covered,
        "net_saved_requests": savings,
        "net_saved_percent": (round(savings / before["total_observed"] * 100, 2)
                              if savings is not None and before["total_observed"] else None),
        "warning": None if fully_covered else "Partial instrumentation/export: do not claim net Airtable savings.",
    }, indent=2))


if __name__ == "__main__":
    main()
