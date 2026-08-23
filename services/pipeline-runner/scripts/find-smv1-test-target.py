"""Find an isolated SMV1 test candidate in Airtable."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

BASE = "appe33zkZn35yirTL"
QUEUE = "tblBZLXPd1p2NRWRK"
REQUESTS = "tbl75nxNi6PMUjBQE"
PAT = os.environ.get("AIRTABLE_PAT", "")


def api(path: str, params: dict | None = None) -> dict:
    url = f"https://api.airtable.com/v0/{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {PAT}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    if not PAT:
        raise SystemExit("AIRTABLE_PAT is not set")

    formula = (
        "AND({Test_Run_ID}=BLANK(),OR("
        'AND({Asset_Kind}="Master Original",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded")),'
        'AND({Asset_Kind}="Platform Variant",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded")),'
        'AND(OR({Asset_Kind}="Master Original",{Asset_Kind}="Platform Variant"),'
        '{Transfer_Status}="Ready",{Preview_Status}="Pending")))'
    )
    rows = api(QUEUE, {"filterByFormula": formula, "maxRecords": 20}).get("records", [])
    if not rows:
        print(json.dumps({"ok": False, "message": "No eligible SMV1 queue rows found"}, indent=2))
        return

    by_pr: dict[str, list[dict]] = {}
    for row in rows:
        pr = row.get("fields", {}).get("Production_Request_Record_ID", "")
        by_pr.setdefault(str(pr), []).append(row)

    candidates = []
    for pr_id, items in by_pr.items():
        if not pr_id.startswith("rec"):
            continue
        kinds = {str(i.get("fields", {}).get("Asset_Kind") or "") for i in items}
        statuses = {str(i.get("fields", {}).get("Transfer_Status") or "") for i in items}
        candidates.append(
            {
                "production_request_record_id": pr_id,
                "outstanding_rows": len(items),
                "asset_kinds": sorted(kinds),
                "transfer_statuses": sorted(statuses),
                "sample_transfer_ids": [
                    str(i.get("fields", {}).get("Transfer_ID") or "")[:80] for i in items[:3]
                ],
            }
        )

    candidates.sort(key=lambda item: item["outstanding_rows"], reverse=True)
    best = candidates[0]
    pr = api(f"{REQUESTS}/{best['production_request_record_id']}")
    fields = pr.get("fields", {})
    print(
        json.dumps(
            {
                "ok": True,
                "recommended": best,
                "production_request_id": fields.get("Production_Request_ID"),
                "studio_item4_state": fields.get("Studio_Item4_State"),
                "studio_variant_status": fields.get("Studio_Variant_Status"),
                "studio_master_asset_status": fields.get("Studio_Master_Asset_Status"),
                "all_candidates": candidates[:5],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
