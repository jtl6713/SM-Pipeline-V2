#!/usr/bin/env python3
"""Weekly GitHub issue-closure audit. Conservative, auditable, stdlib only.

The workflow checks *every* open issue, but auto-closes only explicit opt-ins
with a complete checklist and trusted, independently verifiable evidence.
Never treats merged code as equivalent to real production acceptance.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MARKER = "<!-- SM_PIPELINE_CLOSURE_ACCEPTANCE_V1 -->"
REPORT_MARKER = "<!-- SM_PIPELINE_WEEKLY_REVIEW:"
CHECK_PENDING = re.compile(r"(?m)^\s*[-*]\s*\[\s\]\s+")
CHECK_DONE = re.compile(r"(?mi)^\s*[-*]\s*\[[x]\]\s+")
REPORT_ISSUE = 2885
MAX_REPORT_ROWS = 20


class GitHubError(RuntimeError):
    pass


class GitHub:
    def __init__(self, repo: str, token: str):
        self.repo = repo
        self.token = token

    def call(self, method: str, path: str, data: dict | None = None):
        url = "https://api.github.com" + path
        body = json.dumps(data).encode("utf-8") if data is not None else None
        request = Request(url, data=body, method=method, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + self.token,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "sm-pipeline-weekly-closure/1.0",
            **({"Content-Type": "application/json"} if body is not None else {}),
        })
        try:
            with urlopen(request, timeout=35) as resp:
                payload = resp.read()
                return json.loads(payload) if payload else {}
        except (HTTPError, URLError, TimeoutError) as error:
            # Never expose API response bodies or access tokens in logs.
            code = getattr(error, "code", "network")
            raise GitHubError(f"GitHub {method} {path} failed ({code})") from error

    def get(self, path: str):
        return self.call("GET", path)

    def post(self, path: str, data: dict):
        return self.call("POST", path, data)

    def patch(self, path: str, data: dict):
        return self.call("PATCH", path, data)

    def pages(self, path: str):
        results = []
        for page in range(1, 501):
            delimiter = "&" if "?" in path else "?"
            batch = self.get(f"{path}{delimiter}per_page=100&page={page}")
            if not isinstance(batch, list):
                raise GitHubError(f"Expected list from {path}")
            results.extend(batch)
            if len(batch) < 100:
                return results
        raise GitHubError("Pagination exceeded limit, refusing incomplete audit")


def labels(issue: dict) -> set[str]:
    return {str(label.get("name", "")).lower() for label in issue.get("labels", [])
            if isinstance(label, dict)}


def checkbox_counts(issue: dict) -> tuple[int, int]:
    body = str(issue.get("body") or "")
    return len(CHECK_DONE.findall(body)), len(CHECK_PENDING.findall(body))


def field(text: str, label: str) -> str:
    match = re.search(rf"(?im)^{re.escape(label)}:\s*(.*?)\s*$", text)
    return match.group(1).strip() if match else ""


def parse_receipt(comment: dict, number: int, repo: str, approvers: set[str]):
    if str((comment.get("user") or {}).get("login", "")).lower() not in approvers:
        return None
    body = str(comment.get("body") or "")
    if MARKER not in body:
        return None
    if field(body, "Issue") != f"#{number}":
        return {"error": "Acceptance receipt references the wrong issue"}
    if field(body, "Acceptance") != "PASS":
        return {"error": "Latest trusted acceptance receipt is not PASS"}
    if field(body, "Manual QA") not in {"PASS", "NOT_REQUIRED"}:
        return {"error": "Trusted receipt needs Manual QA: PASS or NOT_REQUIRED"}
    notes = field(body, "Notes")
    if len(notes) < 25 or notes.lower() in {"not applicable", "not tested"}:
        return {"error": "Trusted receipt needs specific acceptance observations"}
    prefix = "https://github.com/" + repo
    run = field(body, "Evidence")
    pr = field(body, "PR")
    run_match = re.fullmatch(re.escape(prefix) + r"/actions/runs/([1-9][0-9]*)", run)
    pr_match = re.fullmatch(re.escape(prefix) + r"/pull/([1-9][0-9]*)", pr)
    if not run_match or not pr_match:
        return {"error": "Trusted receipt needs same-repository Actions run and PR URLs"}
    return {
        "run_id": int(run_match.group(1)),
        "pr_number": int(pr_match.group(1)),
        "login": (comment.get("user") or {}).get("login"),
        "comment_url": comment.get("html_url") or "",
        "manual_qa": field(body, "Manual QA"),
    }


def evaluate(issue: dict, api: GitHub, approvers: set[str]) -> tuple[str, str]:
    """Return a precise blocker, or ('ready', verified receipt URL)."""
    name = labels(issue)
    if "closure:hold" in name:
        return "held", "Explicit closure:hold label"
    completed, pending = checkbox_counts(issue)
    if pending:
        return "pending_checklist", f"{pending} unchecked acceptance item(s)"
    if not completed:
        return "missing_checklist", "No completed acceptance checklist to validate"
    if "closure:auto" not in name:
        return "not_opted_in", "No closure:auto opt-in; manual closure remains available"

    number = int(issue["number"])
    path = f"/repos/{api.repo}/issues/{number}/comments"
    comments = api.pages(path)
    # The most recent trusted receipt takes precedence, including a revocation.
    receipts = [parse_receipt(comment, number, api.repo, approvers)
                for comment in reversed(comments)]
    receipt = next((item for item in receipts if item is not None), None)
    if receipt is None:
        return "missing_receipt", "No owner-verified acceptance comment"
    if "error" in receipt:
        return "invalid_receipt", receipt["error"]

    run = api.get(f"/repos/{api.repo}/actions/runs/{receipt['run_id']}")
    pr = api.get(f"/repos/{api.repo}/pulls/{receipt['pr_number']}")
    if (run.get("status") != "completed" or run.get("conclusion") != "success"
            or (run.get("repository") or {}).get("full_name", "").lower() != api.repo.lower()):
        return "unverified_evidence", "Referenced Actions run is not a completed success in this repository"
    if (not pr.get("merged_at")
            or (pr.get("base") or {}).get("ref") != "main"
            or (pr.get("base") or {}).get("repo", {}).get("full_name", "").lower() != api.repo.lower()):
        return "unverified_evidence", "Referenced PR is not verified merged into this repository main"
    return "ready", str(receipt["comment_url"])


def mdesc(issue: dict) -> str:
    title = str(issue.get("title", "")).replace("|", "\\|").replace("\n", " ").strip()[:90]
    return f"[#{issue['number']}](https://github.com/{issue.get('_repo','')}/issues/{issue['number']}) {title}"


def create_report(items: list[dict], decisions: dict[int, tuple[str, str]],
                  closed: list[int], dry_run: bool, repo: str, run_id: str) -> str:
    count = Counter(v[0] for v in decisions.values())
    total = len(items)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    link = f"https://github.com/{repo}/actions/runs/{run_id}" if run_id.isdigit() else ""
    lines = [
        f"{REPORT_MARKER}{run_id} -->",
        f"## Weekly GitHub issue closure review — {timestamp}",
        f"**Mode:** {'DRY RUN — no issues closed' if dry_run else 'Weekly verified closure enabled'}",
        f"**Audited:** {total} open issues (PRs and permanent report excluded) "
        f"| **Verified eligible:** {count['ready']} | **Closed:** {len(closed)}",
        f"**Outstanding checklists:** {count['pending_checklist']} | "
        f"**No acceptance checklist:** {count['missing_checklist']} | "
        f"**Not opted in:** {count['not_opted_in']} | **Explicit holds:** {count['held']} | "
        f"**Receipt/evidence blockers:** "
        f"{sum(count[x] for x in ('missing_receipt','invalid_receipt','unverified_evidence','error'))}",
        (f"[View this workflow run]({link})" if link else ""),
        "",
        "### Known active handoffs",
    ]
    by_id = {int(i["number"]): i for i in items}
    for issue_num in (2876, 2670):
        if issue_num in by_id:
            key, reason = decisions[issue_num]
            lines.append(f"- {mdesc(by_id[issue_num])} — **{key.replace('_',' ')}**: {reason}")
    lines.extend(["", "### Closures / eligible candidates"])
    if closed:
        for issue_num in closed[:MAX_REPORT_ROWS]:
            lines.append(f"- Closed [#{issue_num}](https://github.com/{repo}/issues/{issue_num}) "
                         "after trusted receipt and GitHub API verification")
    elif not count["ready"]:
        lines.append("- No issues met the explicit auto-closure policy; nothing closed.")
    if dry_run:
        for i in items:
            if decisions[int(i["number"])][0] == "ready":
                lines.append(f"- DRY RUN ready: {mdesc(i)}")
    lines.extend(["", "### Actionable review queue (recently updated issues)"])
    priority = ("pending_checklist", "missing_receipt", "invalid_receipt",
                "unverified_evidence", "held", "not_opted_in", "missing_checklist", "error")
    for category in priority:
        group = [i for i in items if decisions[int(i["number"])][0] == category]
        if not group:
            continue
        lines.append(f"**{category.replace('_',' ').capitalize()} ({len(group)}):**")
        for item in group[:MAX_REPORT_ROWS if category in priority[:4] else 8]:
            reason = decisions[int(item["number"])][1]
            lines.append(f"- {mdesc(item)} — {reason}")
        if len(group) > (MAX_REPORT_ROWS if category in priority[:4] else 8):
            lines.append(f"- …and {len(group) - (MAX_REPORT_ROWS if category in priority[:4] else 8)} more")
    lines.extend(["",
        "### Closure rules and next action",
        "- The script never infers visual quality or a production success from a merge alone.",
        "- To opt in, complete every body acceptance checkbox, add label **closure:auto**, "
        "and post an owner-authored signed acceptance receipt with real successful "
        "Actions run, merged PR, explicit Manual QA and concrete observations.",
        "- Unverified, manually assessed, and incident issues remain open. "
        "See this issue's opening message for the receipt template.",
    ])
    return "\n".join(filter(lambda x: x is not None, lines)) + "\n"


def run(api: GitHub, *, report_issue: int, apply: bool,
        approvers: set[str], run_id: str) -> tuple[str, list[int], int]:
    repo_path = f"/repos/{api.repo}"
    issues = [
        i for i in api.pages(repo_path + "/issues?state=open&sort=updated&direction=desc")
        if "pull_request" not in i and int(i.get("number", 0)) != report_issue
    ]
    decisions: dict[int, tuple[str, str]] = {}
    closed: list[int] = []
    errors = 0
    for item in issues:
        num = int(item["number"])
        item["_repo"] = api.repo
        try:
            decision = evaluate(item, api, approvers)
            # Re-read immediate pre-close state and acceptance to avoid stale checklists.
            if decision[0] == "ready" and apply:
                current = api.get(f"{repo_path}/issues/{num}")
                if current.get("state") != "open":
                    decision = ("held", "Issue state changed before closure")
                else:
                    confirmation = evaluate(current, api, approvers)
                    if confirmation != decision:
                        decision = ("held", "Acceptance changed before closure")
                    else:
                        api.post(f"{repo_path}/issues/{num}/comments", {
                            "body": (
                                "Automated weekly issue closure: verified checked acceptance items, "
                                "explicit closure:auto opt-in, owner-authored acceptance receipt, "
                                "successful GitHub Actions run and merged PR. "
                                f"Receipt: {decision[1]}. Review: "
                                f"https://github.com/{api.repo}/actions/runs/{run_id}."
                            )
                        })
                        api.patch(f"{repo_path}/issues/{num}", {
                            "state": "closed", "state_reason": "completed"
                        })
                        closed.append(num)
            decisions[num] = decision
        except (GitHubError, KeyError, TypeError, ValueError) as exc:
            errors += 1
            decisions[num] = ("error", f"Verification unavailable ({type(exc).__name__}); left open")
    report = create_report(issues, decisions, closed, not apply, api.repo, run_id)
    return report, closed, errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="Close only issues with verified, explicit opt-in receipts")
    parser.add_argument("--report-issue", type=int, default=REPORT_ISSUE)
    args = parser.parse_args()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    run_id = os.environ.get("GITHUB_RUN_ID", "local")
    approvers = {v.strip().lower() for v in
                 os.environ.get("CLOSURE_APPROVERS", "jtl6713").split(",") if v.strip()}
    if not token or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        print("Missing GitHub credentials/repository; no audit or closures performed.", file=sys.stderr)
        return 2
    if not approvers:
        print("No trusted approver configured; refusing to run.", file=sys.stderr)
        return 2
    api = GitHub(repo, token)
    report, closed, errors = run(api, report_issue=args.report_issue, apply=args.apply,
                                 approvers=approvers, run_id=run_id)
    summary = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(report)
    print(report[:20000])
    existing = api.pages(f"/repos/{repo}/issues/{args.report_issue}/comments")
    marker = f"{REPORT_MARKER}{run_id} -->"
    if not any(marker in str(comment.get("body") or "") for comment in existing):
        api.post(f"/repos/{repo}/issues/{args.report_issue}/comments", {"body": report[:65000]})
    if errors:
        print(f"Failed closed on {errors} verification/API errors; see report.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
