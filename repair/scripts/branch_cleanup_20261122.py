#!/usr/bin/env python3
"""One-shot exact-head archive and lease-guarded cleanup of stale branch refs.

Only 30 reviewed, unowned branch heads from an immutable manifest are eligible.
Every candidate is protected by: expected SHA, unprotected ref, no open PR,
no incomplete GitHub Actions run, and a VERIFIED archive tag. No force-merge.
All writes are GitHub tags or deletion of exact stale refs; no Studio calls.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "jtl6713/SM-Pipeline-V2"
PREFIX = "archive/reviewed-20261122/"
MANIFEST = Path("repair/branch_cleanup_20261122_manifest.json")
REPORT = Path("branch-cleanup-20261122-report.json")


def fail(message: str) -> None:
    raise RuntimeError("REFUSE: " + message)


def api(path: str, method: str = "GET", body: object | None = None):
    token = os.environ.get("GH_TOKEN")
    if not token:
        fail("no GitHub Actions token")
    req = urllib.request.Request(
        "https://api.github.com/repos/" + REPO + ("/" + path if path else ""),
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=40) as response:
        data = response.read().decode("utf-8")
        return json.loads(data) if data else None


def encoded(name: str) -> str:
    return urllib.parse.quote(name, safe="/")


def branch_map() -> dict[str, dict]:
    rows = api("branches?per_page=100")
    if not isinstance(rows, list) or len(rows) >= 100:
        fail("truncated or invalid branch inventory")
    return {row["name"]: row for row in rows}


def open_pr_heads() -> set[str]:
    rows = api("pulls?state=open&per_page=100")
    if not isinstance(rows, list) or len(rows) >= 100:
        fail("truncated or invalid open PR inventory")
    return {
        row["head"]["ref"]
        for row in rows
        if ((row.get("head") or {}).get("repo") or {}).get("full_name") == REPO
    }


def active_actions(branch: str) -> bool:
    response = api(
        "actions/runs?per_page=100&branch=" + urllib.parse.quote(branch, safe="")
    )
    rows = response.get("workflow_runs", [])
    # Can't safely disprove in-flight work with a truncated history.
    if len(rows) >= 100:
        return True
    return any(row.get("status") != "completed" for row in rows)


def exact_eligible(name: str, sha: str) -> tuple[bool, str]:
    current = branch_map()
    branch = current.get(name)
    if not branch:
        return False, "missing_or_auto_deleted"
    if branch.get("protected"):
        return False, "protected"
    if (branch.get("commit") or {}).get("sha") != sha:
        return False, "moved_since_review"
    if name in open_pr_heads():
        return False, "has_open_pr"
    if active_actions(name):
        return False, "actions_in_flight_or_unverified"
    return True, "verified_inactive"


def tag_name(name: str) -> str:
    return PREFIX + name.replace("/", "--")


def tag_sha(name: str):
    path = "git/ref/tags/" + encoded(name)
    try:
        return api(path)["object"]["sha"]
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def archive(name: str, sha: str) -> str:
    tag = tag_name(name)
    existing = tag_sha(tag)
    if existing is None:
        api("git/refs", "POST", {"ref": "refs/tags/" + tag, "sha": sha})
    elif existing != sha:
        fail("archive tag collision: " + name)
    for attempt in range(8):
        if tag_sha(tag) == sha:
            print("ARCHIVE_VERIFIED", name, sha, tag, flush=True)
            return tag
        time.sleep(1)
    fail("archive ref never verified: " + name)


def main() -> None:
    if os.getenv("GITHUB_REPOSITORY") != REPO or os.getenv("GITHUB_REF") != "refs/heads/main":
        fail("wrong repository or non-main execution")
    if os.getenv("GITHUB_RUN_ATTEMPT") != "1":
        fail("one-shot cleanup must not be rerun")
    baseline = json.loads(MANIFEST.read_text())
    if baseline.get("schema") != "archive-reviewed-stale-branches-20261122.v1":
        fail("manifest version mismatch")
    if baseline.get("repository") != REPO:
        fail("manifest repo mismatch")
    candidates = baseline.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != 30:
        fail("expected exactly thirty reviewed refs")
    names = [row.get("branch") for row in candidates]
    if len(set(names)) != 30 or "main" in names:
        fail("candidate duplicates or protected main included")
    for item in candidates:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", item["branch"]):
            fail("unsafe branch name")
        if not re.fullmatch(r"[a-f0-9]{40}", str(item["sha"])):
            fail("invalid SHA")
    repo = api("")
    if repo.get("default_branch") != "main":
        fail("default branch is not main")
    current = branch_map()
    if not current.get("main", {}).get("protected"):
        fail("main unexpectedly unprotected")
    # The reviewed open PRs must remain available. They are not candidates.
    protected_heads = set(baseline.get("protected_open_pr_heads") or [])
    if len(protected_heads) != 10 or protected_heads & set(names):
        fail("reviewed open PR heads invalid or overlap with candidates")

    report = {
        "schema": "archive-cleanup-report.v1",
        "repository": REPO,
        "reviewed_candidates": len(candidates),
        "protected_open_pr_heads": sorted(protected_heads),
        "archived": [],
        "deleted": [],
        "skipped": {},
    }
    eligible = []
    # Check all candidates and their Actions/PR status BEFORE any mutation.
    for item in candidates:
        name, sha = item["branch"], item["sha"]
        ok, reason = exact_eligible(name, sha)
        if ok:
            eligible.append((name, sha))
        else:
            report["skipped"][name] = reason
            print("PRESERVE", name, reason, flush=True)
    print("PREFLIGHT_PASS", "eligible", len(eligible), "preserved", len(report["skipped"]), flush=True)

    # Phase 1: archive and VERIFY every eligible head before deleting any.
    for name, sha in eligible:
        archive(name, sha)
        report["archived"].append({"branch": name, "sha": sha, "tag": tag_name(name)})
    for name, sha in eligible:
        if tag_sha(tag_name(name)) != sha:
            fail("tag changed before deletion: " + name)
    print("ALL_ELIGIBLE_HEADS_ARCHIVED_BEFORE_FIRST_DELETE", len(eligible), flush=True)

    # Phase 2: revalidate branch lease, open PRs and in-flight Actions
    # immediately before deleting. Never force or delete newly moved refs.
    for name, sha in eligible:
        ok, reason = exact_eligible(name, sha)
        if not ok:
            report["skipped"][name] = "post_archive_" + reason
            print("PRESERVE_AFTER_ARCHIVE", name, reason, flush=True)
            continue
        if tag_sha(tag_name(name)) != sha:
            fail("tag no longer matches exact head: " + name)
        ref = "refs/heads/" + name
        subprocess.run(
            ["git", "push", "--force-with-lease=" + ref + ":" + sha,
             "origin", ":" + ref],
            check=True, timeout=65,
        )
        for _ in range(8):
            if name not in branch_map():
                break
            time.sleep(1)
        else:
            fail("deletion not verified: " + name)
        report["deleted"].append(name)
        print("LEASE_DELETED", name, flush=True)
    after = branch_map()
    report["remaining_branches"] = sorted(after)
    report["current_open_pr_heads"] = sorted(open_pr_heads())
    if "main" not in after or not after["main"]["protected"]:
        fail("post-cleanup main protection failed")
    if not report["current_open_pr_heads"]:
        fail("open PRs unexpectedly disappeared")
    if set(report["current_open_pr_heads"]) - set(after):
        fail("an open PR branch is missing after cleanup")
    REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print("BRANCH_CLEANUP_COMPLETE", json.dumps({
        "archived": len(report["archived"]), "deleted": len(report["deleted"]),
        "preserved_candidates": len(report["skipped"]),
        "remaining": len(report["remaining_branches"]),
        "open_pr_heads": len(report["current_open_pr_heads"]),
    }), flush=True)


if __name__ == "__main__":
    main()
