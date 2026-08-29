"""One-off: re-run A3 classification for non-branding Media Assets (bypasses view filter)."""
from __future__ import annotations

from a3.processor import _classify_one
from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from render.fields import field_str

BRANDING_ROLES = {"Watermark", "Logo", "Thumbnail"}


def main() -> None:
    client = AirtableClient()
    rows = client.list_records(MEDIA_ASSETS_TABLE, max_records=500)
    pending = [
        row
        for row in rows
        if field_str(row, "Media_Class") != "Graphic"
        and field_str(row, "Asset_Role") not in BRANDING_ROLES
        and field_str(row, "Classification_Status") == "Needs Classification"
    ]
    print(f"Direct-classifying {len(pending)} remaining assets...")
    ok = err = 0
    metadata_hits = 0
    for index, row in enumerate(pending, 1):
        name = field_str(row, "Asset Name")
        try:
            result = _classify_one(client, row)
            ok += 1
            fresh = client.get_record(MEDIA_ASSETS_TABLE, row["id"])
            evidence = field_str(fresh, "Evidence_From_Metadata")
            if evidence:
                metadata_hits += 1
            print(
                f"  [{index}/{len(pending)}] OK {name[:55]} "
                f"-> {result.get('route')}/{result.get('status')}"
            )
        except Exception as exc:
            err += 1
            print(f"  [{index}/{len(pending)}] ERR {name[:55]} -> {exc}")
    print(f"DONE ok={ok} err={err} metadata_evidence={metadata_hits}")


if __name__ == "__main__":
    main()
