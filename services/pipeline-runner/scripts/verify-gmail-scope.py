"""Verify Gmail send scope on the pipeline-runner Google refresh token."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

SERVICE_DIR = Path(
    os.environ.get(
        "PIPELINE_RUNNER_SERVICE_DIR",
        r"D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service",
    )
)
load_dotenv(SERVICE_DIR / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from integrations.gmail import GmailClient  # noqa: E402


def main() -> int:
    try:
        token = GmailClient().access_token()
    except Exception as exc:
        print(f"oauth_error: {exc}")
        print("Run scripts/google-drive-oauth-setup.py after adding gmail.send scope.")
        return 1

    profile = requests.get(
        f"https://oauth2.googleapis.com/tokeninfo?access_token={token}",
        timeout=30,
    )
    print("tokeninfo_status", profile.status_code)
    if profile.ok:
        payload = profile.json()
        scopes = str(payload.get("scope") or "")
        print("scopes", scopes)
        if "gmail.send" in scopes:
            print("gmail_send_scope_ok")
            return 0
        print("gmail.send missing from token scopes")
        return 1

    print(profile.text[:400])
    if profile.status_code == 403:
        print("Re-auth required: python scripts/google-drive-oauth-setup.py")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
