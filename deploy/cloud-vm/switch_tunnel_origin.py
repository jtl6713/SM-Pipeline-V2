#!/usr/bin/env python3
"""Patch one Cloudflare Tunnel hostname origin (Windows standby vs cloud VM).

Remotely managed tunnels evaluate localhost on the machine running cloudflared.
Move cloudflared to the VM before flipping origins to vm, or pass --origin-url
to a private path (Tailscale) while cloudflared stays on Windows.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

MAP_PATH = Path(__file__).resolve().parent / "hostname-map.json"


def load_map() -> dict:
    return json.loads(MAP_PATH.read_text(encoding="utf-8"))


def api(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Cloudflare API {exc.code}: {detail}") from exc
    if not payload.get("success"):
        raise SystemExit(f"Cloudflare API unsuccessful: {payload}")
    return payload


def verify_health(url: str) -> None:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if response.status != 200 or payload.get("ok") is not True:
        raise SystemExit(f"Health check failed for {url}: {payload}")
    print(json.dumps({"health": url, **{k: payload.get(k) for k in ("ok", "service", "version")}}, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", required=True, help="Key from hostname-map.json")
    parser.add_argument("--origin", choices=("windows", "vm"), required=True)
    parser.add_argument("--origin-url", help="Override origin URL (Tailscale dual-run)")
    parser.add_argument("--skip-verify", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    mapping = load_map()
    service = mapping["services"].get(args.service)
    if not service:
        known = ", ".join(mapping["services"])
        raise SystemExit(f"Unknown service {args.service}. Known: {known}")

    token = (os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
    account = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or mapping["account_id"]).strip()
    tunnel_id = (os.environ.get("CLOUDFLARE_TUNNEL_ID") or mapping["tunnel_id"]).strip()
    if not args.dry_run and not token:
        raise SystemExit("CLOUDFLARE_API_TOKEN is required unless --dry-run")

    origin = args.origin_url or service[f"{args.origin}_origin"]
    hostname = service["hostname"]
    print(f"{hostname} -> {origin} ({args.origin})")

    if args.dry_run:
        return 0

    config_url = f"https://api.cloudflare.com/client/v4/accounts/{account}/cfd_tunnel/{tunnel_id}/configurations"
    current = api("GET", config_url, token)
    ingress = list(current.get("result", {}).get("config", {}).get("ingress") or [])
    kept = []
    for rule in ingress:
        if rule.get("hostname") == hostname:
            continue
        if not rule.get("hostname") and str(rule.get("service", "")).startswith("http_status:"):
            continue
        kept.append(rule)
    kept.append({"hostname": hostname, "service": origin, "originRequest": {}})
    kept.append({"service": "http_status:404"})
    api("PUT", config_url, token, {"config": {"ingress": kept}})
    print("Tunnel ingress updated.")

    if not args.skip_verify:
        verify_health(f"https://{hostname}/health")
    return 0


if __name__ == "__main__":
    sys.exit(main())
