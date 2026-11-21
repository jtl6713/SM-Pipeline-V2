#!/usr/bin/env python3
"""Non-mutating Supabase-only QA code audit for Worker deployment.

Synthetic QA history was copied and reconciled in production Supabase.
Deployment checks validate no Airtable gateway or authority remains in QA code,
not a manually maintained data-migration approval flag. This tool does not
authorize publishing, deploy a Worker, or access provider APIs.
"""
from __future__ import annotations
import json
from pathlib import Path


def inspect_qa_sources(qa_http: str, qa_core: str, qa_governance: str) -> dict:
    blockers = []
    if "airtableFetch" in qa_http:
        blockers.append("QA HTTP service still calls the Airtable compatibility gateway")
    if 'writeAuthority:"Airtable"' in qa_http or "writeAuthority:'Airtable'" in qa_http:
        blockers.append("QA catalog still advertises Airtable as write authority")
    if 'writeAuthority:"Supabase"' not in qa_http and "writeAuthority:'Supabase'" not in qa_http:
        blockers.append("QA catalog lacks Supabase write-authority attestation")
    if 'observation.source!=="Airtable"' in qa_core or 'observation.source !== "Airtable"' in qa_core:
        blockers.append("QA canonical-run assertion still expects Airtable")
    if 'writeAuthority:"Airtable"' in qa_governance or "writeAuthority:'Airtable'" in qa_governance:
        blockers.append("QA immutable-event governance still stamps Airtable authority")
    return {
        "qa_supabase_source_gate_passed": not blockers,
        "release_authorized": False,
        "read_only": True,
        "blockers": blockers,
    }


def inspect_repo(repo_root: Path) -> dict:
    return inspect_qa_sources(
        (repo_root / "apps/studio-api/qa-http.mjs").read_text(),
        (repo_root / "apps/studio-api/qa-test-core.mjs").read_text(),
        (repo_root / "apps/studio-api/qa-governance.mjs").read_text(),
    )


def main():
    root = Path(__file__).resolve().parents[2]
    result = inspect_repo(root)
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["qa_supabase_source_gate_passed"]:
        raise SystemExit("BLOCKED: QA code still contains Airtable authority or fallback.")


if __name__ == "__main__":
    main()
