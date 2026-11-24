"""Verify the exact fresh Ops runner deploy receipt, never print raw logs."""
import argparse
import json
import re
from pathlib import Path

SHA = re.compile(r"[0-9a-f]{40}")
PASS = "PASS - controlled deployment completed and verified."
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def verify_receipt(payload, expected_job, expected_commit):
    if not SHA.fullmatch(expected_commit):
        raise ValueError("invalid_expected_commit")
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        raise ValueError("ops_receipt_unavailable")
    job = payload.get("job")
    if not isinstance(job, dict):
        raise ValueError("ops_job_unavailable")
    if (job.get("id") != expected_job or job.get("action") != "deploy"
            or job.get("service") != "pipeline-runner" or job.get("status") != "ok"
            or type(job.get("exitCode")) is not int or job["exitCode"] != 0):
        raise ValueError("ops_job_identity_or_status_invalid")
    log = job.get("log")
    if not isinstance(log, str):
        raise ValueError("ops_job_log_unavailable")
    lines = [line.strip() for line in ANSI.sub("", log).splitlines()]
    passes = [i for i, line in enumerate(lines) if line == PASS]
    if len(passes) != 1:
        raise ValueError("ops_controlled_deployment_pass_unverified")
    commits = [m.group(1) for line in lines[passes[0] + 1:]
               if (m := re.fullmatch(r"Commit:\s+([0-9a-f]{40})", line))]
    if commits != [expected_commit]:
        raise ValueError("ops_deployed_commit_missing_or_mismatched")
    return {"deployed_commit": expected_commit, "ops_job_id": expected_job,
            "controlled_deployment_verified": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("receipt", type=Path)
    parser.add_argument("expected_job")
    parser.add_argument("expected_commit")
    args = parser.parse_args()
    try:
        result = verify_receipt(json.loads(args.receipt.read_text(encoding="utf-8")),
                                args.expected_job, args.expected_commit)
    except (ValueError, OSError) as exc:
        # Only fixed diagnostic codes from our verifier, not arbitrary log data.
        code = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[a-z_]+", str(exc)) else "invalid_receipt"
        raise SystemExit(code)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
