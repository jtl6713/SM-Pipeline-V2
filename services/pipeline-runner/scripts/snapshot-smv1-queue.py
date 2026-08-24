"""Snapshot SMV1 queue row before/after test."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request

BASE = "appe33zkZn35yirTL"
QUEUE = "tblBZLXPd1p2NRWRK"
PAT = os.environ.get("AIRTABLE_PAT", "")


def api(path: str, params: dict | None = None) -> dict:
    url = f"https://api.airtable.com/v0/{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {PAT}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def rows_for_pr(pr_id: str) -> list[dict]:
    formula = f"{{Production_Request_Record_ID}}='{pr_id}'"
    return api(QUEUE, {"filterByFormula": formula, "maxRecords": 20}).get("records", [])


def summarize(records: list[dict]) -> list[dict]:
    out = []
    for row in records:
        f = row.get("fields", {})
        out.append(
            {
                "id": row.get("id"),
                "transfer_id": f.get("Transfer_ID"),
                "asset_kind": f.get("Asset_Kind"),
                "transfer_status": f.get("Transfer_Status"),
                "preview_status": f.get("Preview_Status"),
                "drive_file_id": f.get("Drive_File_ID"),
                "media_asset_record_id": f.get("Media_Asset_Record_ID"),
                "error_message": f.get("Error_Message"),
            }
        )
    return out


def main() -> None:
    pr_id = sys.argv[1] if len(sys.argv) > 1 else "recaw9dPB5OMT6SgN"
    print(json.dumps({"production_request_record_id": pr_id, "rows": summarize(rows_for_pr(pr_id))}, indent=2))


if __name__ == "__main__":
    main()
