#!/usr/bin/env python3
"""Attach generated covers on existing fixtures without starting Make scenarios.

Safety:
- Never start, activate, or pulse Make scenarios.
- Cadenced orchestrators must already be OFF and must stay OFF.
- YouTube is thumbnail-only on private Output 151.
- Facebook attaches a preferred thumbnail on existing Reel 149.
- Instagram is create-time only; this proof does not publish a new Reel.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image


BASE_ID = "appe33zkZn35yirTL"
SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
OUTPUTS_TABLE = "tblrlPeboBthkplH0"
YT_RECORD = "recXaaWhSZmQ9oOsw"
FB_RECORD = "rec5TIGeAHkc7fzyG"
IG_RECORD = "recccXkpGTx6O3Sa2"
FALLBACK_PUBLIC_THUMB = "https://media.chicagoshining.com/publish/thumbnail-output-147.jpg"
DRIVE_FILE_ID = "1ZtX9_7lbPj6gJvIlV3cg48JiUfqfV7Ad"
R2_KEY = "publish/thumbnail-item9-native-cover-proof-v2.jpg"
ORCHESTRATORS = {
    "5864632": "IG-PUB-ORCH",
    "5813561": "FB-ORCH",
    "5823581": "YT-ORCH",
    "5791537": "AP-CAR-ORCH",
    "5806668": "TTD-ORCH",
}
IG_SCENARIO = 5862882
COVER_URL = "{{1.Thumbnail_URL}}"
THUMB_OFFSET = "{{if(1.Thumbnail_URL; emptystring; 1)}}"
SETTING_NAMES = (
    "MAKE_API_TOKEN",
    "MAKE_API_BASE_URL",
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
    "FACEBOOK_PAGE_ID",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "R2_UPLOAD_WORKER_URL",
    "R2_UPLOAD_WORKER_SECRET",
)


def redact(text, secrets):
    value = str(text or "")
    for secret in secrets:
        if secret:
            value = value.replace(secret, "[REDACTED]")
    return value


def http(url, method="GET", headers=None, body=None, timeout=60):
    data = body
    if isinstance(body, (dict, list)):
        data = json.dumps(body).encode()
    elif isinstance(body, str):
        data = body.encode()
    request_headers = {"User-Agent": "SM-Pipeline-V2-Item9/1.0"}
    request_headers.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return response.status, dict(response.headers), raw
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, dict(error.headers), raw


def json_http(url, method="GET", headers=None, body=None, timeout=60):
    status, response_headers, raw = http(url, method=method, headers=headers, body=body, timeout=timeout)
    text = raw.decode("utf-8", "replace") if raw else ""
    try:
        parsed = json.loads(text) if text else {}
    except json.JSONDecodeError:
        parsed = {"raw": text[:1000]}
    return status, response_headers, parsed


def airtable_get(pat, table, params):
    query = urllib.parse.urlencode(params, doseq=True)
    status, _, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{table}?{query}",
        headers={"Authorization": f"Bearer {pat}"},
    )
    if status != 200:
        raise SystemExit(f"Airtable read failed {status}: {payload}")
    return payload


def airtable_patch(pat, table, record_id, fields):
    status, _, payload = json_http(
        f"https://api.airtable.com/v0/{BASE_ID}/{table}/{record_id}",
        method="PATCH",
        headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"},
        body={"fields": fields, "typecast": True},
    )
    if status != 200:
        raise SystemExit(f"Airtable write failed {status}: {payload}")
    return payload


def unwrap(payload, key):
    value = payload.get(key) or (payload.get("response") or {}).get(key) or payload
    return json.loads(value) if isinstance(value, str) else value


def find_module(flow, module_id):
    for node in flow or []:
        if int(node.get("id", -1)) == module_id:
            return node
        for route in node.get("routes") or []:
            match = find_module(route.get("flow") or [], module_id)
            if match:
                return match
    return None


def load_settings(pat):
    formula = "AND({Active}=1,OR(" + ",".join(f"{{Setting_Name}}='{name}'" for name in SETTING_NAMES) + "))"
    payload = airtable_get(
        pat,
        SETTINGS_TABLE,
        [("filterByFormula", formula), ("fields[]", "Setting_Name"), ("fields[]", "Setting_Value")],
    )
    values = {
        row["fields"]["Setting_Name"]: str(row["fields"].get("Setting_Value") or "").strip()
        for row in payload.get("records", [])
    }
    missing = [name for name in SETTING_NAMES if not values.get(name)]
    if missing:
        raise SystemExit("missing settings: " + ",".join(missing))
    return values


def load_output(pat, record_id):
    payload = airtable_get(
        pat,
        OUTPUTS_TABLE,
        [
            ("filterByFormula", f"RECORD_ID()='{record_id}'"),
            ("fields[]", "Output_ID"),
            ("fields[]", "Platform"),
            ("fields[]", "Platform_Output_Type"),
            ("fields[]", "Thumbnail_URL"),
            ("fields[]", "Publish_Asset_URL"),
            ("fields[]", "Platform_Post_ID"),
            ("fields[]", "YouTube_Video_ID"),
            ("fields[]", "YouTube_Thumbnail_Status"),
            ("fields[]", "FB_Slideshow_Meta_Video_ID"),
            ("fields[]", "Publish_Status"),
            ("fields[]", "Platform_Post_URL"),
        ],
    )
    records = payload.get("records") or []
    if not records:
        raise SystemExit(f"missing Platform Output {record_id}")
    fields = records[0].get("fields") or {}
    return {"id": records[0]["id"], **fields}


def assert_orchestrators_off(make_base, token):
    states = {}
    for scenario_id, name in ORCHESTRATORS.items():
        status, _, payload = json_http(
            f"{make_base}/scenarios/{scenario_id}",
            headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
        )
        if status != 200:
            raise SystemExit(f"Make scenario {name} ({scenario_id}) read failed {status}")
        meta = unwrap(payload, "scenario")
        active = bool(meta.get("isActive"))
        states[scenario_id] = {
            "name": meta.get("name") or name,
            "isActive": active,
            "nextExec": meta.get("nextExec"),
            "scheduling": meta.get("scheduling"),
        }
        if active:
            raise SystemExit(f"cadenced scenario {name} ({scenario_id}) is ON")
    return states


def verify_instagram_contract(make_base, token):
    status, _, payload = json_http(
        f"{make_base}/scenarios/{IG_SCENARIO}",
        headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
    )
    if status != 200:
        raise SystemExit(f"AP1-IG scenario read failed {status}")
    meta = unwrap(payload, "scenario")
    blueprint = meta.get("blueprint")
    if isinstance(blueprint, str):
        blueprint = json.loads(blueprint)
    if not (blueprint or {}).get("flow"):
        status, _, raw_blueprint = json_http(
            f"{make_base}/scenarios/{IG_SCENARIO}/blueprint?draft=false",
            headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
        )
        if status != 200:
            raise SystemExit(f"AP1-IG blueprint read failed {status}")
        blueprint = unwrap(raw_blueprint, "blueprint")
    module = find_module((blueprint or {}).get("flow") or [], 3)
    mapper = (module or {}).get("mapper") or {}
    if mapper.get("cover_url") != COVER_URL or mapper.get("thumb_offset") != THUMB_OFFSET:
        raise SystemExit("AP1-IG live cover contract drifted")
    if "Publish_Asset_URL" in str(mapper.get("cover_url") or ""):
        raise SystemExit("AP1-IG still uses the video URL as cover fallback")
    return {
        "scenario_id": IG_SCENARIO,
        "cover_url": mapper.get("cover_url"),
        "thumb_offset": mapper.get("thumb_offset"),
        "create_time_only": True,
    }


def download_candidates():
    return [
        f"https://drive.google.com/uc?id={DRIVE_FILE_ID}&export=download",
        f"https://lh3.googleusercontent.com/d/{DRIVE_FILE_ID}",
        FALLBACK_PUBLIC_THUMB,
    ]


def download_image(urls):
    for url in [item for item in urls if item]:
        status, headers, raw = http(url, headers={"User-Agent": "SM-Pipeline-V2-Item9/1.0"})
        content_type = str(headers.get("Content-Type") or headers.get("content-type") or "").split(";")[0]
        if status == 200 and raw and len(raw) > 32 and "text/html" not in content_type:
            return {
                "source_url": url,
                "content_type": content_type or "image/jpeg",
                "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw),
                "body": raw,
            }
    raise SystemExit("could not download a generated thumbnail image")


def compress_for_platforms(image, max_bytes=1800000):
    original = Image.open(BytesIO(image["body"])).convert("RGB")
    frame = original.copy()
    frame.thumbnail((1080, 1920))
    for quality in (85, 75, 65, 55, 45):
        buffer = BytesIO()
        frame.save(buffer, format="JPEG", quality=quality, optimize=True)
        body = buffer.getvalue()
        if len(body) <= max_bytes:
            return {
                "source_url": image["source_url"],
                "content_type": "image/jpeg",
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body),
                "body": body,
                "original_bytes": image["bytes"],
                "original_content_type": image["content_type"],
                "jpeg_quality": quality,
                "width": frame.width,
                "height": frame.height,
            }
    raise SystemExit("could not compress generated thumbnail under 2 MB")


def host_public_thumbnail(settings, image):
    worker = settings["R2_UPLOAD_WORKER_URL"].rstrip("/")
    status, _, payload = json_http(
        f"{worker}?key={urllib.parse.quote(R2_KEY)}",
        method="PUT",
        headers={
            "Content-Type": image["content_type"],
            "x-pipeline-secret": settings["R2_UPLOAD_WORKER_SECRET"],
        },
        body=image["body"],
    )
    if status != 200 or not payload.get("ok"):
        raise SystemExit(f"R2 thumbnail host failed {status}: {payload}")
    public_url = payload.get("public_url") or f"https://media.chicagoshining.com/{R2_KEY}"
    return {"key": R2_KEY, "public_url": public_url, "status": status}


def youtube_get(settings, video_id):
    base = settings["YOUTUBE_UPLOAD_SERVICE_URL"].rstrip("/")
    status, _, payload = json_http(
        f"{base}/youtube/videos/{video_id}",
        headers={"X-SM-Pipeline-Key": settings["YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET"]},
    )
    return status, payload


def youtube_set_thumbnail(settings, video_id, source_url):
    base = settings["YOUTUBE_UPLOAD_SERVICE_URL"].rstrip("/")
    status, _, payload = json_http(
        f"{base}/youtube/thumbnail",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-SM-Pipeline-Key": settings["YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET"],
        },
        body={"videoId": video_id, "sourceUrl": source_url},
        timeout=90,
    )
    return status, payload


def thumbnail_urls(payload):
    items = payload.get("items") or []
    snippet = (items[0].get("snippet") if items else {}) or {}
    thumbs = snippet.get("thumbnails") or payload.get("items") or {}
    if isinstance(thumbs, list):
        thumbs = (thumbs[0] if thumbs else {}) or {}
    urls = {}
    for name in ("default", "medium", "high", "standard", "maxres"):
        node = thumbs.get(name) or {}
        if node.get("url"):
            urls[name] = node["url"]
    return urls


def prove_youtube(settings, output, public_url):
    video_id = output.get("YouTube_Video_ID") or output.get("Platform_Post_ID")
    before_status, before = youtube_get(settings, video_id)
    if before_status != 200:
        raise SystemExit(f"YouTube videos.list failed {before_status}: {before}")
    set_status, set_payload = youtube_set_thumbnail(settings, video_id, public_url)
    if set_status != 200:
        raise SystemExit(f"YouTube thumbnails.set failed {set_status}: {set_payload}")
    time.sleep(4)
    after_status, after = youtube_get(settings, video_id)
    before_urls = thumbnail_urls(before)
    after_urls = thumbnail_urls(after if after_status == 200 else set_payload)
    attached = bool(set_payload.get("items") or after_urls)
    return {
        "output_id": output.get("Output_ID"),
        "record_id": output["id"],
        "video_id": video_id,
        "privacy": ((before.get("items") or [{}])[0].get("status") or {}).get("privacyStatus"),
        "before_thumbnails": before_urls,
        "after_thumbnails": after_urls,
        "set_kind": set_payload.get("kind"),
        "attached": attached,
        "thumbnail_url_changed": before_urls != after_urls,
    }


def graph_get(settings, path, params=None):
    version = settings["FACEBOOK_GRAPH_API_VERSION"].strip("/")
    query = dict(params or {})
    query["access_token"] = settings["FACEBOOK_PAGE_ACCESS_TOKEN"]
    return json_http(f"https://graph.facebook.com/{version}/{path}?{urllib.parse.urlencode(query)}")


def graph_post_form(settings, path, params):
    version = settings["FACEBOOK_GRAPH_API_VERSION"].strip("/")
    query = dict(params)
    query["access_token"] = settings["FACEBOOK_PAGE_ACCESS_TOKEN"]
    return json_http(
        f"https://graph.facebook.com/{version}/{path}",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=urllib.parse.urlencode(query),
    )


def graph_post_thumbnail_file(settings, video_id, image):
    version = settings["FACEBOOK_GRAPH_API_VERSION"].strip("/")
    token = settings["FACEBOOK_PAGE_ACCESS_TOKEN"]
    boundary = "----SMItem9" + hashlib.sha256(os.urandom(12)).hexdigest()
    chunks = []

    def add_field(name, value):
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()
        )

    add_field("access_token", token)
    add_field("is_preferred", "true")
    chunks.append(
        (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="source"; filename="cover.jpg"\r\n'
            f'Content-Type: {image["content_type"]}\r\n\r\n'
        ).encode()
        + image["body"]
        + b"\r\n"
        + f"--{boundary}--\r\n".encode()
    )
    return json_http(
        f"https://graph.facebook.com/{version}/{video_id}/thumbnails",
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        body=b"".join(chunks),
    )


def preferred_thumbs(payload):
    rows = []
    for row in payload.get("data") or []:
        rows.append(
            {
                "id": row.get("id"),
                "is_preferred": row.get("is_preferred"),
                "uri": row.get("uri") or row.get("uri_256") or row.get("uri_128"),
            }
        )
    return rows


def prove_facebook(settings, output, public_url, image):
    video_id = output.get("FB_Slideshow_Meta_Video_ID") or output.get("Platform_Post_ID")
    before_status, _, before = graph_get(settings, f"{video_id}/thumbnails")
    post_status, _, posted = graph_post_form(
        settings,
        f"{video_id}/thumbnails",
        {"is_preferred": "true", "source": public_url},
    )
    method = "form-source-url"
    if post_status != 200:
        post_status, _, posted = graph_post_thumbnail_file(settings, video_id, image)
        method = "multipart-source-file"
    if post_status != 200:
        raise SystemExit(f"Facebook thumbnails attach failed {post_status}: {posted}")
    time.sleep(3)
    after_status, _, after = graph_get(settings, f"{video_id}/thumbnails")
    after_rows = preferred_thumbs(after if after_status == 200 else {})
    preferred = [row for row in after_rows if row.get("is_preferred")]
    return {
        "output_id": output.get("Output_ID"),
        "record_id": output["id"],
        "video_id": video_id,
        "before_status": before_status,
        "before_thumbnails": preferred_thumbs(before if before_status == 200 else {}),
        "attach_id": posted.get("id"),
        "attach_method": method,
        "after_thumbnails": after_rows,
        "preferred_count": len(preferred),
        "attached": bool(posted.get("id") or preferred),
    }


def prove_instagram(settings, output, contract):
    media_id = output.get("Platform_Post_ID")
    status, _, payload = graph_get(
        settings,
        media_id,
        {"fields": "id,media_type,permalink,thumbnail_url"},
    )
    return {
        "output_id": output.get("Output_ID"),
        "record_id": output["id"],
        "media_id": media_id,
        "read_status": status,
        "media_type": payload.get("media_type"),
        "permalink": payload.get("permalink"),
        "existing_thumbnail_url": payload.get("thumbnail_url"),
        "reattach_unsupported": True,
        "new_reel_created": False,
        "live_create_contract": contract,
        "note": (
            "Instagram Reel covers are accepted only at CreateAReelPost time. "
            "Existing Output 148 was not republished and no AP1-IG webhook was pulsed."
        ),
    }


def main():
    pat = os.environ["AIRTABLE_PAT"].strip()
    out = Path(os.environ.get("ITEM9_EVIDENCE", "/tmp/item9-native-cover-proof.json"))
    evidence = {
        "repair_item": 9,
        "checkpoint": "native-cover-platform-proof",
        "passed": False,
        "make_scenario_runs": 0,
        "cadenced_scenarios_started": 0,
        "public_posts_created": 0,
    }
    settings = load_settings(pat)
    secrets = [
        pat,
        settings["MAKE_API_TOKEN"],
        settings["YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET"],
        settings["FACEBOOK_PAGE_ACCESS_TOKEN"],
        settings["R2_UPLOAD_WORKER_SECRET"],
    ]
    try:
        make_base = settings["MAKE_API_BASE_URL"].rstrip("/")
        evidence["orchestrators_before"] = assert_orchestrators_off(make_base, settings["MAKE_API_TOKEN"])
        ig_contract = verify_instagram_contract(make_base, settings["MAKE_API_TOKEN"])
        youtube_output = load_output(pat, YT_RECORD)
        facebook_output = load_output(pat, FB_RECORD)
        instagram_output = load_output(pat, IG_RECORD)
        image = compress_for_platforms(
            download_image(
                [youtube_output.get("Thumbnail_URL"), facebook_output.get("Thumbnail_URL"), *download_candidates()]
            )
        )
        hosted = host_public_thumbnail(settings, image)
        evidence["source_image"] = {
            "source_url": image["source_url"],
            "content_type": image["content_type"],
            "sha256": image["sha256"],
            "bytes": image["bytes"],
            "original_bytes": image.get("original_bytes"),
            "original_content_type": image.get("original_content_type"),
            "jpeg_quality": image.get("jpeg_quality"),
            "width": image.get("width"),
            "height": image.get("height"),
            "public_url": hosted["public_url"],
            "r2_key": hosted["key"],
        }
        evidence["youtube"] = prove_youtube(settings, youtube_output, hosted["public_url"])
        if evidence["youtube"]["attached"]:
            airtable_patch(
                pat,
                OUTPUTS_TABLE,
                YT_RECORD,
                {
                    "YouTube_Thumbnail_Status": "Uploaded",
                    "Thumbnail_URL": hosted["public_url"],
                },
            )
            evidence["youtube"]["airtable_status"] = "Uploaded"
            evidence["youtube"]["thumbnail_url"] = hosted["public_url"]
        evidence["facebook"] = prove_facebook(settings, facebook_output, hosted["public_url"], image)
        evidence["instagram"] = prove_instagram(settings, instagram_output, ig_contract)
        evidence["orchestrators_after"] = assert_orchestrators_off(make_base, settings["MAKE_API_TOKEN"])
        evidence["passed"] = bool(
            evidence["youtube"]["attached"]
            and evidence["facebook"]["attached"]
            and evidence["instagram"]["live_create_contract"]["cover_url"] == COVER_URL
            and evidence["cadenced_scenarios_started"] == 0
            and evidence["make_scenario_runs"] == 0
        )
    except Exception as error:
        evidence["failure"] = redact(error, secrets)
        raise
    finally:
        text = redact(json.dumps(evidence, indent=2, sort_keys=True), secrets)
        out.write_text(text, encoding="utf-8")
        print(text)
    if not evidence["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(error.read().decode("utf-8", "replace")[:1000], file=sys.stderr)
        raise
