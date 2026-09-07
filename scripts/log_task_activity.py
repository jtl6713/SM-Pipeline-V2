#!/usr/bin/env python3
"""POST a Task Organizer event. Used by CI so test results show in Studio logs."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", default="test_result")
    parser.add_argument("--suite", default="")
    parser.add_argument("--job", default="")
    parser.add_argument("--conclusion", default="")
    parser.add_argument("--detail", default="")
    parser.add_argument("--parts-json", default="")
    parser.add_argument("--sha", default="")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--run-url", default="")
    args = parser.parse_args()

    url = os.environ.get("TASKS_ACTIVITY_URL") or "https://tasks.chicagoshining.com/agent-activity/log-event"
    server = os.environ.get("GITHUB_SERVER_URL") or "https://github.com"
    repo = os.environ.get("GITHUB_REPOSITORY") or ""
    run_id = args.run_id or os.environ.get("CI_RUN_ID") or os.environ.get("GITHUB_RUN_ID") or ""
    sha = args.sha or os.environ.get("CI_SHA") or os.environ.get("GITHUB_SHA") or None
    run_url = args.run_url or os.environ.get("CI_RUN_URL") or ""
    if not run_url and repo and run_id:
        run_url = f"{server}/{repo}/actions/runs/{run_id}"
    payload = {
        "workflow": os.environ.get("CI_WORKFLOW") or os.environ.get("GITHUB_WORKFLOW") or args.suite or None,
        "suite": args.suite or os.environ.get("CI_WORKFLOW") or os.environ.get("GITHUB_WORKFLOW") or None,
        "job": args.job or os.environ.get("GITHUB_JOB") or None,
        "conclusion": args.conclusion or None,
        "sha": sha,
        "ref": os.environ.get("GITHUB_REF_NAME") or os.environ.get("GITHUB_REF") or None,
        "run_id": run_id or None,
        "run_url": run_url or None,
        "detail": args.detail or None,
        "message": " ".join(part for part in [args.suite or os.environ.get("GITHUB_WORKFLOW"), args.conclusion] if part),
    }
    if args.parts_json:
        try:
            parts = json.loads(args.parts_json)
        except json.JSONDecodeError as exc:
            print(f"log_task_activity_parts_json {exc}", file=sys.stderr)
            parts = None
        if isinstance(parts, list) and parts:
            payload["parts"] = parts
    body = json.dumps(
        {
            "task_id": 1,
            "agent_id": 13,
            "type": args.type,
            "payload": {key: value for key, value in payload.items() if value},
        }
    ).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            print(response.read().decode()[:500])
    except urllib.error.HTTPError as exc:
        print(f"log_task_activity_http {exc.code} {exc.read()[:300]!r}", file=sys.stderr)
    except Exception as exc:
        print(f"log_task_activity_failed {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
