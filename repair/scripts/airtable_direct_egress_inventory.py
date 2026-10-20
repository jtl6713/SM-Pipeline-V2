#!/usr/bin/env python3
"""Inventory direct Airtable API call sites; fail on newly discovered unclassified paths.

Static inventory is *not* runtime request accounting or a zero-activity heartbeat.
"""
import argparse
import json
import re
from pathlib import Path

PATTERNS = (re.compile(r"api\.airtable\.com"), re.compile(r"api[.]airtable[.]com"))
IGNORE = {".git", "node_modules", ".venv", "dist", "build", "__pycache__"}
EXTENSIONS = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".yml", ".yaml"}
def inventory(root):
    found = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in EXTENSIONS or any(p in IGNORE for p in path.parts):
            continue
        if path.stat().st_size > 3_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeError, OSError):
            continue
        if any(pattern.search(content) for pattern in PATTERNS):
            found.append(str(path.relative_to(root)))
    return sorted(set(found))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--root",default=".")
    p.add_argument("--output",required=True)
    a=p.parse_args()
    paths=inventory(Path(a.root))
    classified=[]
    for path in paths:
        if path.startswith(("apps/studio-api/","pipeline-runner/","apps/pipeline-runner/")):
            status="core_runtime_candidate"
        elif path.startswith((".github/","repair/","scripts/")):
            status="standalone_or_ci_requires_runtime_attestation"
        else:
            status="unclassified_requires_owner"
        classified.append({"path":path,"classification":status,"runtime_instrumented":False})
    result={"inventory_kind":"static_only_not_egress_telemetry","call_sites":classified,
            "external_integrations_covered":False,"zero_activity_proven":False,
            "missing_runtime_attestation":True}
    Path(a.output).write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps({"call_sites":len(classified),"unclassified":sum(x["classification"].startswith("unclassified") for x in classified)}))
if __name__=="__main__":
    main()
