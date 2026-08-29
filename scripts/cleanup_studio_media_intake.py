#!/usr/bin/env python3
"""Delete Studio Media Assets that are not music or branding.

Keep: Asset_Role in {Music, Logo, Watermark}
Delete: Voiceover, Thumbnail, non-branding Image/Video, and intake/unclassified rows.
Never logs credential values.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from typing import Any

BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "appe33zkZn35yirTL").strip()
MEDIA_ASSETS_TABLE = os.environ.get("MEDIA_ASSETS_TABLE", "tblSITCujCsJTNcDe").strip()
KEEP_ROLES = {"music", "logo", "watermark"}
ALWAYS_DELETE_ROLES = {"voiceover", "thumbnail"}
IMAGE_VIDEO_CLASSES = {"image", "video"}
INTAKE_STATUSES_DELETE = {
    "created",
    "needs classification",
    "needs_classification",
    "pending",
    "queued",
    "processing",
    "error",
    "failed",
    "unclassified",
    "intake",
}

FIELDS = [
    "Asset Name",
    "Asset_Role",
    "Media_Class",
    "MIME_Type",
    "Intake_Status",
    "Do_Not_Use",
    "Google Drive File ID",
    "Classification_Status",
]


def pat() -> str:
    token = (os.environ.get("AIRTABLE_PAT") or "").strip()
    if not token.startswith("pat") or len(token) < 40:
        raise SystemExit("AIRTABLE_PAT missing or structurally invalid")
    return token


def req(method: str, url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "Authorization": f"Bearer {pat()}",
        "Content-Type": "application/json",
    }
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise SystemExit(f"Airtable {method} {exc.code}: {detail}") from exc


def list_all_media() -> list[dict]:
    records: list[dict] = []
    offset = None
    while True:
        params: list[tuple[str, str]] = [("pageSize", "100")]
        for field in FIELDS:
            params.append(("fields[]", field))
        if offset:
            params.append(("offset", offset))
        url = (
            f"https://api.airtable.com/v0/{BASE_ID}/{MEDIA_ASSETS_TABLE}"
            f"?{urllib.parse.urlencode(params)}"
        )
        payload = req("GET", url)
        records.extend(payload.get("records") or [])
        offset = payload.get("offset")
        if not offset:
            break
        time.sleep(0.2)
    return records


def field(record: dict, *names: str) -> Any:
    fields = record.get("fields") or {}
    for name in names:
        if name in fields and fields[name] not in (None, ""):
            return fields[name]
    return None


def role_of(record: dict) -> str:
    return str(field(record, "Asset_Role") or "").strip()


def media_class_of(record: dict) -> str:
    return str(field(record, "Media_Class") or "").strip()


def mime_of(record: dict) -> str:
    return str(field(record, "MIME_Type") or "").strip().lower()


def intake_of(record: dict) -> str:
    return str(field(record, "Intake_Status") or "").strip()


def name_of(record: dict) -> str:
    return str(field(record, "Asset Name") or "").strip() or record.get("id", "")


def inferred_image_or_video(record: dict) -> bool:
    media_class = media_class_of(record).lower()
    if media_class in IMAGE_VIDEO_CLASSES:
        return True
    mime = mime_of(record)
    return mime.startswith("image/") or mime.startswith("video/")


def is_intake(record: dict) -> bool:
    status = intake_of(record).lower()
    if not status:
        return False
    if status in INTAKE_STATUSES_DELETE:
        return True
    # Any non-empty intake status on a non-kept asset counts as studio intake cleanup.
    return True


def should_delete(record: dict) -> tuple[bool, str]:
    role = role_of(record)
    role_l = role.lower()
    if role_l in KEEP_ROLES:
        return False, "keep_branding_or_music"
    if role_l in ALWAYS_DELETE_ROLES:
        return True, f"role:{role or 'Voiceover/Thumbnail'}"
    if inferred_image_or_video(record):
        return True, f"non_branding_media:{media_class_of(record) or mime_of(record) or 'image/video'}"
    if is_intake(record):
        return True, f"studio_intake:{intake_of(record) or 'set'}"
    # Leftover non-music audio / other classified junk from intake (not Music/Logo/Watermark).
    if role_l in {"raw photo", "raw footage", "final output", "reference material", "other"}:
        return True, f"role:{role}"
    if not role and (mime_of(record).startswith("audio/") or media_class_of(record).lower() == "audio"):
        return True, "unclassified_audio_not_music"
    return False, "retain_unmatched"


def delete_ids(ids: list[str]) -> int:
    deleted = 0
    # Airtable allows up to 10 ids per DELETE.
    for i in range(0, len(ids), 10):
        chunk = ids[i : i + 10]
        params = urllib.parse.urlencode([("records[]", rid) for rid in chunk])
        url = f"https://api.airtable.com/v0/{BASE_ID}/{MEDIA_ASSETS_TABLE}?{params}"
        req("DELETE", url)
        deleted += len(chunk)
        time.sleep(0.25)
    return deleted


def main() -> int:
    apply = os.environ.get("APPLY_DELETES", "0").strip() == "1"
    records = list_all_media()
    keep: list[dict] = []
    delete: list[dict] = []
    reasons: Counter[str] = Counter()
    for record in records:
        doomed, reason = should_delete(record)
        summary = {
            "id": record.get("id"),
            "name": name_of(record),
            "Asset_Role": role_of(record),
            "Media_Class": media_class_of(record),
            "Intake_Status": intake_of(record),
            "reason": reason,
        }
        if doomed:
            delete.append(summary)
            reasons[reason.split(":")[0]] += 1
        else:
            keep.append(summary)

    report = {
        "total": len(records),
        "keep_count": len(keep),
        "delete_count": len(delete),
        "reason_counts": dict(reasons),
        "kept_roles": sorted({str(x.get("Asset_Role") or "") for x in keep}),
        "apply_deletes": apply,
        "keep_sample": keep[:50],
        "delete_sample": delete[:100],
    }
    out_path = os.environ.get("CLEANUP_REPORT_PATH", "/tmp/studio-media-cleanup-report.json")
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
    print(
        json.dumps(
            {
                "total": report["total"],
                "keep_count": report["keep_count"],
                "delete_count": report["delete_count"],
                "reason_counts": report["reason_counts"],
                "kept_roles": report["kept_roles"],
                "apply_deletes": apply,
                "report_path": out_path,
            },
            indent=2,
            sort_keys=True,
        )
    )

    if not apply:
        print("Dry run only. Set APPLY_DELETES=1 to delete.", file=sys.stderr)
        return 0

    deleted = delete_ids([str(x["id"]) for x in delete if x.get("id")])
    verify = list_all_media()
    remaining_bad = []
    kept_ok = []
    for record in verify:
        doomed, reason = should_delete(record)
        if doomed:
            remaining_bad.append({"id": record.get("id"), "name": name_of(record), "reason": reason})
        else:
            kept_ok.append(role_of(record) or "(blank)")
    result = {
        "deleted": deleted,
        "remaining_total": len(verify),
        "remaining_should_delete": len(remaining_bad),
        "remaining_keep_roles": sorted(set(kept_ok)),
        "remaining_bad_sample": remaining_bad[:50],
    }
    with open("/tmp/studio-media-cleanup-result.json", "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, sort_keys=True)
    print(json.dumps(result, indent=2, sort_keys=True))
    if remaining_bad:
        raise SystemExit(f"Cleanup incomplete: {len(remaining_bad)} deletable rows remain")
    # Safety: music/branding must still exist if they existed before.
    kept_roles = {str(x.get("Asset_Role") or "").lower() for x in keep}
    final_roles = {str(x or "").lower() for x in kept_ok}
    for required in sorted(kept_roles & KEEP_ROLES):
        if required not in final_roles:
            raise SystemExit(f"Safety failure: kept role disappeared: {required}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
