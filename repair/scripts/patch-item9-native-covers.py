#!/usr/bin/env python3
"""Patch live publish stages so generated Thumbnail_URL is attached as a native cover.

Safety: does not start scenarios, does not change hooks/scheduling, and the caller
must restore the captured blueprints if verification fails.
"""

from __future__ import annotations

import copy
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


IG_ID = 5862882
YT0_ID = 5823572
YTS2_ID = 5830616
FBS4_ID = 5816520
COVER_URL = "{{1.Thumbnail_URL}}"
THUMB_OFFSET = "{{if(1.Thumbnail_URL; emptystring; 1)}}"
YT0_THUMB_STATUS = (
    '{{if(1.Thumbnail_URL; ifempty(1.YouTube_Thumbnail_Status; "Pending"); '
    'ifempty(1.YouTube_Thumbnail_Status; "Not Needed"))}}'
)


def request(url, method="GET", body=None, token=None):
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "SM-Pipeline-V2-Item9/1.0"}
    if token:
        headers["Authorization"] = "Token " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}


def unwrap(payload, key):
    value = payload.get(key) or (payload.get("response") or {}).get(key) or payload
    return json.loads(value) if isinstance(value, str) else value


def find(flow, module_id):
    for node in flow or []:
        if int(node.get("id", -1)) == module_id:
            return node
        for route in node.get("routes") or []:
            match = find(route.get("flow") or [], module_id)
            if match:
                return match
    return None


def find_parent(flow, module_id):
    for index, node in enumerate(flow or []):
        if int(node.get("id", -1)) == module_id:
            return flow, index
        for route in node.get("routes") or []:
            parent, child = find_parent(route.get("flow") or [], module_id)
            if child is not None:
                return parent, child
    return None, None


def assert_safe_meta(before, after, scenario_id):
    if after.get("hookId") != before.get("hookId"):
        raise SystemExit(f"{scenario_id} hook drifted")
    if after.get("scheduling") != before.get("scheduling"):
        raise SystemExit(f"{scenario_id} scheduling drifted")
    if after.get("isActive") != before.get("isActive"):
        raise SystemExit(f"{scenario_id} activation drifted")


def patch_instagram(blueprint):
    module = find(blueprint.get("flow") or [], 3)
    if not module or module.get("module") != "instagram-business:CreateAReelPost":
        raise SystemExit("AP1-IG module 3 CreateAReelPost contract drifted")
    mapper = module.get("mapper") or {}
    if "cover_url" not in mapper or "video_url" not in mapper:
        raise SystemExit("AP1-IG module 3 cover/video mapping drifted")
    mapper["cover_url"] = COVER_URL
    mapper["thumb_offset"] = THUMB_OFFSET
    designer = (module.get("metadata") or {}).get("designer")
    if isinstance(designer, dict):
        designer["name"] = "3 - Create Instagram Reel Post with Native Generated Cover"
    return {
        "cover_url": mapper["cover_url"],
        "thumb_offset": mapper["thumb_offset"],
        "video_url_preserved": bool(mapper.get("video_url")),
    }


def patch_yt0(blueprint):
    module = find(blueprint.get("flow") or [], 10)
    if not module or module.get("module") != "airtable:ActionUpdateRecords":
        raise SystemExit("YT0 module 10 package commit drifted")
    record = (module.get("mapper") or {}).get("record")
    if not isinstance(record, dict) or "YouTube_Thumbnail_Status" not in record:
        raise SystemExit("YT0 module 10 thumbnail status mapping missing")
    record["YouTube_Thumbnail_Status"] = YT0_THUMB_STATUS
    designer = (module.get("metadata") or {}).get("designer")
    if isinstance(designer, dict):
        designer["name"] = "10 - Commit Ready Package for YTP1 - Thumbnail Pending When Present"
    return {"youtube_thumbnail_status": record["YouTube_Thumbnail_Status"]}


def patch_yts2(blueprint):
    module30 = find(blueprint.get("flow") or [], 30)
    module22 = find(blueprint.get("flow") or [], 22)
    if not module30 or module30.get("module") != "http:MakeRequest":
        raise SystemExit("YTS2 module 30 thumbnail upload drifted")
    if "/youtube/thumbnail" not in str((module30.get("mapper") or {}).get("url") or ""):
        raise SystemExit("YTS2 module 30 thumbnail endpoint drifted")
    if not module22 or module22.get("module") != "airtable:ActionUpdateRecords":
        raise SystemExit("YTS2 module 22 skip path drifted")

    module30["filter"] = {
        "name": "Processing succeeded and generated thumbnail is not yet uploaded",
        "conditions": [
            [
                {"a": "{{20.statusCode}}", "b": "200", "o": "number:greaterorequal"},
                {"a": "{{20.statusCode}}", "b": "299", "o": "number:lessorequal"},
                {
                    "a": '{{get(get(20.data.items; 1); "processingDetails.processingStatus")}}',
                    "b": "succeeded",
                    "o": "text:equal:ci",
                },
                {"a": "{{1.Thumbnail_URL}}", "o": "exist"},
                {"a": "{{1.YouTube_Thumbnail_Status}}", "b": "Uploaded", "o": "text:notequal:ci"},
            ]
        ],
    }
    designer30 = (module30.get("metadata") or {}).get("designer")
    if isinstance(designer30, dict):
        designer30["name"] = "30 - Upload Generated YouTube Thumbnail When Present"

    module22["filter"] = {
        "name": "Processing succeeded without remaining thumbnail work",
        "conditions": [
            [
                {"a": "{{20.statusCode}}", "b": "200", "o": "number:greaterorequal"},
                {"a": "{{20.statusCode}}", "b": "299", "o": "number:lessorequal"},
                {
                    "a": '{{get(get(20.data.items; 1); "processingDetails.processingStatus")}}',
                    "b": "succeeded",
                    "o": "text:equal:ci",
                },
                {"a": "{{1.YouTube_Thumbnail_Status}}", "b": "Uploaded", "o": "text:equal:ci"},
            ],
            [
                {"a": "{{20.statusCode}}", "b": "200", "o": "number:greaterorequal"},
                {"a": "{{20.statusCode}}", "b": "299", "o": "number:lessorequal"},
                {
                    "a": '{{get(get(20.data.items; 1); "processingDetails.processingStatus")}}',
                    "b": "succeeded",
                    "o": "text:equal:ci",
                },
                {"a": "{{1.Thumbnail_URL}}", "o": "notexist"},
            ],
        ],
    }
    return {
        "thumbnail_upload_requires_url": True,
        "skip_when_uploaded_or_missing": True,
    }


def facebook_thumbnail_module():
    return {
        "id": 70,
        "filter": {
            "name": "Generated thumbnail URL present",
            "conditions": [[{"a": "{{1.Thumbnail_URL}}", "o": "exist"}]],
        },
        "mapper": {
            "url": (
                "https://graph.facebook.com/"
                '{{get(map(4.array; "setting_value"; "setting_name"; "FACEBOOK_GRAPH_API_VERSION"); 1)}}/'
                "{{ifempty(5.data.id; ifempty(1.FB_Slideshow_Meta_Video_ID; 1.Platform_Post_ID))}}/thumbnails"
            ),
            "method": "post",
            "headers": [
                {
                    "name": "Authorization",
                    "value": (
                        "Bearer "
                        '{{get(map(4.array; "setting_value"; "setting_name"; "FACEBOOK_PAGE_ACCESS_TOKEN"); 1)}}'
                    ),
                }
            ],
            "timeout": "60",
            "shareCookies": False,
            "parseResponse": True,
            "allowRedirects": True,
            "queryParameters": [
                {"name": "is_preferred", "value": "true"},
                {"name": "source", "value": "{{1.Thumbnail_URL}}"},
            ],
            "stopOnHttpError": False,
            "requestCompressedContent": False,
        },
        "module": "http:MakeRequest",
        "version": 4,
        "metadata": {
            "designer": {
                "x": 400,
                "y": -300,
                "name": "70 - Attach Generated Thumbnail as Facebook Reel Cover",
            }
        },
        "parameters": {"tlsType": "", "authenticationType": "noAuth"},
    }


def remove_module(flow, module_id):
    for index, node in enumerate(list(flow or [])):
        if int(node.get("id", -1)) == module_id:
            del flow[index]
            return True
        for route in node.get("routes") or []:
            if remove_module(route.get("flow") or [], module_id):
                return True
    return False


def patch_fbs4(blueprint):
    parent, index = find_parent(blueprint.get("flow") or [], 7)
    if parent is None or index is None:
        raise SystemExit("FBS4 module 7 finalize path drifted")
    module7 = parent[index]
    if module7.get("module") != "airtable:ActionUpdateRecords":
        raise SystemExit("FBS4 module 7 is no longer the finalize write")
    remove_module(blueprint.get("flow") or [], 70)
    parent, index = find_parent(blueprint.get("flow") or [], 7)
    parent.insert(index + 1, facebook_thumbnail_module())
    record = (module7.get("mapper") or {}).get("record")
    if isinstance(record, dict):
        record["FB_Slideshow_Response_JSON"] = (
            "{{toString(5.data)}} Cover handling: FBS4 posts Thumbnail_URL to Graph "
            "/{video-id}/thumbnails?is_preferred=true after the Reel is ready."
        )
    return {"native_thumbnail_module": 70, "finalize_module": 7}


def verify(blueprint, kind):
    if kind == "ig":
        module = find(blueprint.get("flow") or [], 3)
        mapper = module.get("mapper") or {}
        if mapper.get("cover_url") != COVER_URL or mapper.get("thumb_offset") != THUMB_OFFSET:
            raise SystemExit("AP1-IG native cover verification failed")
        if "Publish_Asset_URL" in str(mapper.get("cover_url") or ""):
            raise SystemExit("AP1-IG still uses the video URL as cover fallback")
    elif kind == "yt0":
        record = ((find(blueprint.get("flow") or [], 10) or {}).get("mapper") or {}).get("record") or {}
        if record.get("YouTube_Thumbnail_Status") != YT0_THUMB_STATUS:
            raise SystemExit("YT0 thumbnail pending verification failed")
    elif kind == "yts2":
        filt = ((find(blueprint.get("flow") or [], 30) or {}).get("filter") or {})
        if "Uploaded" not in json.dumps(filt) or "Thumbnail_URL" not in json.dumps(filt):
            raise SystemExit("YTS2 thumbnail gate verification failed")
    elif kind == "fbs4":
        module = find(blueprint.get("flow") or [], 70)
        if not module or "/thumbnails" not in str((module.get("mapper") or {}).get("url") or ""):
            raise SystemExit("FBS4 native thumbnail module verification failed")
        parent, index = find_parent(blueprint.get("flow") or [], 7)
        if int(parent[index + 1].get("id", -1)) != 70:
            raise SystemExit("FBS4 thumbnail module is not after finalize")
    else:
        raise SystemExit(f"unknown verify kind {kind}")


def main():
    make_base = os.environ["MAKE_BASE"].rstrip("/")
    token = os.environ["MAKE_TOKEN"]
    out = Path(os.environ.get("ITEM9_EVIDENCE", "/tmp/item9-cover-proof.json"))
    targets = [
        (IG_ID, "ig", patch_instagram),
        (YT0_ID, "yt0", patch_yt0),
        (YTS2_ID, "yts2", patch_yts2),
        (FBS4_ID, "fbs4", patch_fbs4),
    ]
    evidence = {"passed": False, "scenarios": {}, "public_platform_operations": 0}
    backups = {}
    try:
        for scenario_id, kind, patcher in targets:
            meta = unwrap(request(f"{make_base}/scenarios/{scenario_id}", token=token), "scenario")
            raw = request(f"{make_base}/scenarios/{scenario_id}/blueprint?draft=false", token=token)
            blueprint = unwrap(raw, "blueprint")
            backups[scenario_id] = copy.deepcopy(blueprint)
            before_meta = {
                "isActive": meta.get("isActive"),
                "hookId": meta.get("hookId"),
                "scheduling": meta.get("scheduling"),
                "name": meta.get("name"),
            }
            details = patcher(blueprint)
            request(
                f"{make_base}/scenarios/{scenario_id}?confirmed=true",
                method="PATCH",
                body={"blueprint": json.dumps(blueprint, separators=(",", ":"))},
                token=token,
            )
            after_meta = unwrap(request(f"{make_base}/scenarios/{scenario_id}", token=token), "scenario")
            after_bp = unwrap(
                request(f"{make_base}/scenarios/{scenario_id}/blueprint?draft=false", token=token),
                "blueprint",
            )
            assert_safe_meta(meta, after_meta, scenario_id)
            verify(after_bp, kind)
            evidence["scenarios"][str(scenario_id)] = {
                "kind": kind,
                "name": after_meta.get("name"),
                "hookId": after_meta.get("hookId"),
                "isActive": after_meta.get("isActive"),
                "scheduling_preserved": True,
                "details": details,
                "before": before_meta,
            }
        evidence["passed"] = True
        evidence["contract"] = (
            "Generated Thumbnail_URL is now the native cover source: Instagram cover_url "
            "without first-frame override, YouTube thumbnails.set when a URL exists, and "
            "Facebook Graph /{video-id}/thumbnails after the Reel is ready."
        )
    except Exception as error:
        evidence["failure"] = str(error)
        for scenario_id, blueprint in backups.items():
            try:
                request(
                    f"{make_base}/scenarios/{scenario_id}?confirmed=true",
                    method="PATCH",
                    body={"blueprint": json.dumps(blueprint, separators=(",", ":"))},
                    token=token,
                )
            except Exception as restore_error:
                evidence.setdefault("restore_errors", {})[str(scenario_id)] = str(restore_error)
        raise
    finally:
        out.write_text(json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
        print(json.dumps({"passed": evidence.get("passed"), "failure": evidence.get("failure")}))
    if not evidence["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(error.read().decode("utf-8", "replace")[:1000], file=sys.stderr)
        raise
