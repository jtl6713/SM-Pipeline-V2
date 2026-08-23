"""Swap Google Drive URLs in outputs 219/222/223 render packages for CDN previews.

Google Drive answers large crops with an HTML scan page, so Remotion failed with
exit code 1. The variant queue now holds a public CDN preview for every crop, so
map each Drive file id onto its preview and rewrite the stamped packages.
"""

import json
import os
import re
import urllib.parse
import urllib.request

PAT = os.environ["AIRTABLE_PAT"]
BASE = "appe33zkZn35yirTL"
OUTPUTS = "tblrlPeboBthkplH0"
QUEUE = "tblBZLXPd1p2NRWRK"
REQUEST = "recii0mzjlA2etf7k"
HEADERS = {"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}

TARGETS = {
    "recRy7MGA2unM7boq": 219,
    "recC76ADiTH73tTjr": 222,
    "recn2VzjlAewErzpc": 223,
}

DRIVE_ID = re.compile(r"\w{25,}")


def api(path, params=None, method="GET", payload=None):
    url = f"https://api.airtable.com/v0/{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def preview_map():
    rows = api(
        QUEUE,
        {
            "filterByFormula": (
                f"AND({{Production_Request_Record_ID}}='{REQUEST}',"
                "{Preview_Status}='Ready')"
            ),
            "pageSize": 100,
        },
    )["records"]
    mapping = {}
    for row in rows:
        preview = str(row["fields"].get("Preview_URL") or "").strip()
        if not preview:
            continue
        stem = preview.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        for token in DRIVE_ID.findall(stem):
            mapping[token] = preview
        drive_id = str(row["fields"].get("Google_Drive_File_ID") or "").strip()
        if drive_id:
            mapping[drive_id] = preview
    return mapping


def rewrite(blob, mapping):
    """Replace any Drive URL whose file id has a CDN preview."""
    if not blob:
        return blob, 0
    hits = 0

    def swap(match):
        nonlocal hits
        url = match.group(0)
        for token in DRIVE_ID.findall(url):
            if token in mapping:
                hits += 1
                return mapping[token]
        return url

    return re.sub(r"https://[^\"\\\s]*drive[^\"\\\s]*", swap, blob), hits


def main():
    mapping = preview_map()
    print(f"previews available: {len(set(mapping.values()))}")

    for record_id, label in TARGETS.items():
        record = api(f"{OUTPUTS}/{record_id}")
        fields = {}
        for field in ("Selected_Assets_JSON", "Render_Clip_List_JSON"):
            patched, hits = rewrite(record["fields"].get(field), mapping)
            if hits:
                fields[field] = patched
            print(f"  {label} {field}: {hits} swapped")
        # music_url legitimately streams from Drive; only image clips break Remotion.
        clip_drive = re.compile(r"\\?\"(?:url|src)\\?\"\s*:\s*\\?\"https://[^\"\\]*drive")
        leftover = 0
        for field in ("Selected_Assets_JSON", "Render_Clip_List_JSON"):
            leftover += len(clip_drive.findall(fields.get(field) or record["fields"].get(field) or ""))
        if leftover:
            print(f"  {label} SKIPPED: {leftover} clip URLs still on Drive")
            continue
        fields.update(
            {
                "Render_Status": "Ready for Render",
                "Output_Status": "In Production",
                "Remotion_Error_Message": None,
                "Final_File_Error_Message": None,
                "Remotion_Job_ID": None,
            }
        )
        api(f"{OUTPUTS}/{record_id}", method="PATCH", payload={"fields": fields, "typecast": True})
        print(f"  {label} re-armed for render")


if __name__ == "__main__":
    main()
