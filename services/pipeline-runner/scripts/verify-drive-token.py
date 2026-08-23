"""Verify Google refresh token can access Drive API."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ENV = Path(r"D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env")


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def token(access: dict) -> str:
    body = urllib.parse.urlencode(
        {
            "client_id": access["GOOGLE_CLIENT_ID"],
            "client_secret": access["GOOGLE_CLIENT_SECRET"],
            "refresh_token": access["GOOGLE_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        }
    ).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode())
    return str(payload.get("access_token") or "")


def main() -> int:
    env = load_env(ENV)
    access_token = token(env)
    req = urllib.request.Request(
        "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        print(json.dumps({"ok": False, "status": exc.code, "body": exc.read().decode()[:500]}))
        return 1
    user = payload.get("user", {})
    print(
        json.dumps(
            {
                "ok": True,
                "drive_scope": True,
                "user": user.get("emailAddress"),
                "display_name": user.get("displayName"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
