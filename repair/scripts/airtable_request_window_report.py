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


def read_shadow_snapshots(paths):
    snapshots = []
    for path in paths:
        with open(path, encoding="utf-8") as stream:
            obj = json.load(stream)
        when = datetime.fromisoformat(str(obj["captured_at"]).replace("Z", "+00:00"))
        if when.tzinfo is None:
            raise ValueError("Shadow snapshot missing timezone")
        metrics = obj.get("evidence") or {}
        if "airtable_dirty_batch_attempts" not in metrics:
            raise ValueError("Shadow snapshot missing Airtable request accounting")
        snapshots.append((when.astimezone(timezone.utc), int(metrics["airtable_dirty_batch_attempts"])))
    return sorted(snapshots)


def shadow_delta(snapshots, start, hours):
    from datetime import timedelta
    end = start + timedelta(hours=hours)
    # Accept a boundary sample no more than 75 minutes before the boundary.
    def prior(moment):
        matches = [(at, value) for at, value in snapshots if moment - timedelta(minutes=75) <= at <= moment]
        return matches[-1] if matches else None
    first, last = prior(start), prior(end)
    if not first or not last:
        return None
    delta = last[1] - first[1]
    if delta < 0:
        raise ValueError("Shadow cumulative request counter decreased; Worker storage reset or inconsistent source")
    return delta


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--events", nargs="+", required=True)
    parser.add_argument("--shadow-snapshots", nargs="*", default=[])
    parser.add_argument("--before", required=True, help="UTC ISO timestamp for baseline start")
    parser.add_argument("--after", required=True, help="UTC ISO timestamp for candidate start")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--coverage", nargs="*", default=[], help="Verified complete *log export* sources in both windows")
    args = parser.parse_args()
    if args.hours < 1:
        raise SystemExit("hours must be >=1")
    def parse(value):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not dt.tzinfo:
            raise ValueError("Timestamp needs offset")
        return dt.astimezone(timezone.utc)
    events = read_events(args.events)
    baseline, candidate = parse(args.before), parse(args.after)
    before = summarize(events, baseline, args.hours)
    after = summarize(events, candidate, args.hours)
    snapshots = read_shadow_snapshots(args.shadow_snapshots)
    shadow_before = shadow_delta(snapshots, baseline, args.hours)
    shadow_after = shadow_delta(snapshots, candidate, args.hours)
    if shadow_before is not None and shadow_after is not None:
        before["by_source"]["shadow_dirty_replay"] = shadow_before
        after["by_source"]["shadow_dirty_replay"] = shadow_after
        before["total_observed"] += shadow_before
        after["total_observed"] += shadow_after
    # These data are accounted from snapshot deltas, not from egress JSONL logs.
    covered = set(args.coverage) - {"shadow_dirty_replay"}
    if shadow_before is not None and shadow_after is not None:
        covered.add("shadow_dirty_replay")
    fully_covered = covered >= SOURCES
    savings = before["total_observed"] - after["total_observed"] if fully_covered else None
    print(json.dumps({
        "before": before, "after": after,
        "coverage_asserted": sorted(covered), "required_sources": sorted(SOURCES),
        "missing_coverage": sorted(SOURCES-covered), "system_wide_complete": fully_covered,
        "net_saved_requests": savings,
        "net_saved_percent": (round(savings / before["total_observed"] * 100, 2)
                              if savings is not None and before["total_observed"] else None),
        "warning": None if fully_covered else "Missing or incomplete Airtable egress coverage: net savings unknown.",
        "shadow_window_delta_note": "Snapshots are hourly; count comparisons are bounded and approximate to snapshot capture time.",
    }, indent=2))


if __name__ == "__main__":
    main()
