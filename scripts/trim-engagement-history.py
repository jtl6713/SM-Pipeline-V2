#!/usr/bin/env python3
"""Remove duplicate pending Engagement history actions from ENGAGEMENT_STORE_V1."""
import json
import os
import urllib.error
import urllib.request

BASE = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
RECORD_ID = "recE5RZ6AGckNFw19"
REMOVE = {
    "ea_mv01vp3b_a5axbl",
    "ea_mv01vlzk_lhac8y",
    "ea_mv01ushx_d2j4qw",
}
KEEP = "ea_mv01uo81_iv8p5z"
RESET_TARGET = "et_muzjvecv_2sf57t"  # dusk cityscapes — no remaining action


def req(method, url, pat, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {pat}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as resp:
        return json.load(resp)


def main():
    pat = (os.environ.get("AIRTABLE_PAT") or "").strip()
    if not pat:
        raise SystemExit("AIRTABLE_PAT missing")
    url = f"https://api.airtable.com/v0/{BASE}/{SETTINGS_TABLE}/{RECORD_ID}"
    row = req("GET", url, pat)
    fields = row.get("fields") or {}
    raw = fields.get("Setting_Value") or "{}"
    store = json.loads(raw)
    before = [a.get("action_id") for a in store.get("actions") or []]
    store["actions"] = [a for a in store.get("actions") or [] if a.get("action_id") not in REMOVE]
    after = [a.get("action_id") for a in store.get("actions") or []]
    if KEEP not in after:
        raise SystemExit(f"expected keep action missing after trim: {after}")
    if len(after) != 1:
        raise SystemExit(f"expected exactly 1 action, got {after}")
    for target in store.get("targets") or []:
        if target.get("target_id") == RESET_TARGET:
            target["approval_status"] = "pending"
    store["updated_at"] = "2026-10-08T21:40:00.000Z"
    req(
        "PATCH",
        url,
        pat,
        {"fields": {"Setting_Value": json.dumps(store, ensure_ascii=False, separators=(",", ":"))}},
    )
    print(json.dumps({"ok": True, "before": before, "after": after}, indent=2))


if __name__ == "__main__":
    main()
