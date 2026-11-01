#!/usr/bin/env python3
"""Read-only four-profile Post Insights connection diagnostic.

No OAuth, publishing, token refresh mutations, or Airtable writes.
Never print raw credentials, response bodies, access tokens, or account identifiers.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_ID = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
PROFILES = {"chicago": "", "la": "LA_", "miami": "MIAMI_", "nyc": "NYC_"}
SETTING_NAMES = (
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
    "YOUTUBE_CHANNEL_ID",
    "TIKTOK_WORKER_BASE_URL",
    "FACEBOOK_PAGE_ID",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
)
TIMEOUT = 10


def category(message):
    value = str(message or "").lower()
    if re.search(r"scope|permission|insufficient", value):
        return "permission_or_scope"
    if re.search(r"invalid_grant|revok|expired|refresh token", value):
        return "refresh_token"
    if re.search(r"unauthoriz|invalid.*token|credential|oauth", value):
        return "authentication"
    if "quota" in value:
        return "quota"
    if "not found" in value:
        return "not_found"
    return "unspecified"


def request_json(url, headers):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Studio-Insights-ReadOnly/1.0", **headers})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            raw = response.read(12000).decode("utf-8", errors="replace")
            try:
                body = json.loads(raw)
            except (ValueError, TypeError):
                body = {}
            return {"http_status": response.status, "data": body if isinstance(body, dict) else {}}
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read(12000).decode("utf-8", errors="replace"))
        except (ValueError, TypeError):
            payload = {}
        return {"http_status": exc.code, "data": payload if isinstance(payload, dict) else {}}
    except Exception as exc:
        return {"failure": type(exc).__name__}


def trusted_base(url):
    try:
        parsed = urllib.parse.urlparse(str(url or "").strip())
        host = (parsed.hostname or "").lower()
        if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443)
                or not host.endswith(".chicagoshining.com") or parsed.path not in ("", "/")
                or parsed.query or parsed.fragment):
            return None
        return "https://" + host
    except ValueError:
        return None


def settings_from_airtable(pat):
    names = [prefix + key for prefix in PROFILES.values() for key in SETTING_NAMES]
    formula = "AND({Active}=1,OR(" + ",".join("{Setting_Name}='" + key + "'" for key in names) + "))"
    result = {}
    offset = None
    while True:
        query = [("filterByFormula", formula), ("pageSize", "100"), ("fields[]", "Setting_Name"),
                 ("fields[]", "Setting_Value")]
        if offset:
            query.append(("offset", offset))
        url = "https://api.airtable.com/v0/" + BASE_ID + "/" + SETTINGS_TABLE + "?" + urllib.parse.urlencode(query)
        response = request_json(url, {"Authorization": "Bearer " + pat})
        if response.get("http_status") != 200:
            raise RuntimeError("Airtable read failed: HTTP " + str(response.get("http_status", "unknown")))
        data = response["data"]
        for row in data.get("records", []):
            fields = row.get("fields", {})
            name = str(fields.get("Setting_Name", "")).strip()
            if name:
                result[name] = str(fields.get("Setting_Value", "")).strip()
        offset = data.get("offset")
        if not offset:
            break
    return result


def diagnose(profile, prefix, settings):
    def get(name):
        return settings.get(prefix + name, "")

    result = {
        "meta_configuration": {
            "facebook_page_id": bool(get("FACEBOOK_PAGE_ID")),
            "instagram_business_account_id": bool(get("INSTAGRAM_BUSINESS_ACCOUNT_ID")),
            "page_token": bool(get("FACEBOOK_PAGE_ACCESS_TOKEN")),
        }
    }

    yt_url = get("YOUTUBE_UPLOAD_SERVICE_URL")
    yt_secret = get("YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET")
    # Match Studio: a global service key may be used when the city key is absent.
    if not yt_secret:
        yt_secret = settings.get("YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET", "")
    yt = {"url_configured": bool(yt_url), "secret_configured": bool(yt_secret)}
    yt_base = trusted_base(yt_url) if yt_url else None
    if yt_url and not yt_base:
        yt["configuration_error"] = "invalid_or_untrusted_service_url"
    elif yt_base:
        health = request_json(yt_base + "/health", {})
        yt["health_http"] = health.get("http_status")
        if health.get("failure"):
            yt["health_error_type"] = health["failure"]
        if yt_secret:
            oauth = request_json(yt_base + "/youtube/oauth/status", {"X-SM-Pipeline-Key": yt_secret})
            yt["oauth_http"] = oauth.get("http_status")
            if oauth.get("failure"):
                yt["oauth_error_type"] = oauth["failure"]
            data = oauth.get("data", {})
            if oauth.get("http_status") == 200:
                for key in ("oauthConfigured", "refresh_ok", "analytics_read_ok", "channel_identity_ok", "truncated", "data_api_quota_exceeded"):
                    yt[key] = bool(data.get(key))
                config_channel = get("YOUTUBE_CHANNEL_ID")
                if data.get("channel_id") and config_channel:
                    yt["channel_matches_configured"] = str(data["channel_id"]) == config_channel
                if not data.get("refresh_ok") or not data.get("analytics_read_ok"):
                    yt["error_category"] = category(data.get("analytics_error") or data.get("error"))
            elif oauth.get("http_status") in (401, 403):
                yt["error_category"] = "service_authentication"
        else:
            yt["configuration_error"] = "missing_service_key"
    result["youtube"] = yt

    tt_url = get("TIKTOK_WORKER_BASE_URL")
    tt = {"url_configured": bool(tt_url)}
    tt_base = trusted_base(tt_url) if tt_url else None
    if tt_url and not tt_base:
        tt["configuration_error"] = "invalid_or_untrusted_worker_url"
    elif tt_base:
        health = request_json(tt_base + "/health", {})
        tt["health_http"] = health.get("http_status")
        if health.get("failure"):
            tt["health_error_type"] = health["failure"]
        status = request_json(tt_base + "/tiktok/status", {})
        tt["status_http"] = status.get("http_status")
        if status.get("failure"):
            tt["status_error_type"] = status["failure"]
        if status.get("http_status") == 200:
            data = status.get("data", {})
            tt["authorized"] = bool(data.get("authorized"))
            tt["required_scopes_granted"] = bool(data.get("required_scopes_granted"))
        elif status.get("http_status") in (401, 403):
            tt["error_category"] = "worker_authentication"
        elif (status.get("http_status") or 0) >= 500:
            tt["error_category"] = "worker_error_not_oauth_proof"
    result["tiktok"] = tt
    return result


def main():
    pat = os.getenv("AIRTABLE_PAT", "").strip()
    if not pat:
        print(json.dumps({"diagnostic_error": "AIRTABLE_PAT_unavailable"}))
        return 2
    try:
        settings = settings_from_airtable(pat)
    except Exception as exc:
        print(json.dumps({"diagnostic_error": "settings_read_failed", "error_type": type(exc).__name__}))
        return 2
    report = {"read_only": True, "source": "Airtable active Pipeline Settings", "profiles": {
        name: diagnose(name, prefix, settings) for name, prefix in PROFILES.items()
    }}
    output = json.dumps(report, indent=2, sort_keys=True)
    output_path = os.getenv("REPORT_PATH")
    if output_path:
        with open(output_path, "w", encoding="utf-8") as file:
            file.write(output + "\n")
    print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
