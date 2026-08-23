#!/usr/bin/env python3
"""Studio front-door seed for platform-matrix autonomous tests.

Talks only to the temporary Workers service-binding proxy. Does not pulse Make,
Approve, or stamp Test_Run_ID. Stops after Promote so cron can carry the item
to Studio review.
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

BRIDGE_URL = os.environ["BRIDGE_URL"]
OUT_PATH = os.environ.get("SEED_RESULT_PATH", "/tmp/seed-result.json")
SCENARIO_ID = os.environ["SEED_SCENARIO"]
UA = "ChicagoShiningScenarioSeed/1.0 (joseph.t.logan@gmail.com)"
SPEC_PATH = Path(__file__).with_name("e2e-studio-scenarios.json")
SCENARIOS = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
if SCENARIO_ID not in SCENARIOS:
    raise SystemExit(f"unknown SEED_SCENARIO={SCENARIO_ID}")
SPEC = SCENARIOS[SCENARIO_ID]
PHOTOS = [(row["filename"], row["url"]) for row in SPEC["photos"]]
TITLE = SPEC["title"]
SUMMARY = SPEC["summary"]
PHOTO_COUNT = int(SPEC["photo_count"])
CONTENT_TYPE = SPEC["content_type"]
PLATFORMS = list(SPEC["platforms"])
OVERRIDES = dict(SPEC["overrides"])
EXTRAS = list(SPEC.get("extras") or [])
VOICEOVER_MODE = SPEC["voiceover_mode"]
MUSIC_MODE = SPEC["background_music_mode"]
THUMBNAIL_MODE = SPEC.get("thumbnail_mode") or "Yes"


def production_fields(thumbnail_mode, extra=None):
    fields = {
        "content_type": CONTENT_TYPE,
        "platforms": PLATFORMS,
        "voiceover_mode": VOICEOVER_MODE,
        "background_music_mode": MUSIC_MODE,
        "thumbnail_mode": thumbnail_mode,
        "carousel_image_mode": "Manual Upload",
        "title_mode": "AI decides",
        "caption_mode": "AI decides",
        "script_mode": "AI decides",
    }
    if PHOTO_COUNT > 1:
        fields["carousel_slide_count_mode"] = "Exact"
        fields["carousel_slide_count_exact"] = PHOTO_COUNT
    else:
        fields["carousel_slide_count_mode"] = "AI decides"
    if extra:
        fields.update(extra)
    return {key: value for key, value in fields.items() if value is not None}


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
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, suffix=".json") as handle:
        json.dump(payload, handle)
        payload_path = handle.name
    out_path = payload_path + ".out"
    try:
        completed = subprocess.run(
            [
                "curl",
                "-sS",
                "--max-time",
                str(timeout),
                "-A",
                "curl/8.5.0",
                "-H",
                "Content-Type: application/json",
                "-H",
                "Accept: application/json",
                "--data-binary",
                f"@{payload_path}",
                "-o",
                out_path,
                "-w",
                "%{http_code}",
                BRIDGE_URL,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        http_code = (completed.stdout or "").strip() or "000"
        raw = ""
        if os.path.exists(out_path):
            with open(out_path, "r", encoding="utf-8") as handle:
                raw = handle.read()
        if completed.returncode != 0 and not raw:
            raise RuntimeError(f"bridge curl failed {path}: {completed.stderr or http_code}")
        try:
            wrapper = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            wrapper = {"raw": (raw or "")[:2000], "retryable": True}
        if http_code != "200":
            return {
                "ok": False,
                "status": int(http_code) if http_code.isdigit() else 500,
                "body": {"error": (raw or http_code)[:1500], "retryable": True},
                "wrapper": wrapper if isinstance(wrapper, dict) else {},
            }
    finally:
        for candidate in (payload_path, out_path):
            try:
                os.unlink(candidate)
            except OSError:
                pass
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


def retryable(result: dict) -> bool:
    body = result.get("body") if isinstance(result.get("body"), dict) else {}
    status = int(result.get("status") or 0)
    text = json.dumps(body)
    return bool(body.get("retryable")) or status in {404, 408, 429, 500, 502, 503, 504, 520, 530} or "1101" in text or "1042" in text or "error code" in text.lower() or "429" in text


def must_retry(step: str, call, attempts: int = 12, delay_s: int = 3) -> dict:
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            result = call()
            if retryable(result) and attempt < attempts:
                wait = 20 if int(result.get("status") or 0) == 429 else delay_s
                log(f"{step} transient HTTP {result.get('status')} attempt={attempt}")
                time.sleep(wait)
                continue
            return must(step, result)
        except RuntimeError as exc:
            last_error = exc
            if attempt >= attempts or ("1101" not in str(exc) and "retryable" not in str(exc) and "HTTP 5" not in str(exc) and "HTTP 404" not in str(exc)):
                raise
            log(f"{step} retry {attempt}: {exc}")
            time.sleep(delay_s)
    raise last_error or RuntimeError(f"{step} failed")


def poll_until(step: str, path: str, predicate, timeout_s: int = 480, interval_s: int = 8) -> dict:
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        result = bridge("GET", path, timeout=90)
        body = result.get("body") if isinstance(result.get("body"), dict) else {}
        last = body
        if retryable(result) or not result.get("ok"):
            log(f"{step} waiting transient={result.get('status')}")
            time.sleep(interval_s)
            continue
        try:
            if predicate(body):
                log(f"{step} ready")
                return body
        except Exception:
            pass
        record = body.get("record") if isinstance(body.get("record"), dict) else {}
        def present(value):
            text = str(value or "").strip()
            return text if text and text.lower() != "none" else ""
        status = (
            present(body.get("status"))
            or present(body.get("variant_status"))
            or present(body.get("assets_status"))
            or present(record.get("studio_master_asset_status"))
            or present(record.get("studio_variant_status"))
            or present(record.get("status"))
            or result.get("status")
        )
        log(f"{step} waiting status={status}")
        time.sleep(interval_s)
    raise RuntimeError(f"{step} timed out: {json.dumps(last)[:4000]}")


def photo_files() -> list:
    files = []
    log("downloading Wikimedia stills")
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
    return files


def main() -> int:
    evidence: dict = {"ok": False, "title": TITLE, "scenario_id": SCENARIO_ID, "steps": []}
    try:
        time.sleep(3)
        session = must_retry("session", lambda: bridge("GET", "/api/session"), attempts=10, delay_s=5)
        evidence["session"] = {
            "authenticated": session.get("authenticated"),
            "authorized": session.get("authorized"),
            "email": ((session.get("user") or {}).get("email") if isinstance(session.get("user"), dict) else None),
        }
        if not session.get("authenticated") or not session.get("authorized"):
            raise RuntimeError(f"Studio membership failed: {json.dumps(session)[:2000]}")

        listed = must_retry("list-ideas", lambda: bridge("GET", "/api/ideas"), attempts=8, delay_s=4)
        existing_idea = next(
            (
                row
                for row in (listed.get("records") or [])
                if str(row.get("title") or "") == TITLE
                and not (row.get("content_item_links") or row.get("promoted_content_record_id"))
            ),
            None,
        )
        if existing_idea:
            idea_id = existing_idea.get("id")
            log(f"resume idea {idea_id}")
        else:
            idea = must_retry(
                "create-idea",
                lambda: bridge("POST", "/api/ideas", {"title": TITLE, "summary": SUMMARY}),
                attempts=8,
                delay_s=4,
            )
            idea_id = (idea.get("record") or {}).get("id")
        if not idea_id:
            raise RuntimeError("missing idea id")
        evidence["idea_id"] = idea_id
        log(f"idea {idea_id}")
        time.sleep(2)

        pr = must_retry(
            "create-production-request",
            lambda: bridge(
                "POST",
                "/api/production-requests",
                production_fields(
                    THUMBNAIL_MODE,
                    {
                        "idea_record_id": idea_id,
                        "production_notes": f"Scenario {SCENARIO_ID}. Stop at Studio review. Do not Approve for publishing. AI grid thumbnail required.",
                    },
                ),
            ),
        )
        pr_id = (pr.get("record") or {}).get("id")
        if not pr_id:
            raise RuntimeError(f"create-production-request missing id: {json.dumps(pr)[:2000]}")
        evidence["production_request_id"] = pr_id
        log(f"production request {pr_id}")

        current = must_retry("get-production-request", lambda: bridge("GET", f"/api/production-requests/{pr_id}"))
        record = current.get("record") or {}
        asset_count = int(record.get("studio_master_asset_count") or len(record.get("studio_master_assets") or []) or 0)
        if asset_count < PHOTO_COUNT:
            upload = must(
                "upload-assets",
                bridge("POST", f"/api/production-requests/{pr_id}/assets", files=photo_files(), timeout=180),
            )
            evidence["upload_count"] = upload.get("count") or len((upload.get("assets") or []))
        else:
            evidence["upload_count"] = asset_count
            log(f"skip upload; {asset_count} masters already present")

        def masters_ready(body: dict) -> bool:
            rec = body.get("record") or {}
            assets = rec.get("studio_master_assets") or body.get("assets") or []
            status = str(rec.get("studio_master_asset_status") or body.get("status") or "")
            count = int(rec.get("studio_master_asset_count") or body.get("count") or len(assets) or 0)
            authoritative = int(body.get("authoritative_count") or 0) or sum(
                1
                for asset in assets
                if asset.get("google_drive_file_id") and asset.get("media_asset_record_id")
            )
            return count >= PHOTO_COUNT and (status == "Ready" or authoritative >= PHOTO_COUNT)

        # Same route the Item 4 UI polls. It reconciles Drive Uploaded masters
        # into the Production Request; the light GET does not.
        poll_until("master-assets", f"/api/production-requests/{pr_id}/assets", masters_ready, timeout_s=480, interval_s=10)

        current = must_retry("get-production-request-before-plan", lambda: bridge("GET", f"/api/production-requests/{pr_id}"))
        plan = must_retry(
            "build-plan",
            lambda: bridge(
                "POST",
                f"/api/production-requests/{pr_id}/plan",
                {
                    "platforms": PLATFORMS,
                    "overrides": OVERRIDES,
                    "extras": EXTRAS,
                },
            ),
        )
        planned_items = ((plan.get("plan") or {}).get("items") or [])
        planned = [
            {"platform": item.get("platform"), "output_type": item.get("output_type")}
            for item in planned_items
        ]
        evidence["plan"] = planned
        expected = {(platform, output_type) for platform, output_type in OVERRIDES.items()}
        extra_pairs = {
            (row.split("::", 1)[0], row.split("::", 1)[1])
            for row in EXTRAS
            if "::" in row
        }
        got = {(item["platform"], item["output_type"]) for item in planned}
        if not expected.issubset(got) or extra_pairs - got:
            raise RuntimeError(f"planner did not emit expected types: expected={sorted(expected | extra_pairs)} got={planned}")

        def variants_ready(body: dict) -> bool:
            rec = body.get("record") if isinstance(body.get("record"), dict) else {}
            status = str(body.get("status") or rec.get("studio_variant_status") or "")
            if body.get("plan_complete") is True:
                return True
            progress = body.get("progress") if isinstance(body.get("progress"), dict) else {}
            target = int(body.get("plan_target_count") or progress.get("plan_target") or progress.get("target") or 0)
            ready = int(body.get("plan_ready_count") or progress.get("plan_ready") or progress.get("ready") or 0)
            return status == "Ready" and (target == 0 or ready >= target)

        current = must_retry("get-production-request-before-variants", lambda: bridge("GET", f"/api/production-requests/{pr_id}"))
        variant_status = str((current.get("record") or {}).get("studio_variant_status") or "")
        if variant_status != "Ready":
            if variant_status != "Preparing":
                try:
                    must_retry(
                        "prepare-variants",
                        lambda: bridge("POST", f"/api/production-requests/{pr_id}/variants", {"crops": {}}, timeout=90),
                        attempts=6,
                        delay_s=12,
                    )
                except RuntimeError as exc:
                    if "409" not in str(exc) and "still" not in str(exc).lower():
                        raise
                    log(f"prepare-variants already running: {exc}")
            poll_until(
                "variants",
                f"/api/production-requests/{pr_id}/variants",
                variants_ready,
                timeout_s=540,
                interval_s=12,
            )

        current = must_retry("get-production-request-before-promote", lambda: bridge("GET", f"/api/production-requests/{pr_id}"))
        record = current.get("record") or {}
        thumbnail = str(record.get("thumbnail_mode") or "")
        evidence["thumbnail_mode_before_promote"] = thumbnail
        patched = must_retry(
            "patch-native-promote-fields",
            lambda: bridge(
                "PATCH",
                f"/api/production-requests/{pr_id}",
                production_fields("Yes" if thumbnail == "Use photo frame" else (thumbnail or THUMBNAIL_MODE)),
            ),
        )
        patched_record = patched.get("record") or {}
        evidence["thumbnail_mode_patched_for_promote"] = patched_record.get("thumbnail_mode")
        evidence["content_type_patched_for_promote"] = patched_record.get("content_type")
        evidence["platforms_patched_for_promote"] = patched_record.get("platforms")
        evidence["defect_rc_native_d1"] = {
            "id": "RC-NATIVE-D1",
            "title": "Promote rejects Thumbnail_Mode=Use photo frame",
            "workaround": "PATCH thumbnail_mode Yes before promote",
        }
        evidence["defect_rc_native_d2"] = {
            "id": "RC-NATIVE-D2",
            "title": "Partial PATCH of a Production Request nulls Master_Content_Type and Target_Platforms",
            "seen": "After thumbnail-only PATCH, promote failed: Choose a Master content type. Choose at least one Target platform.",
            "workaround": "PATCH the full native photo contract before promote",
            "fix": "updateProductionRequest merges the existing record before sanitize",
        }

        preflight = must_retry("bridge-preflight", lambda: bridge("GET", f"/api/production-requests/{pr_id}/bridge-preflight"))
        evidence["bridge_preflight_ready"] = bool(preflight.get("ready") or (preflight.get("preflight") or {}).get("ready"))
        if preflight.get("ready") is False or (
            isinstance(preflight.get("preflight"), dict) and preflight["preflight"].get("ready") is False
        ):
            raise RuntimeError(f"bridge preflight not ready: {json.dumps(preflight)[:4000]}")

        promote = None
        for attempt in range(1, 9):
            result = bridge("POST", f"/api/production-requests/{pr_id}/promote", {}, timeout=180)
            body = result.get("body") if isinstance(result.get("body"), dict) else {}
            waiting = result.get("status") == 409 and any(
                token in json.dumps(body).lower()
                for token in ("not ready", "still preparing", "in progress", "try again")
            )
            if retryable(result) or waiting:
                log(f"promote attempt {attempt} waiting: {body.get('error') or body.get('message') or result.get('status')}")
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
            rec = body.get("record") or {}
            status = str(rec.get("status") or "")
            links = rec.get("promoted_content_item_links") or []
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
