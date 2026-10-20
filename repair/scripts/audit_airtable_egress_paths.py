#!/usr/bin/env python3
"""Conservative inventory of possible Airtable HTTP paths; not proof of complete coverage."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ("apps/studio-api", "services/pipeline-runner", "repair/scripts")
MARKERS = re.compile(r"api\.airtable\.com|airtable\.com/v0|AIRTABLE_API|_api_root|requests\.(?:get|patch|post|delete|put)\(")
KNOWN = {
    "apps/studio-api/worker.js": "studio_worker_gateway plus non-gateway paths: manual audit",
    "apps/studio-api/profile-summary-do.mjs": "shadow_dirty_replay direct fetch: metrics in /status",
    "services/pipeline-runner/airtable/client.py": "pipeline_runner_client: instrumented methods",
}
rows = []
for root in SOURCES:
    for p in (ROOT / root).rglob("*"):
        if p.suffix not in {".py", ".js", ".mjs", ".ts"}:
            continue
        if ".test." in p.name or p.name.startswith("test_") or "/tests/" in p.as_posix():
            continue
        rel = str(p.relative_to(ROOT))
        text = p.read_text(encoding="utf-8", errors="replace")
        hits = []
        for number, line in enumerate(text.splitlines(), 1):
            if MARKERS.search(line):
                hits.append(number)
        if hits:
            rows.append({"path": rel, "lines": hits[:40], "more_matches": max(0, len(hits)-40),
                         "coverage": KNOWN.get(rel, "UNVERIFIED; requires classification")})
print(json.dumps({"instrumented_known_paths": KNOWN, "candidates": rows,
                  "unverified_count": sum(x["coverage"].startswith("UNVERIFIED") for x in rows),
                  "note": "Conservative static candidate inventory, not exhaustive dynamic coverage."}, indent=2))
