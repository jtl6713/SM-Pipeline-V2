"""Seed one Studio scenario through the temporary service-binding bridge.

Requires BRIDGE_URL. Stamps Test_Run_ID so production orchestrators do not
public-publish the row. Stops after Promote unless POLL_REVIEW=1.
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

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from catalog import get_live, load_catalog, photo_rows

UA = "ChicagoShiningRegression/1.0"


def _log(msg: str) -> None:
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
                "curl", "-sS", "--max-time", str(timeout), "-A", "curl/8.5.0",
                "-H", "Content-Type: application/json", "-H", "Accept: application/json",
                "--data-binary", f"@{payload_path}", "-o", out_path, "-w", "%{http_code}",
                os.environ["BRIDGE_URL"],
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        http_code = (completed.stdout or "").strip() or "000"
        raw = Path(out_path).read_text(encoding="utf-8") if os.path.exists(out_path) else ""
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
    _log(f"{step} http={result.get('status')}")
    return body


def retryable(result: dict) -> bool:
    status = int(result.get("status") or 0)
    body = result.get("body") if isinstance(result.get("body"), dict) else {}
    if result.get("ok") and status in {0, 200, 201, 202} and body.get("ok") is not False:
        return False
    text = json.dumps(body)
    return bool(body.get("retryable")) or status in {404, 408, 429, 500, 502, 503, 504, 520, 530} or "1101" in text or "1042" in text or "error code" in text.lower()


def must_retry(step: str, call, attempts: int = 12, delay_s: int = 3) -> dict:
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            result = call()
            if retryable(result) and attempt < attempts:
                wait = 20 if int(result.get("status") or 0) == 429 else delay_s
                _log(f"{step} transient HTTP {result.get('status')} attempt={attempt}")
                time.sleep(wait)
                continue
            return must(step, result)
        except RuntimeError as exc:
            last_error = exc
            if attempt >= attempts or ("1101" not in str(exc) and "retryable" not in str(exc) and "HTTP 5" not in str(exc) and "HTTP 404" not in str(exc)):
                raise
            _log(f"{step} retry {attempt}: {exc}")
            time.sleep(delay_s)
    raise last_error or RuntimeError(f"{step} failed")


def poll_until(step: str, path: str, predicate, timeout_s: int = 480, interval_s: int = 8) -> dict:
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        result = bridge("GET", path, timeout=90)
        body = result.get("body") if isinstance(result.get("body"), dict) else {}
        last = body
        if (not result.get("ok") or retryable(result)) and int(result.get("status") or 0) >= 400:
            _log(f"{step} waiting transient={result.get('status')}")
            time.sleep(interval_s)
            continue
        try:
            if predicate(body):
                _log(f"{step} ready")
                return body
        except Exception:
            pass
        time.sleep(interval_s)
    raise RuntimeError(f"{step} timed out: {json.dumps(last)[:4000]}")


def origin_notes(spec: dict, test_run_id: str) -> str:
    origin = str(spec.get("origin") or "ez-wizard")
    parts = [f"origin={origin}", f"regression-run={test_run_id}"]
    if spec.get("ez_input"):
        parts.append(f"ez-input={spec['ez_input']}")
    if spec.get("caption_mode"):
        parts.append(f"ez-caption={spec['caption_mode']}")
    if spec.get("package"):
        parts.append(f"ez-package={spec['package']}")
    if origin == "az-finished-video":
        parts.append("az-auto-queue=1")
    return "; ".join(parts) + f". [REGRESSION] {spec.get('id')}. Private/unreleased publish only. Do not public-post."


def production_fields(spec: dict, extra=None) -> dict:
    fields = {
        "content_type": spec.get("content_type"),
        "platforms": list(spec.get("platforms") or []),
        "voiceover_mode": spec.get("voiceover_mode") or "No",
        "background_music_mode": spec.get("background_music_mode") or "No",
        "thumbnail_mode": spec.get("thumbnail_mode") or "Yes",
        "carousel_image_mode": spec.get("carousel_image_mode") or "Manual Upload",
        "title_mode": "AI decides" if spec.get("caption_mode") != "none" else "Leave blank",
        "caption_mode": "Leave blank" if spec.get("caption_mode") == "none" else ("Force exact" if spec.get("caption_mode") == "manual" else "AI decides"),
        "script_mode": "Leave blank" if spec.get("caption_mode") == "none" else "AI decides",
        "youtube_privacy_status": "private",
    }
    photo_count = int(spec.get("photo_count") or 0)
    if photo_count > 1:
        fields["carousel_slide_count_mode"] = spec.get("carousel_slide_count_mode") or "Exact"
        if fields["carousel_slide_count_mode"] == "Exact":
            fields["carousel_slide_count_exact"] = photo_count
    elif spec.get("carousel_slide_count_mode"):
        fields["carousel_slide_count_mode"] = spec["carousel_slide_count_mode"]
    if extra:
        fields.update(extra)
    return {key: value for key, value in fields.items() if value is not None}


def run_studio_scenario(live_id: str, spec: dict | None = None) -> dict:
    if not os.environ.get("BRIDGE_URL"):
        raise RuntimeError("live Studio scenarios need BRIDGE_URL (temporary Cloudflare service bridge)")
    catalog = load_catalog()
    spec = dict(spec or get_live(live_id, catalog))
    spec["id"] = live_id
    if spec.get("needs_finished_video") and not os.environ.get("REGRESSION_FINISHED_VIDEO_URL"):
        raise RuntimeError("ez-finished-video needs REGRESSION_FINISHED_VIDEO_URL")
    if spec.get("needs_clip") and not os.environ.get("REGRESSION_CLIP_URL"):
        raise RuntimeError("photos-and-clips needs REGRESSION_CLIP_URL")
    if spec.get("photo_wait"):
        raise RuntimeError("idea-photo-wait is covered by hermetic tests; live matcher needs a library batch and is not auto-seeded")

    run_id = os.environ.get("GITHUB_RUN_ID") or str(int(time.time()))
    test_run_id = f"REGRESSION_{live_id}_{run_id}"[:80]
    title = spec.get("title") or live_id
    if not title.startswith("[REGRESSION]"):
        title = f"[REGRESSION] {title}"
    summary = spec.get("summary") or ""
    photos = photo_rows(spec, catalog)
    photo_count = int(spec.get("photo_count") or len(photos) or 0)
    out_path = os.environ.get("SEED_RESULT_PATH") or str(_HERE / "state" / f"{live_id}.json")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    evidence = {
        "ok": False,
        "scenario_id": live_id,
        "test_run_id": test_run_id,
        "title": title,
        "expected_route": spec.get("expected_route"),
        "publish": spec.get("publish") or {},
    }
    try:
        session = must_retry("session", lambda: bridge("GET", "/api/session"), attempts=10, delay_s=5)
        if not session.get("authenticated") or not session.get("authorized"):
            raise RuntimeError(f"Studio membership failed: {json.dumps(session)[:2000]}")

        idea = must_retry("create-idea", lambda: bridge("POST", "/api/ideas", {"title": title, "summary": summary}))
        idea_id = (idea.get("record") or {}).get("id")
        if not idea_id:
            raise RuntimeError("missing idea id")
        evidence["idea_id"] = idea_id

        pr = must_retry(
            "create-production-request",
            lambda: bridge(
                "POST",
                "/api/production-requests",
                production_fields(
                    spec,
                    {
                        "idea_record_id": idea_id,
                        "production_notes": origin_notes(spec, test_run_id),
                        "test_run_id": test_run_id,
                    },
                ),
            ),
        )
        pr_id = (pr.get("record") or {}).get("id")
        if not pr_id:
            raise RuntimeError(f"create-production-request missing id: {json.dumps(pr)[:2000]}")
        evidence["production_request_id"] = pr_id

        if photos:
            files = []
            for row in photos:
                blob = download(row["url"])
                files.append({
                    "field": "files",
                    "filename": row["filename"],
                    "content_type": "image/jpeg",
                    "b64": base64.b64encode(blob).decode("ascii"),
                })
            must("upload-assets", bridge("POST", f"/api/production-requests/{pr_id}/assets", files=files, timeout=180))

            def masters_ready(body: dict) -> bool:
                rec = body.get("record") or {}
                assets = rec.get("studio_master_assets") or body.get("assets") or []
                status = str(rec.get("studio_master_asset_status") or body.get("status") or "")
                count = int(rec.get("studio_master_asset_count") or body.get("count") or len(assets) or 0)
                authoritative = sum(1 for asset in assets if asset.get("google_drive_file_id") and asset.get("media_asset_record_id"))
                return count >= photo_count and (status == "Ready" or authoritative >= photo_count)

            poll_until("master-assets", f"/api/production-requests/{pr_id}/assets", masters_ready, timeout_s=720, interval_s=10)

        overrides = dict(spec.get("overrides") or {})
        extras = list(spec.get("extras") or [])
        platforms = list(spec.get("platforms") or [])
        plan = must_retry(
            "build-plan",
            lambda: bridge(
                "POST",
                f"/api/production-requests/{pr_id}/plan",
                {"platforms": platforms, "overrides": overrides, "extras": extras},
            ),
        )
        planned_items = ((plan.get("plan") or {}).get("items") or [])
        planned = [{"platform": item.get("platform"), "output_type": item.get("output_type")} for item in planned_items]
        evidence["plan"] = planned
        expected = {(platform, output_type) for platform, output_type in overrides.items()}
        extra_pairs = {(row.split("::", 1)[0], row.split("::", 1)[1]) for row in extras if "::" in row}
        got = {(item["platform"], item["output_type"]) for item in planned}
        if not expected.issubset(got) or extra_pairs - got:
            raise RuntimeError(f"planner did not emit expected types: expected={sorted(expected | extra_pairs)} got={planned}")

        current = must_retry("get-production-request-before-variants", lambda: bridge("GET", f"/api/production-requests/{pr_id}"))
        variant_status = str((current.get("record") or {}).get("studio_variant_status") or "")
        if variant_status != "Ready" and photos:
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
            poll_until(
                "variants",
                f"/api/production-requests/{pr_id}/variants",
                lambda body: body.get("plan_complete") is True or str((body.get("record") or {}).get("studio_variant_status") or body.get("status") or "") == "Ready",
                timeout_s=900,
                interval_s=12,
            )

        patched = must_retry(
            "patch-promote-fields",
            lambda: bridge("PATCH", f"/api/production-requests/{pr_id}", production_fields(spec, {"test_run_id": test_run_id})),
        )
        evidence["thumbnail_mode"] = (patched.get("record") or {}).get("thumbnail_mode")
        preflight = must_retry("bridge-preflight", lambda: bridge("GET", f"/api/production-requests/{pr_id}/bridge-preflight"))
        if preflight.get("ready") is False:
            raise RuntimeError(f"bridge preflight not ready: {json.dumps(preflight)[:4000]}")

        promote = None
        for attempt in range(1, 9):
            result = bridge("POST", f"/api/production-requests/{pr_id}/promote", {}, timeout=180)
            body = result.get("body") if isinstance(result.get("body"), dict) else {}
            if body.get("promoted") or str(body.get("promotion_state") or "") == "promoted":
                promote = body
                break
            waiting = result.get("status") == 409 and any(
                token in json.dumps(body).lower()
                for token in ("not ready", "still preparing", "in progress", "try again")
            )
            if retryable(result) or waiting:
                time.sleep(15)
                continue
            promote = must("promote", result)
            break
        if promote is None:
            raise RuntimeError("promote never accepted")
        evidence["promote"] = {
            "promoted": promote.get("promoted"),
            "content_item_record_id": promote.get("content_item_record_id"),
        }

        latest = poll_until(
            "promotion-complete",
            f"/api/production-requests/{pr_id}",
            lambda body: str((body.get("record") or {}).get("status") or "") == "Promoted" or bool((body.get("record") or {}).get("promoted_content_item_links")),
            timeout_s=240,
            interval_s=8,
        )
        record = latest.get("record") or {}
        evidence["production_request_status"] = record.get("status")
        evidence["content_item_record_id"] = promote.get("content_item_record_id")
        evidence["studio_url"] = f"https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/{pr_id}"
        evidence["ok"] = True
        evidence["stop"] = "promoted"
        evidence["note"] = (
            "Seeded with Test_Run_ID so production cadence will not public-publish. "
            "YouTube_Privacy_Status=private. Instagram/Facebook stop before public Graph publish."
        )
        return evidence
    except Exception as exc:
        evidence["error"] = str(exc)
        raise
    finally:
        Path(out_path).write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
