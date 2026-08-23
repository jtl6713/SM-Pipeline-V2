"""Bootstrap pipeline-runner runtime .env from YouTube uploader + Airtable settings."""

from __future__ import annotations

import json
import os
import secrets
import urllib.parse
import urllib.request
from pathlib import Path

PIPELINE_ROOT = Path(r"D:\Content Creation\ChicagoShining Pipeline")
RUNTIME_ENV = PIPELINE_ROOT / "Services" / "pipeline-runner" / "service" / ".env"
YOUTUBE_ENV = PIPELINE_ROOT / "Services" / "youtube-uploader" / "service" / ".env"
BASE = "appe33zkZn35yirTL"
SETTINGS = "tblpHPWeEkyJaF7ql"
PAT = os.environ.get("AIRTABLE_PAT", "")

SETTING_NAMES = [
    "STUDIO_VARIANT_SERVICE_BASE_URL",
    "STUDIO_VARIANT_SERVICE_TOKEN",
    "R2_UPLOAD_WORKER_URL",
    "R2_UPLOAD_WORKER_SECRET",
    "STUDIO_PREVIEW_R2_PREFIX",
]


def read_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip()
    return out


def airtable_setting(name: str) -> str:
    formula = urllib.parse.urlencode(
        {"filterByFormula": f"AND({{Setting_Name}}='{name}',{{Active}}=1)", "maxRecords": 1}
    )
    url = f"https://api.airtable.com/v0/{BASE}/{SETTINGS}?{formula}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {PAT}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode())
    records = payload.get("records", [])
    if not records:
        return ""
    return str(records[0].get("fields", {}).get("Setting_Value") or "").strip()


def main() -> None:
    if not PAT:
        raise SystemExit("AIRTABLE_PAT missing")

    youtube = read_dotenv(YOUTUBE_ENV)
    existing = read_dotenv(RUNTIME_ENV)

    values = {
        "PORT": "3350",
        "HOST": "127.0.0.1",
        "LOG_LEVEL": "info",
        "PUBLIC_BASE_URL": "https://pipeline.chicagoshining.com",
        "PIPELINE_RUNNER_SHARED_SECRET": existing.get("PIPELINE_RUNNER_SHARED_SECRET")
        or secrets.token_urlsafe(32),
        "AIRTABLE_PAT": PAT,
        "AIRTABLE_BASE_ID": BASE,
        "GOOGLE_CLIENT_ID": youtube.get("GOOGLE_CLIENT_ID", existing.get("GOOGLE_CLIENT_ID", "")),
        "GOOGLE_CLIENT_SECRET": youtube.get(
            "GOOGLE_CLIENT_SECRET", existing.get("GOOGLE_CLIENT_SECRET", "")
        ),
        "GOOGLE_REFRESH_TOKEN": existing.get("GOOGLE_REFRESH_TOKEN")
        or youtube.get("GOOGLE_REFRESH_TOKEN", ""),
        "GOOGLE_REDIRECT_URI": youtube.get("GOOGLE_REDIRECT_URI")
        or existing.get("GOOGLE_REDIRECT_URI")
        or "http://localhost:3341/oauth2callback",
        "SERVICE_VERSION": "2026-08-23-smv1",
    }

    for name in SETTING_NAMES:
        env_key = {
            "STUDIO_VARIANT_SERVICE_BASE_URL": "VARIANT_SERVICE_URL",
            "STUDIO_VARIANT_SERVICE_TOKEN": "VARIANT_SERVICE_TOKEN",
            "R2_UPLOAD_WORKER_URL": "R2_UPLOAD_WORKER_URL",
            "R2_UPLOAD_WORKER_SECRET": "R2_UPLOAD_WORKER_SECRET",
            "STUDIO_PREVIEW_R2_PREFIX": "STUDIO_PREVIEW_R2_PREFIX",
        }[name]
        values[env_key] = existing.get(env_key) or airtable_setting(name)

    lines = [f"{key}={value}" for key, value in values.items() if value]
    RUNTIME_ENV.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "env_path": str(RUNTIME_ENV), "keys_written": list(values.keys())}, indent=2))


if __name__ == "__main__":
    main()
