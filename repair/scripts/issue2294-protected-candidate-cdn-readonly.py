"""Issue #2294: GET-only independent public-CDN byte/geometry audit.

Frozen manifest is a read-only production Supabase snapshot. Never approve,
create slide records, schedule, release holds, or contact a publishing API.
The stored selected images are UNVERIFIED even when this check succeeds.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "repair/manifests/issue2294-protected-candidate-gallery-cdn-20261122.json"
REPORT = Path("/tmp/issue2294-protected-candidate-cdn-audit.json")
OUTPUTS = (10853, 10854, 10992, 10993, 11033, 11034, 11129, 11130, 11131, 11132, 11136, 11137)
MAX_BYTES = 5 * 1024 * 1024


def safe_url(value: str) -> bool:
    try:
        p = urlsplit(value)
    except (ValueError, TypeError):
        return False
    return (p.scheme == "https" and p.netloc == "media.chicagoshining.com"
            and p.path.startswith("/studio/previews/")
            and p.path.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
            and not p.query and not p.fragment and not p.username and not p.password
            and ".." not in p.path and "\\" not in p.path)


def check_candidate(output: int, source: dict) -> dict:
    address = str(source["cdn_url"])
    result = {
        "output_number": output, "slide": int(source["slide"]),
        "declared_aspect": source["declared_aspect"],
        "asset_record_id": source["media_asset_id"],
        "http_status": None, "mime": None, "bytes": 0, "width": None,
        "height": None, "sha256": None, "byte_valid": False,
        "geometry_4x5_valid": False, "status": "not_checked",
    }
    if not safe_url(address):
        result["status"] = "unsafe_source_url"
        return result
    try:
        req = Request(address, headers={
            "User-Agent": "SM-Pipeline-V2-Issue2294-ReadOnly-Audit/1.0",
            "Accept": "image/jpeg,image/png,image/webp",
        }, method="GET")
        with urlopen(req, timeout=25) as res:
            result["http_status"] = res.status
            result["mime"] = str(res.headers.get("Content-Type", "")).split(";")[0].lower().strip()
            if not safe_url(res.url):
                result["status"] = "redirect_outside_approved_host"
                return result
            if res.status != 200 or result["mime"] not in ("image/jpeg", "image/png", "image/webp"):
                result["status"] = "http_or_mime_invalid"
                return result
            data = res.read(MAX_BYTES + 1)
        result["bytes"] = len(data)
        if not data or len(data) > MAX_BYTES:
            result["status"] = "empty_or_oversized_media"
            return result
        with Image.open(BytesIO(data)) as im:
            width, height = im.size
            actual_format = im.format
            im.load()
        if actual_format not in ("JPEG", "PNG", "WEBP"):
            result["status"] = "invalid_image_format"
            return result
        result["width"], result["height"] = width, height
        result["sha256"] = hashlib.sha256(data).hexdigest()
        result["byte_valid"] = True
        result["geometry_4x5_valid"] = width > 0 and width * 5 == height * 4
        result["status"] = "source_image_4x5_verified" if result["geometry_4x5_valid"] else "crop_geometry_not_4x5"
    except Exception as exc:
        result["status"] = "cdn_get_or_decode_failed"
        result["error_class"] = type(exc).__name__[:60]
    return result


def main() -> None:
    document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = document.get("entries", [])
    if (document.get("schema") != "SM_pipeline_issue_2294_candidate_cdn_audit_v1"
            or document.get("read_only") is not True
            or document.get("release_to_publish_authorized") is not False
            or document.get("do_not_approve") is not True
            or document.get("record_count") != 12
            or document.get("candidate_slide_count") != 82
            or sorted(x["output_number"] for x in entries) != list(OUTPUTS)):
        raise SystemExit("source_manifest_safety_or_identity_mismatch")
    batch = []
    for entry in entries:
        if (entry["do_not_publish"] is not True
                or entry["publication_authorized"] is not False
                or entry["candidate_slide_count"] != len(entry["slide_candidates"])
                or entry["candidate_slide_count"] < 2
                or entry["candidate_slide_count"] > 10
                or [x["slide"] for x in entry["slide_candidates"]]
                    != list(range(1, entry["candidate_slide_count"] + 1))):
            raise SystemExit("candidate_count_order_or_hold_mismatch")
        urls = [x["cdn_url"] for x in entry["slide_candidates"]]
        if len(set(urls)) != len(urls) or not all(safe_url(u) for u in urls):
            raise SystemExit("candidate_cdn_url_invalid_or_duplicate")
        batch.extend((entry["output_number"], x) for x in entry["slide_candidates"])
    if len(batch) != 82:
        raise SystemExit("source_candidate_total_changed")

    images = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(check_candidate, n, s) for n, s in batch]
        for future in as_completed(futures):
            images.append(future.result())
    images.sort(key=lambda x: (x["output_number"], x["slide"]))
    dispositions = []
    for entry in entries:
        n = entry["output_number"]
        checked = [x for x in images if x["output_number"] == n]
        all_get = all(x["byte_valid"] for x in checked)
        all_4x5 = all(x["geometry_4x5_valid"] for x in checked)
        dispositions.append({
            "output_number": n, "selected_count": len(checked),
            "cdn_get_bytes_verified": all_get,
            "all_exact_4x5": all_4x5,
            "declared_non_4x5_count": sum(x["declared_aspect"] != "4:5" for x in checked),
            "native_slides_created": 0, "human_creative_approval": False,
            "publish_authorized": False,
            "decision": "source_candidate_eligible_for_creative_review" if all_get and all_4x5
                        else "source_image_http_or_crop_repair_required",
        })
    report = {
        "schema": "SM_pipeline_issue_2294_cdn_get_audit_result_v1",
        "read_only": True, "no_supabase_writes": True, "provider_calls": 0,
        "media_calls": 0, "approval_calls": 0, "scheduled_posts": 0,
        "native_slide_writes": 0, "publish_hold_released": False,
        "automatic_creative_approval": False,
        "candidate_total": len(images),
        "full_bytes_verified": sum(x["byte_valid"] for x in images),
        "exact_4x5_verified": sum(x["geometry_4x5_valid"] for x in images),
        "outputs_with_complete_http_and_geometry": sum(
            d["cdn_get_bytes_verified"] and d["all_exact_4x5"] for d in dispositions),
        "dispositions": dispositions, "images": images,
        "warning": "Successful CDN GET + geometry is NOT watermark, rights, caption or Factory final approval.",
    }
    REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("ISSUE2294_CDN_AUDIT=" + json.dumps({k: v for k, v in report.items()
        if k not in ("dispositions", "images")}, separators=(",", ":")))
    for d in dispositions:
        print("ISSUE2294_OUTPUT=" + json.dumps(d, separators=(",", ":")))


if __name__ == "__main__":
    main()
