#!/usr/bin/env python3
"""Validate *observed* core Airtable collector coverage from durable live exports.

One retrospective export can cover six complete UTC hours. This removes any
dependence on GitHub Actions executing each hour, but no missing heartbeat can
be filled in from an empty attempt log or a successful export GET.
This is a non-publishing evidence report, never PAT-revocation authorization.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

CORE = {
    "studio_worker": "profile_summary_durable_object",
    "pipeline_runner": "pipeline_runner_sqlite",
}
MIN_SAMPLES_PER_HOUR = 6
FIRST_BEAT_WITHIN_MINUTES = 10
LAST_BEAT_AFTER_MINUTES = 50


def utc(value):
    if not isinstance(value, str) or not (
        value.endswith("Z") or value.endswith("+00:00")
    ):
        raise ValueError("Expected an explicit UTC timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None or result.utcoffset() != timedelta(0):
        raise ValueError("Expected a UTC timestamp")
    return result.astimezone(timezone.utc)


def hour_string(dt):
    return dt.strftime("%Y-%m-%dT%H:00:00Z")


def verified_hour(source, payload, hour, artifact_ref):
    problems = []
    hour_text = hour_string(hour)
    rows = payload.get("collector_coverage")
    if not isinstance(rows, list):
        return None, [f"{source} {hour_text}: no persisted liveness coverage"]
    matching = [r for r in rows if isinstance(r, dict) and r.get("hour_utc") == hour_text]
    if len(matching) != 1:
        return None, [f"{source} {hour_text}: missing or duplicate liveness row"]
    item = matching[0]
    try:
        first, last = utc(item.get("first_at")), utc(item.get("last_at"))
        samples = item.get("samples")
        if type(samples) is not int or samples < MIN_SAMPLES_PER_HOUR:
            raise ValueError("insufficient independent liveness ticks")
        if not (hour <= first <= last < hour + timedelta(hours=1)):
            raise ValueError("liveness timestamps outside their claimed UTC hour")
        if first > hour + timedelta(minutes=FIRST_BEAT_WITHIN_MINUTES):
            raise ValueError("collector did not report near hour start")
        if last < hour + timedelta(minutes=LAST_BEAT_AFTER_MINUTES):
            raise ValueError("collector did not report near hour end")
    except (TypeError, ValueError) as error:
        problems.append(f"{source} {hour_text}: {error}")
    raw = payload.get("hourly")
    if not isinstance(raw, list):
        problems.append(f"{source} {hour_text}: attempt log missing")
        raw = []
    attempts = 0
    for event in raw:
        if not isinstance(event, dict):
            problems.append(f"{source}: malformed request event")
            continue
        try:
            event_hour = utc(event.get("hour_utc"))
            count = event.get("attempts")
            if type(count) is not int or count < 0:
                raise ValueError("invalid attempt count")
            if event_hour == hour:
                attempts += count
        except (TypeError, ValueError) as error:
            problems.append(f"{source}: invalid event: {error}")
    if not isinstance(artifact_ref, str) or not artifact_ref.strip():
        problems.append(f"{source}: real export artifact required")
    if problems:
        return None, problems
    return {
        "hour_utc": hour_text,
        "attempts": attempts,
        "collector_ok": True,
        "artifact_ref": artifact_ref,
        "collector_samples": samples,
        "first_at": item["first_at"],
        "last_at": item["last_at"],
    }, []


def core_coverage_report(worker, runner, start_utc, end_utc, *, worker_artifact, runner_artifact):
    problems = []
    try:
        start, end = utc(start_utc), utc(end_utc)
        if start.minute or start.second or start.microsecond or end.minute or end.second or end.microsecond:
            raise ValueError("use complete UTC-hour boundaries")
        hours = (end - start).total_seconds() / 3600
        if not 6 <= hours <= 48 or hours != int(hours):
            raise ValueError("window must be between 6 and 48 complete hours")
        if end > datetime.now(timezone.utc):
            raise ValueError("end hour is not complete")
    except (TypeError, ValueError) as error:
        return {"core_coverage_complete": False, "release_authorized": False,
                "blockers": [f"invalid window: {error}"], "sources": {}}

    sources = {}
    for name, (payload, artifact_ref) in {
        "studio_worker": (worker, worker_artifact),
        "pipeline_runner": (runner, runner_artifact),
    }.items():
        if not isinstance(payload, dict) or payload.get("ok") is not True or payload.get("source") != CORE[name]:
            problems.append(f"{name}: missing or wrong authenticated durable metrics source")
            continue
        try:
            captured = utc(payload.get("exported_at_utc") if name == "studio_worker"
                           else (payload.get("collector_heartbeat") or {}).get("observed_at"))
            if captured < end:
                raise ValueError("metrics exported before the quiet window closed")
        except (TypeError, ValueError) as error:
            problems.append(f"{name}: invalid export capture: {error}")
            continue
        samples = []
        for index in range(int(hours)):
            hour = start + timedelta(hours=index)
            entry, errors = verified_hour(name, payload, hour, artifact_ref)
            problems.extend(errors)
            if entry is not None:
                samples.append(entry)
        sources[name] = samples

    if not problems:
        for name, samples in sources.items():
            if len(samples) != int(hours):
                problems.append(f"{name}: incomplete measured hourly coverage")
    if not problems:
        for name, samples in sources.items():
            if any(row["attempts"] != 0 for row in samples):
                problems.append(f"{name}: Airtable request attempts observed")
    return {
        "core_coverage_complete": not problems,
        "release_authorized": False,
        "window": {"start_utc": start_utc, "end_utc": end_utc},
        "sources": sources,
        "blockers": sorted(set(problems)),
    }


def main():
    parser = argparse.ArgumentParser()
    for flag in ("worker", "runner", "start", "end", "worker-artifact", "runner-artifact", "output"):
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    worker = json.loads(Path(args.worker).read_text())
    runner = json.loads(Path(args.runner).read_text())
    result = core_coverage_report(
        worker, runner, args.start, args.end,
        worker_artifact=args.worker_artifact, runner_artifact=args.runner_artifact
    )
    Path(args.output).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"core_coverage_complete": result["core_coverage_complete"],
                      "blockers": result["blockers"],
                      "window": result.get("window")}, sort_keys=True))
    raise SystemExit(1 if args.require_complete and not result["core_coverage_complete"] else 0)


if __name__ == "__main__":
    main()
