#!/usr/bin/env python3
"""Studio front-door seed for the rainy Chicago native multi-image autonomous test.

Talks only to the temporary Workers service-binding proxy. Does not pulse Make,
Approve, or stamp Test_Run_ID.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BRIDGE_URL = os.environ["BRIDGE_URL"]
OUT_PATH = os.environ.get("SEED_RESULT_PATH", "/tmp/seed-result.json")
UA = "ChicagoShiningNativePhotoSeed/1.0 (joseph.t.logan@gmail.com)"

PHOTOS = [
    (
        "chicago-rain-skyline.jpg",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Chicago,_Illinois_-_city_at_night_in_the_rain-.jpg?width=1280",
    ),
    (
        "chicago-rain-water-tower.jpg",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Historic_Chicago_Water_Tower_and_Water_Tower_Place_on_a_rainy_night_(52039872491).jpg?width=1280",
    ),
    (
        "chicago-rain-cloud-gate.jpg",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Plaza_by_the_Cloud_Gate_on_a_rainy_night_(52036718497).jpg?width=1280",
    ),
]

TITLE = "Rainy Chicago — native multi-image test"
SUMMARY = (
    "It is raining in Chicago. Produce a silent native three-photo set: "
    "Instagram Carousel, Facebook Multi-Image Post, and TikTok Multi-Photo. "
    "No voiceover, no music, no Story, no Reel, no YouTube."
)


def log(msg: str) -> None:
    print(msg, flush=True)


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/jpeg,image/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        ctype = str(resp.headers.get("Content-Type") or "")
    if len(data) < 8000:
        raise RuntimeError(f"photo too small from {url} ({len(data)} bytes, {ctype})")
    if "html" in ctype.lower():
        raise RuntimeError(f"photo URL returned HTML: {url}")
    return data


def bridge(method: str, path: str, body=None, files=None, timeout: int = 120) -> dict:
    payload: dict = {"method": method, "path": path}
    if files:
        payload["files"] = files
    elif body is not None:
        payload["body"] = body
    elif method.upper() not in ("GET", "HEAD"):
        payload["body"] = {}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BRIDGE_URL,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            wrapper = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            wrapper = json.loads(raw.decode("utf-8"))
        except Exception as parse_error:
            raise RuntimeError(f"bridge HTTP {exc.code} {path}: {raw[:2000]!r}") from parse_error
        raise RuntimeError(f"bridge HTTP {exc.code} {path}: {json.dumps(wrapper)[:4000]}") from exc
    studio = wrapper.get("body") if isinstance(wrapper, dict) else wrapper
    status = int(wrapper.get("status") or 0)
    ok = bool(wrapper.get("ok"))
    return {"ok": ok, "status": status, "body": studio, "wrapper": wrapper}


def must(step: str, result: dict) -> dict:
    body = result.get("body") if isinstance(result.get("body"), dict) else {}
    if not result.get("ok") or result.get("status", 500) >= 400:
        raise RuntimeError(f"{step} failed HTTP {result.get('status')}: {json.dumps(body)[:4000]}")
    if body.get("ok") is False:
        raise RuntimeError(f"{step} rejected: {json.dumps(body)[:4000]}")
    log(f"{step} http={result.get('status')}")
    return body


def poll_until(step: str, path: str, predicate, timeout_s: int = 480, interval_s: int = 8) -> dict:
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        result = bridge("GET", path, timeout=90)
        body = result.get("body") if isinstance(result.get("body"), dict) else {}
        last = body
        try:
            if result.get("ok") and predicate(body):
                log(f"{step} ready")
                return body
        except Exception:
            pass
        status = (
            body.get("variant_status")
            or body.get("assets_status")
            or (body.get("record") or {}).get("status")
            or result.get("status")
        )
        log(f"{step} waiting status={status}")
        time.sleep(interval_s)
    raise RuntimeError(f"{step} timed out: {json.dumps(last)[:4000]}")


def main() -> int:
    evidence: dict = {"ok": False, "title": TITLE, "steps": []}
    try:
        session = must("session", bridge("GET", "/api/session"))
        evidence["session"] = {
            "authenticated": session.get("authenticated"),
            "authorized": session.get("authorized"),
            "email": ((session.get("user") or {}).get("email") if isinstance(session.get("user"), dict) else None),
        }
        if not session.get("authenticated") or not session.get("authorized"):
            raise RuntimeError(f"Studio membership failed: {json.dumps(session)[:2000]}")

        log("downloading Wikimedia Chicago rain stills")
        files = []
        for name, url in PHOTOS:
            blob = download(url)
            log(f"  {name} {len(blob)} bytes")
            files.append(
                {
                    "field": "files",
                    "filename": name,
                    "content_type": "image/jpeg",
                    "b64": base64.b64encode(blob).decode("ascii"),
                }
            )

        idea = must(
            "create-idea",
            bridge("POST", "/api/ideas", {"title": TITLE, "summary": SUMMARY}),
        )
        idea_id = (idea.get("record") or {}).get("id")
        if not idea_id:
            raise RuntimeError(f"create-idea missing id: {json.dumps(idea)[:2000]}")
        evidence["idea_id"] = idea_id
        log(f"idea {idea_id}")

        pr = must(
            "create-production-request",
            bridge(
                "POST",
                "/api/production-requests",
                {
                    "idea_record_id": idea_id,
                    "content_type": "Photo Set",
                    "platforms": ["Instagram", "Facebook", "TikTok"],
                    "voiceover_mode": "No",
                    "background_music_mode": "No",
                    "thumbnail_mode": "Use photo frame",
                    "carousel_image_mode": "Manual Upload",
                    "carousel_slide_count_mode": "Exact",
                    "carousel_slide_count_exact": 3,
                    "title_mode": "AI decides",
                    "caption_mode": "AI decides",
                    "script_mode": "AI decides",
                    "production_notes": "Native stills only. Do not render Remotion video, Reels, Slideshow Reel, or YouTube.",
                },
            ),
        )
        pr_id = (pr.get("record") or {}).get("id")
        if not pr_id:
            raise RuntimeError(f"create-production-request missing id: {json.dumps(pr)[:2000]}")
        evidence["production_request_id"] = pr_id
        log(f"production request {pr_id}")

        upload = must(
            "upload-assets",
            bridge("POST", f"/api/production-requests/{pr_id}/assets", files=files, timeout=180),
        )
        evidence["upload_count"] = upload.get("count") or len((upload.get("assets") or []))

        def masters_ready(body: dict) -> bool:
            assets = body.get("assets") or []
            status = str(body.get("assets_status") or "")
            authoritative = sum(
                1
                for asset in assets
                if asset.get("google_drive_file_id") and asset.get("media_asset_record_id")
            )
            return status == "Ready" or (len(assets) >= 3 and authoritative >= 3)

        poll_until("master-assets", f"/api/production-requests/{pr_id}/item4", masters_ready, timeout_s=360)

        plan = must(
            "build-plan",
            bridge(
                "POST",
                f"/api/production-requests/{pr_id}/plan",
                {
                    "platforms": ["Instagram", "Facebook", "TikTok"],
                    "overrides": {
                        "Instagram": "Carousel",
                        "Facebook": "Multi-Image Post",
                        "TikTok": "Multi-Photo",
                    },
                    "extras": [],
                },
            ),
        )
        planned = [
            {"platform": item.get("platform"), "output_type": item.get("output_type")}
            for item in ((plan.get("plan") or {}).get("items") or [])
        ]
        evidence["plan"] = planned
        expected = {
            ("Instagram", "Carousel"),
            ("Facebook", "Multi-Image Post"),
            ("TikTok", "Multi-Photo"),
        }
        got = {(item["platform"], item["output_type"]) for item in planned}
        if got != expected:
            raise RuntimeError(f"planner did not emit native types: {planned}")

        must(
            "prepare-variants",
            bridge("POST", f"/api/production-requests/{pr_id}/variants", {"crops": {}}, timeout=90),
        )

        def variants_ready(body: dict) -> bool:
            return str(body.get("variant_status") or "") == "Ready"

        item4 = poll_until("variants", f"/api/production-requests/{pr_id}/item4", variants_ready, timeout_s=540, interval_s=12)
        evidence["variant_status"] = item4.get("variant_status")

        preflight = must("bridge-preflight", bridge("GET", f"/api/production-requests/{pr_id}/bridge-preflight"))
        evidence["bridge_preflight_ready"] = bool(preflight.get("ready") or (preflight.get("preflight") or {}).get("ready"))
        if preflight.get("ready") is False or (
            isinstance(preflight.get("preflight"), dict) and preflight["preflight"].get("ready") is False
        ):
            raise RuntimeError(f"bridge preflight not ready: {json.dumps(preflight)[:4000]}")

        promote = None
        for attempt in range(1, 9):
            result = bridge("POST", f"/api/production-requests/{pr_id}/promote", {}, timeout=180)
            body = result.get("body") if isinstance(result.get("body"), dict) else {}
            if result.get("status") == 409 and "bridge" in json.dumps(body).lower():
                log(f"promote attempt {attempt} waiting on bridge: {body.get('error') or body.get('message')}")
                time.sleep(15)
                continue
            promote = must("promote", result)
            break
        if promote is None:
            raise RuntimeError("promote never accepted")
        evidence["promote"] = {
            "promoted": promote.get("promoted"),
            "promotion_state": promote.get("promotion_state"),
            "content_item_record_id": promote.get("content_item_record_id"),
            "message": promote.get("message"),
            "handoff": promote.get("handoff"),
        }

        def promoted(body: dict) -> bool:
            record = body.get("record") or {}
            status = str(record.get("status") or "")
            links = record.get("promoted_content_item_links") or []
            return status == "Promoted" or bool(links) or bool(promote.get("promoted"))

        latest = poll_until(
            "promotion-complete",
            f"/api/production-requests/{pr_id}",
            promoted,
            timeout_s=240,
            interval_s=8,
        )
        record = latest.get("record") or {}
        evidence["production_request_status"] = record.get("status")
        evidence["test_run_id"] = record.get("test_run_id")
        evidence["content_item_links"] = record.get("promoted_content_item_links") or []
        evidence["content_item_record_id"] = promote.get("content_item_record_id") or (
            evidence["content_item_links"][0] if evidence["content_item_links"] else None
        )
        if evidence.get("test_run_id"):
            raise RuntimeError(f"Test_Run_ID was stamped ({evidence['test_run_id']}); autonomous path would skip this row")

        evidence["ok"] = True
        evidence["studio_url"] = (
            f"https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/{pr_id}"
        )
        log(json.dumps({k: v for k, v in evidence.items() if k != "steps"}, indent=2)[:4000])
        return 0
    except Exception as exc:
        evidence["error"] = str(exc)
        log(f"SEED_FAILED {exc}")
        return 1
    finally:
        pathlib_write = OUT_PATH
        with open(pathlib_write, "w", encoding="utf-8") as handle:
            json.dump(evidence, handle, indent=2)
            handle.write("\n")


if __name__ == "__main__":
    sys.exit(main())
