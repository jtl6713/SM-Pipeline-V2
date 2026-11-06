#!/usr/bin/env python3
"""Read-only, credential-free health probe of verified production Studio service URLs.
Never reports account IDs, auth tokens, response bodies, or secrets.
"""
import json
import urllib.error
import urllib.request
import socket

TARGETS = {
    "chicago": ("https://auth.chicagoshining.com", "https://youtube-upload.chicagoshining.com"),
    "la": ("https://auth-la.chicagoshining.com", "https://youtube-upload-la.chicagoshining.com"),
    "miami": ("https://auth-miami.chicagoshining.com", "https://youtube-upload-miami.chicagoshining.com"),
    "nyc": ("https://auth-nyc.chicagoshining.com", "https://youtube-upload-nyc.chicagoshining.com"),
}

def safe_get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Studio-Public-Health/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=7) as resp:
            body = resp.read(5000)
            try:
                data = json.loads(body.decode())
            except (ValueError, UnicodeDecodeError):
                data = {}
            return {
                "http": resp.status,
                "ok": data.get("ok") is True if isinstance(data, dict) else False,
                "authorized": data.get("authorized") is True if isinstance(data, dict) else None,
                "required_scopes_granted": data.get("required_scopes_granted") is True if isinstance(data, dict) else None,
                "oauthConfigured": data.get("oauthConfigured") is True if isinstance(data, dict) else None,
            }
    except urllib.error.HTTPError as exc:
        return {"http": exc.code}
    except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
        return {"network_error_type": type(exc).__name__}

report = {}
for city, (tt, yt) in TARGETS.items():
    report[city] = {
        "tiktok_health": safe_get(tt + "/health"),
        "tiktok_status": safe_get(tt + "/tiktok/status"),
        "youtube_health": safe_get(yt + "/health"),
        "youtube_oauth_status_without_service_key": safe_get(yt + "/youtube/oauth/status"),
    }
print(json.dumps({"read_only": True, "credentials_sent": False, "results": report}, sort_keys=True, indent=2))
