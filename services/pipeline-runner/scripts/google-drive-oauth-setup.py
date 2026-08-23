"""Obtain a Google Drive-scoped refresh token for pipeline-runner SMV1."""

from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SERVICE_DIR = Path(
    os.environ.get(
        "PIPELINE_RUNNER_SERVICE_DIR",
        r"D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service",
    )
)
ENV_PATH = SERVICE_DIR / ".env"

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
]


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def save_refresh_token(path: Path, token: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    found = False
    out: list[str] = []
    for line in lines:
        if line.startswith("GOOGLE_REFRESH_TOKEN="):
            out.append(f"GOOGLE_REFRESH_TOKEN={token}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"GOOGLE_REFRESH_TOKEN={token}")
    path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    env = {**load_env(ENV_PATH), **os.environ}
    client_id = env.get("GOOGLE_CLIENT_ID", "")
    client_secret = env.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = env.get("GOOGLE_REDIRECT_URI", "http://localhost:3341/oauth2callback")
    if not client_id or not client_secret:
        print("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.", file=sys.stderr)
        return 1

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    print("\nOpen this URL if the browser does not launch automatically:\n")
    print(auth_url)
    print("\nRequested scopes:")
    for scope in SCOPES:
        print(f"  - {scope}")
    webbrowser.open(auth_url)

    parsed_redirect = urllib.parse.urlparse(redirect_uri)
    port = parsed_redirect.port or 80
    result: dict[str, str] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if urllib.parse.urlparse(self.path).path != parsed_redirect.path:
                self.send_response(404)
                self.end_headers()
                return
            if query.get("state", [""])[0] != state:
                self.send_error(400, "state mismatch")
                return
            if query.get("error"):
                result["error"] = query["error"][0]
            else:
                result["code"] = query.get("code", [""])[0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Authorization complete. Return to the terminal.")

        def log_message(self, format, *args):  # noqa: A003
            return

    server = HTTPServer((parsed_redirect.hostname or "127.0.0.1", port), Handler)
    print(f"\nWaiting for OAuth callback on {redirect_uri} ...")
    server.handle_request()

    if result.get("error"):
        print(f"OAuth error: {result['error']}", file=sys.stderr)
        return 1
    code = result.get("code")
    if not code:
        print("No authorization code received.", file=sys.stderr)
        return 1

    body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
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

    refresh = payload.get("refresh_token")
    if not refresh:
        print(
            "Google did not return a refresh_token. Revoke app access in Google Account, then rerun.",
            file=sys.stderr,
        )
        print(json.dumps({k: v for k, v in payload.items() if k != "access_token"}, indent=2))
        return 1
    if len(refresh) < 40:
        print("Refresh token looks truncated; refusing to save.", file=sys.stderr)
        return 1

    save_refresh_token(ENV_PATH, refresh)
    print(f"\nSaved GOOGLE_REFRESH_TOKEN to {ENV_PATH} (length {len(refresh)}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
