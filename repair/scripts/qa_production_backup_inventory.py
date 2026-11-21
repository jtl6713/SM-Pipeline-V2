#!/usr/bin/env python3
"""READ-ONLY Supabase production backup inventory for the single live Studio.

Queries the official Management API using a private, read-only management
token. This does not request, trigger, restore, download or create backups.
The presence of a backup is NOT proof that a restore works and does not
authorize an in-place schema migration or a Worker deployment.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from urllib.request import HTTPRedirectHandler, Request, build_opener

PROJECT_REF = re.compile(r"^[a-z0-9]{20}$")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def utc_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError, TypeError) as exc:
        raise ValueError("Backup timestamp invalid") from exc
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("Backup timestamp not explicitly UTC")
    return parsed


def summarize_backups(document: dict, *, now: datetime,
                      max_age_hours: int = 36) -> dict:
    if not isinstance(document, dict):
        raise ValueError("Malformed backup inventory")
    if (not isinstance(max_age_hours, int) or isinstance(max_age_hours, bool)
        or not 1 <= max_age_hours <= 72):
        raise ValueError("Invalid backup recency window")
    if not isinstance(document.get("backups"), list):
        raise ValueError("Backup inventory missing complete backup list")
    if not isinstance(document.get("pitr_enabled"), bool):
        raise ValueError("Backup inventory missing PITR capability field")
    if not isinstance(document.get("walg_enabled"), bool):
        raise ValueError("Backup inventory missing physical backup capability field")
    if now.tzinfo is None or now.utcoffset().total_seconds() != 0:
        raise ValueError("Backup verification clock must be UTC")
    candidates = []
    for backup in document["backups"]:
        if not isinstance(backup, dict) or not isinstance(backup.get("status"), str):
            raise ValueError("Malformed backup inventory row")
        if backup["status"] == "COMPLETED":
            candidates.append(utc_time(backup.get("inserted_at")))
    latest = max(candidates) if candidates else None
    age_hours = ((now - latest).total_seconds() / 3600) if latest else None
    recent = age_hours is not None and 0 <= age_hours <= max_age_hours
    return {
        "read_only": True,
        "backups_observed": len(document["backups"]),
        "completed_backups_observed": len(candidates),
        "latest_completed_backup_utc": latest.isoformat().replace("+00:00", "Z") if latest else None,
        "latest_backup_age_hours": round(age_hours, 2) if age_hours is not None else None,
        "recent_completed_backup_observed": recent,
        "pitr_enabled": document["pitr_enabled"],
        "walg_enabled": document["walg_enabled"],
        # A platform receipt cannot prove a successful restore or rollback.
        "restore_test_verified": False,
        "rollback_approved": False,
        "schema_apply_authorized": False,
        "worker_deploy_authorized": False,
    }


def fetch_inventory(project_ref: str, token: str, *, requester=None,
                    now: datetime | None = None) -> dict:
    if not isinstance(project_ref, str) or not PROJECT_REF.fullmatch(project_ref):
        raise ValueError("Unverified production project identity")
    if not isinstance(token, str) or not token.strip():
        raise ValueError("Missing private read-only Supabase management token")
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/backups"
    request = Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
    }, method="GET")
    opener = build_opener(NoRedirect())
    requester = requester or (lambda req: opener.open(req, timeout=15))
    try:
        response = requester(request)
        with response:
            if getattr(response, "status", 200) != 200:
                raise ValueError("Supabase backup inventory HTTP status not successful")
            raw = response.read(256001)
    except Exception as exc:
        raise ValueError("Read-only Supabase backup inventory unavailable") from exc
    if len(raw) > 256000:
        raise ValueError("Supabase backup inventory exceeded maximum size")
    try:
        document = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ValueError("Supabase backup inventory response not JSON") from exc
    return summarize_backups(document, now=now or datetime.now(timezone.utc))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    args = parser.parse_args()
    approved = os.getenv("STUDIO_PRODUCTION_SUPABASE_PROJECT_REF", "")
    if not PROJECT_REF.fullmatch(approved) or approved != args.project_ref:
        raise SystemExit("BLOCKED: live production project does not match independent approval")
    # This is a Management API token, not the database service-role key.
    token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
    try:
        result = fetch_inventory(approved, token)
    except (ValueError, OSError):
        raise SystemExit("BLOCKED: authoritative backup inventory could not be verified")
    result["project_ref"] = approved
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["recent_completed_backup_observed"]:
        raise SystemExit("BLOCKED: no recent completed backup demonstrated")
    # Even a fresh backup is not proof of usable rollback. Operator signoff
    # and QA migration evidence are separate release prerequisites.


if __name__ == "__main__":
    main()
