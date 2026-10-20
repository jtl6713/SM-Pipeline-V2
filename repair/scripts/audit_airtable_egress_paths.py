#!/usr/bin/env python3
"""Classify Airtable HTTP egress candidates by executable scope.

A static inventory is evidence of review, NOT proof that external Make/ops
integrations cannot call Airtable. Unknown production-runtime paths fail CI.
Standalone and staging paths remain explicitly outside the core accounting.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ("apps/studio-api", "services/pipeline-runner", "repair/scripts")
MARKERS = re.compile(r"api\.airtable\.com|airtable\.com/v0|AIRTABLE_API|_api_root")

# Only these entrypoints have confirmed instrumented request paths.
INSTRUMENTED = {
    "apps/studio-api/worker.js": "studio_worker_gateway: durable profile-summary DO hourly counts",
    "apps/studio-api/profile-summary-do.mjs": "shadow_dirty_replay: direct Airtable GETs counted in same DO",
    "services/pipeline-runner/airtable/client.py": "runner AirtableClient: intercepted by requests.Session.send",
    "services/pipeline-runner/airtable/egress_monitor.py": "runner-wide requests interception: persistent runner SQLite",
}


def scope(path):
    if path in INSTRUMENTED:
        return "runtime_instrumented", INSTRUMENTED[path]
    if path.startswith("apps/studio-api/") and (".staging." in path or ".template." in path):
        return "staging_only", "not a production Worker source; audit staging execution separately"
    if path.startswith("repair/scripts/") or path.startswith("services/pipeline-runner/scripts/"):
        return "standalone_unverified", "independent CLI/script execution may access production Airtable outside core counters"
    return "production_runtime_unverified", "Airtable API URL in production source outside a confirmed instrumented path"


def inventory():
    items = []
    for root in SOURCES:
        for path in (ROOT / root).rglob("*"):
            if path.suffix not in {".py", ".js", ".mjs", ".ts"}:
                continue
            if ".test." in path.name or path.name.startswith("test_") or "/tests/" in path.as_posix():
                continue
            rel = str(path.relative_to(ROOT))
            content = path.read_text(encoding="utf-8", errors="replace")
            hits = [n for n, line in enumerate(content.splitlines(), 1) if MARKERS.search(line)]
            if hits:
                category, explanation = scope(rel)
                items.append({
                    "path": rel, "lines": hits[:40],
                    "more_matches": max(0, len(hits) - 40),
                    "scope": category, "coverage": explanation,
                })
    return sorted(items, key=lambda v: v["path"])


def report():
    items = inventory()
    return {
        "candidates": items,
        "production_runtime_unverified_count": sum(x["scope"] == "production_runtime_unverified" for x in items),
        "standalone_unverified_count": sum(x["scope"] == "standalone_unverified" for x in items),
        "staging_only_count": sum(x["scope"] == "staging_only" for x in items),
        "runtime_instrumented_count": sum(x["scope"] == "runtime_instrumented" for x in items),
        "scope_warning": "Stand-alone/maintenance scripts and external Airtable clients are not included in core Worker/runner counters. Do not certify system-wide savings without separate evidence.",
    }


if __name__ == "__main__":
    print(json.dumps(report(), indent=2))
