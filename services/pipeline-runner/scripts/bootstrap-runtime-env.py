"""Bootstrap pipeline-runner runtime .env using Supabase settings only.

The previous implementation read Airtable Pipeline Settings and copied its PAT
into the runner .env. Airtable is retired; no network fallback is permitted.
"""

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


def supabase_setting(name: str, *, url: str, key: str) -> str:
    if name not in SETTING_NAMES:
        raise ValueError("Unrecognized runner bootstrap setting")
    if not url.startswith("https://") or not key:
        raise RuntimeError("Supabase URL and service role key are required")
    query = urllib.parse.urlencode([
        ("payload->>source", "eq.pipeline"),
        ("payload->>Setting_Name", "eq." + name),
        ("payload->>Active", "eq.true"),
        ("select", "payload"),
        ("limit", "2"),
    ])
    endpoint = url.rstrip("/") + "/rest/v1/engagement_settings?" + query
    req = urllib.request.Request(endpoint, headers={
        "Authorization": "Bearer " + key,
        "apikey": key,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    if not isinstance(rows, list) or len(rows) > 1:
        raise RuntimeError("Supabase bootstrap setting lookup ambiguous for " + name)
    if not rows:
        return ""
    payload = rows[0].get("payload")
    if not isinstance(payload, dict):
        raise RuntimeError("Supabase bootstrap settings payload invalid for " + name)
    return str(payload.get("Setting_Value") or "").strip()


def main() -> None:
    youtube = read_dotenv(YOUTUBE_ENV)
    existing = read_dotenv(RUNTIME_ENV)
    url = os.environ.get("SUPABASE_URL", "").strip() or existing.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or existing.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )
    if not url or not key:
        raise SystemExit("Supabase credentials missing; runner bootstrap did not change the .env")

    values = {
        "PORT": "3350",
        "HOST": "127.0.0.1",
        "LOG_LEVEL": "info",
        "PUBLIC_BASE_URL": "https://pipeline.chicagoshining.com",
        "PIPELINE_RUNNER_SHARED_SECRET": existing.get("PIPELINE_RUNNER_SHARED_SECRET")
        or secrets.token_urlsafe(32),
        "SUPABASE_URL": url,
        "SUPABASE_SERVICE_ROLE_KEY": key,
        "STUDIO_WRITE_SOURCE": "supabase",
        "STUDIO_PHASE6_WRITE_SOURCE": "supabase",
        "STUDIO_RUNNER_OUTPUT_READ_SOURCE": "supabase",
        "STUDIO_RUNNER_CONTENT_READ_SOURCE": "supabase",
        "GOOGLE_CLIENT_ID": youtube.get("GOOGLE_CLIENT_ID", existing.get("GOOGLE_CLIENT_ID", "")),
        "GOOGLE_CLIENT_SECRET": youtube.get(
            "GOOGLE_CLIENT_SECRET", existing.get("GOOGLE_CLIENT_SECRET", "")
        ),
        "GOOGLE_REFRESH_TOKEN": existing.get("GOOGLE_REFRESH_TOKEN")
        or youtube.get("GOOGLE_REFRESH_TOKEN", ""),
        "GOOGLE_REDIRECT_URI": youtube.get("GOOGLE_REDIRECT_URI")
        or existing.get("GOOGLE_REDIRECT_URI")
        or "http://localhost:3341/oauth2callback",
        "SERVICE_VERSION": existing.get("SERVICE_VERSION", "2026-11-20-supabase-only"),
    }

    for name in SETTING_NAMES:
        env_key = {
            "STUDIO_VARIANT_SERVICE_BASE_URL": "VARIANT_SERVICE_URL",
            "STUDIO_VARIANT_SERVICE_TOKEN": "VARIANT_SERVICE_TOKEN",
            "R2_UPLOAD_WORKER_URL": "R2_UPLOAD_WORKER_URL",
            "R2_UPLOAD_WORKER_SECRET": "R2_UPLOAD_WORKER_SECRET",
            "STUDIO_PREVIEW_R2_PREFIX": "STUDIO_PREVIEW_R2_PREFIX",
        }[name]
        values[env_key] = existing.get(env_key) or supabase_setting(name, url=url, key=key)

    lines = [f"{k}={v}" for k, v in values.items() if v]
    RUNTIME_ENV.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "env_path": str(RUNTIME_ENV),
        "keys_written": sorted(values),
        "source": "supabase",
    }, indent=2))


if __name__ == "__main__":
    main()
