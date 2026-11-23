"""Read-only incident #2670 gateway-load comparison.

Pure offline evaluator: never connects to Supabase, GitHub, Cloudflare, or
publishing APIs. Input must be aggregate, redacted five-minute edge-log buckets.
Refuses to certify a >=70% reduction without complete workload evidence.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

METRIC_FIELDS = (
    "requests", "errors_5xx", "errors_522", "outbox_404", "mutations",
)
REQUIRED_WORK_KINDS = (
    "production_jobs", "media_transfers", "render_jobs", "studio_reads",
)
BUCKET_SECONDS = 300
MIX_TOLERANCE = 0.10


def _parse_utc(value: object) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("bucket start_utc must be an ISO-8601 UTC timestamp ending in Z")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid bucket start_utc") from exc
    if result.tzinfo != timezone.utc or result.second or result.microsecond:
        raise ValueError("bucket boundaries must be exact UTC minutes")
    if result.minute % 5:
        raise ValueError("bucket boundaries must align to five-minute UTC intervals")
    return result


def _nonnegative_int(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer")
    return value


def summarize_window(window: object) -> dict:
    """Validate exact, consecutive five-minute log coverage and aggregate."""
    if not isinstance(window, dict):
        raise ValueError("window must be an object")
    if window.get("scope") != "supabase_edge_logs":
        raise ValueError("scope must be supabase_edge_logs")
    if window.get("coverage_complete") is not True:
        raise ValueError("partial or unverified log coverage")
    buckets = window.get("buckets")
    if not isinstance(buckets, list) or not 4 <= len(buckets) <= 288:
        raise ValueError("provide between 4 and 288 complete five-minute buckets")
    totals = {name: 0 for name in METRIC_FIELDS}
    seen = set()
    previous = None
    for bucket in buckets:
        if not isinstance(bucket, dict):
            raise ValueError("bucket must be an object")
        at = _parse_utc(bucket.get("start_utc"))
        if at in seen:
            raise ValueError("duplicate bucket")
        seen.add(at)
        if previous is not None and at != previous + timedelta(seconds=BUCKET_SECONDS):
            raise ValueError("missing, overlapping, or out-of-order log bucket")
        previous = at
        for name in METRIC_FIELDS:
            totals[name] += _nonnegative_int(bucket.get(name), name)
        if not (
            bucket["errors_522"] <= bucket["errors_5xx"] <= bucket["requests"]
            and bucket["outbox_404"] <= bucket["requests"]
            and bucket["mutations"] <= bucket["requests"]
        ):
            raise ValueError("bucket contains logically inconsistent counts")
    return {
        "start_utc": buckets[0]["start_utc"],
        "end_utc_exclusive": (previous + timedelta(seconds=BUCKET_SECONDS))
            .isoformat().replace("+00:00", "Z"),
        "minutes": len(buckets) * 5,
        "bucket_count": len(buckets),
        "requests_per_five_minutes": round(totals["requests"] / len(buckets), 2),
        **totals,
    }


def _work_units(window: dict) -> dict[str, int] | None:
    work = window.get("work_units")
    if not isinstance(work, dict) or set(work) != set(REQUIRED_WORK_KINDS):
        return None
    try:
        for kind, value in work.items():
            _nonnegative_int(value, kind)
    except ValueError:
        return None
    if any(work[kind] == 0 for kind in REQUIRED_WORK_KINDS):
        return None
    return work


def _comparable_workload(before: dict, after: dict) -> tuple[bool, str]:
    if before.get("workload_coverage_complete") is not True or after.get("workload_coverage_complete") is not True:
        return False, "Canonical job/media/render/Studio read coverage was not established for both windows."
    a = _work_units(before)
    b = _work_units(after)
    if a is None or b is None:
        return False, "Missing nonzero counts of production jobs, transfers, renders, or Studio reads."
    a_total, b_total = sum(a.values()), sum(b.values())
    for kind in REQUIRED_WORK_KINDS:
        if abs(a[kind] / a_total - b[kind] / b_total) > MIX_TOLERANCE:
            return False, f"Workload mix differs by more than 10 percentage points for {kind}."
    # Even a matching job mix is not a controlled benchmark. Coverage and
    # job-type counts are mandatory before treating a result as comparable.
    return True, "Complete workload counts and comparable job mix were supplied."


def compare_windows(before: dict, after: dict) -> dict:
    baseline = summarize_window(before)
    current = summarize_window(after)
    if baseline["requests"] == 0:
        raise ValueError("baseline has zero observed requests; cannot compute a reduction")
    observed_drop = round(
        100 * (1 - current["requests_per_five_minutes"]
               / baseline["requests_per_five_minutes"]), 1
    ) if baseline["requests"] else None

    comparable, reason = _comparable_workload(before, after)
    target = {
        "status": "INCONCLUSIVE",
        "reason": reason,
        "target_reduction_pct": 70,
        "normalized_reduction_pct": None,
    }
    if comparable:
        old_units = sum(before["work_units"].values())
        new_units = sum(after["work_units"].values())
        old_per_unit = baseline["requests"] / old_units
        new_per_unit = current["requests"] / new_units
        normalized_drop = round(100 * (1 - new_per_unit / old_per_unit), 1)
        target.update({
            "status": "PASS" if normalized_drop >= 70 else "FAIL",
            "reason": "Workload-normalized Supabase gateway requests, using supplied complete job-type counts.",
            "normalized_reduction_pct": normalized_drop,
        })

    claims = after.get("claim_audit")
    duplicate_claims = {"status": "INCONCLUSIVE", "reason": "No audited cross-process claim evidence supplied."}
    if isinstance(claims, dict):
        attempts = claims.get("claim_attempts")
        dupes = claims.get("duplicate_claims")
        if (isinstance(attempts, int) and not isinstance(attempts, bool)
            and attempts > 0 and isinstance(dupes, int)
            and not isinstance(dupes, bool) and 0 <= dupes <= attempts
            and claims.get("cross_process_evidence_complete") is True):
            duplicate_claims = {
                "status": "PASS" if dupes == 0 else "FAIL",
                "claim_attempts": attempts, "duplicate_claims": dupes,
            }

    return {
        "incident": "2670",
        "baseline": baseline,
        "recovery": current,
        "observed_gateway_request_rate_drop_pct": observed_drop,
        "warning": "Observed request-rate changes alone do not establish equal throughput or the 70% engineering target.",
        "target_70pct": target,
        "outbox_404": {"status": "PASS" if current["outbox_404"] == 0 else "FAIL",
                       "observed_count": current["outbox_404"],
                       "window_minutes": current["minutes"]},
        "http_5xx": {"status": "PASS" if current["errors_5xx"] == 0 else "FAIL",
                     "observed_count": current["errors_5xx"],
                     "window_minutes": current["minutes"]},
        "duplicate_claims": duplicate_claims,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path,
                        help="Redacted JSON with baseline and recovery windows")
    parser.add_argument("--output", type=Path, help="Optional sanitized output JSON path")
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    result = compare_windows(data["baseline"], data["recovery"])
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
