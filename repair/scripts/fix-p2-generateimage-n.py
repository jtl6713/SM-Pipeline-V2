#!/usr/bin/env python3
"""Fix P2 OpenAI GenerateImage n, then PATCH + start so the scenario relinks.

Make stores mapper n as the string "1" (designer-ok) but OpenAI now 400s:
  n: Invalid type for 'n': expected an integer, but got a string instead.

JSON integer 1 in a PATCH payload is rejected as an invalid blueprint.
This script writes n as IML that evaluates to a number at runtime, PATCHes once,
POSTs /start, then re-GETs. Do not PATCH again after start.
"""
from __future__ import annotations

import copy
import json
import os
import sys
import urllib.error
import urllib.request

SID = 5530955
N_IML = '{{parseNumber("1")}}'


def get_json(url, headers, method="GET", body=None):
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        raw = error.read()[:2000].decode("utf-8", "replace")
        raise SystemExit(f"HTTP {error.code} {method} {url}: {raw}")


def unwrap_scenario(meta):
    return meta.get("scenario") or (meta.get("response") or {}).get("scenario") or meta


def unwrap_blueprint(payload):
    bp = (
        payload.get("response", {}).get("blueprint")
        or payload.get("blueprint")
        or payload.get("response")
        or payload
    )
    return json.loads(bp) if isinstance(bp, str) else bp


def unwrap_versions(payload):
    raw = payload.get("blueprints") or payload.get("response") or payload
    if isinstance(raw, dict):
        raw = raw.get("blueprints") or raw.get("scenarioBlueprints") or raw.get("items") or raw
    return raw if isinstance(raw, list) else []


def slim_status(sc):
    return {
        k: sc.get(k)
        for k in ("id", "name", "isinvalid", "isActive", "islinked", "isPaused", "lastEdit")
        if isinstance(sc, dict)
    }


def walk(nodes, visitor):
    for node in nodes or []:
        visitor(node)
        walk(node.get("flow"), visitor)
        walk(node.get("onerror"), visitor)
        for route in node.get("routes") or []:
            walk(route.get("flow"), visitor)


def image_modules(bp):
    found = []

    def visit(node):
        module = str(node.get("module") or "")
        name = ((node.get("metadata") or {}).get("designer") or {}).get("name") or ""
        mapper = node.get("mapper") or {}
        if "GenerateImage" in module:
            found.append(node)

    walk(bp.get("flow") or [], visit)
    return found


def describe_images(bp):
    rows = []
    for node in image_modules(bp):
        mapper = node.get("mapper") or {}
        rows.append(
            {
                "id": node.get("id"),
                "module": node.get("module"),
                "version": node.get("version"),
                "name": ((node.get("metadata") or {}).get("designer") or {}).get("name"),
                "n": mapper.get("n"),
                "n_type": type(mapper.get("n")).__name__ if "n" in mapper else None,
                "model": mapper.get("model"),
                "quality": mapper.get("quality"),
                "size": mapper.get("size"),
            }
        )
    return rows


def has_silent_route(bp):
    ids = set()

    def visit(node):
        if node.get("id") is not None:
            ids.add(node.get("id"))

    walk(bp.get("flow") or [], visit)
    return 40 in ids and 41 in ids and 45 in ids


def apply_n_fix(bp):
    changed = 0
    for node in image_modules(bp):
        mapper = node.setdefault("mapper", {})
        before = mapper.get("n")
        if before != N_IML:
            mapper["n"] = N_IML
            changed += 1
        print(
            "fix_module",
            json.dumps(
                {
                    "id": node.get("id"),
                    "name": ((node.get("metadata") or {}).get("designer") or {}).get("name"),
                    "before_n": before,
                    "after_n": mapper.get("n"),
                    "model": mapper.get("model"),
                },
                default=str,
            ),
        )
    return changed


def main():
    token = os.environ["MAKE_TOKEN"].strip()
    base = os.environ["MAKE_BASE"].strip().rstrip("/")
    headers = {
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SM-Pipeline-V2-p2-n/1.0",
    }

    _, meta = get_json(f"{base}/scenarios/{SID}", headers)
    print("before", json.dumps(slim_status(unwrap_scenario(meta)), default=str))

    _, wrap = get_json(f"{base}/scenarios/{SID}/blueprint?draft=false", headers)
    live = unwrap_blueprint(wrap)
    print("live_images", json.dumps(describe_images(live), default=str))
    print("silent_route", has_silent_route(live))

    _, hist = get_json(f"{base}/scenarios/{SID}/blueprints", headers)
    versions = hist.get("scenariosBlueprints") or unwrap_versions(hist)
    print(
        "history",
        json.dumps(
            [
                {
                    "version": v.get("version") or v.get("id"),
                    "created": v.get("created") or v.get("createdAt"),
                    "name": (v.get("scenario") or v).get("name") if isinstance(v, dict) else None,
                }
                for v in versions[:12]
            ],
            default=str,
        ),
    )

    source = copy.deepcopy(live)
    if not has_silent_route(source):
        target = None
        for version in versions:
            vid = version.get("version") or version.get("id")
            if vid in (40, "40"):
                target = vid
                break
        if target is None:
            raise SystemExit("silent route missing and history v40 not found")
        _, restored = get_json(f"{base}/scenarios/{SID}/blueprint?version={target}", headers)
        source = unwrap_blueprint(restored)
        if not source.get("flow"):
            source = restored.get("response") or restored
            if isinstance(source, dict) and "blueprint" in source:
                source = unwrap_blueprint(source)
        print("restored_v40_images", json.dumps(describe_images(source), default=str))
        print("restored_silent", has_silent_route(source))

    changed = apply_n_fix(source)
    print("changed", changed)
    if not has_silent_route(source):
        raise SystemExit("refusing to publish a blueprint without silent 3D-cover route")

    send = copy.deepcopy(source)
    send.pop("scheduling", None)
    send.pop("interface", None)
    status, patch_meta = get_json(
        f"{base}/scenarios/{SID}?confirmed=true",
        headers,
        method="PATCH",
        body={"blueprint": json.dumps(send, separators=(",", ":"))},
    )
    print("patch", status, json.dumps(slim_status(unwrap_scenario(patch_meta)), default=str))

    start_status, start_meta = get_json(f"{base}/scenarios/{SID}/start", headers, method="POST", body={})
    print("start", start_status, json.dumps(slim_status(unwrap_scenario(start_meta)), default=str))

    _, after_meta = get_json(f"{base}/scenarios/{SID}", headers)
    after = unwrap_scenario(after_meta)
    print("after", json.dumps(slim_status(after), default=str))
    _, after_bp_wrap = get_json(f"{base}/scenarios/{SID}/blueprint?draft=false", headers)
    after_bp = unwrap_blueprint(after_bp_wrap)
    print("after_images", json.dumps(describe_images(after_bp), default=str))
    print("after_silent", has_silent_route(after_bp))
    if after.get("isinvalid") or not after.get("isActive") or after.get("islinked") is False:
        raise SystemExit("P2 did not come back valid/active/linked after PATCH+start")
    if not any((node.get("mapper") or {}).get("n") == N_IML for node in image_modules(after_bp)):
        raise SystemExit("n IML did not persist")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as error:
        print(error, file=sys.stderr)
        raise
