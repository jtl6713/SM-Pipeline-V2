"""#2374: verify original approved Instagram gallery image headers without touching providers.

Input is an immutable source-only Supabase gallery manifest committed to the
repository. This program cannot write to Supabase, Airtable, Meta or R2. Never
convert a valid image into a permission to publish.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "repair/manifests/issue2374-ig-source-gallery-11-20261121.json"
REPORT = Path("/tmp/issue2374-ig-gallery-http-verification.json")
MAX_BYTES = 196608
EXPECTED = 54


def safe_url(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and parts.hostname == "media.chicagoshining.com"
        and parts.port in (None, 443)
        and not parts.username and not parts.password
        and not parts.fragment
        and bool(parts.path)
    )


def check_image(output_number: int, slide: dict) -> dict:
    url = str(slide.get("public_4x5_url") or "")
    result = {
        "output": output_number, "number": slide.get("number"),
        "source_slide_id": slide.get("slide_id"),
        "host_allowlisted": safe_url(url), "http": 0,
        "mime": "", "width": 0, "height": 0,
        "ratio": 0, "source_asset_verified": False, "status": "not_started",
    }
    if not result["host_allowlisted"]:
        result["status"] = "url_rejected"
        return result
    try:
        req = Request(url, headers={"Range": f"bytes=0-{MAX_BYTES-1}",
                                    "User-Agent": "SM-Pipeline-V2-Source-Asset-Audit/1.0"},
                      method="GET")
        with urlopen(req, timeout=20) as resp:
            result["http"] = int(resp.status)
            result["mime"] = resp.headers.get("Content-Type", "").split(";")[0].lower()
            data = resp.read(MAX_BYTES)
            if result["http"] not in (200, 206) or not result["mime"].startswith("image/"):
                result["status"] = "http_or_mime_not_image"
                return result
        with Image.open(BytesIO(data)) as im:
            result["width"], result["height"] = im.size
            result["image_format"] = str(im.format or "")
        if result["height"] <= 0:
            result["status"] = "invalid_dimensions"
            return result
        result["ratio"] = round(result["width"] / result["height"], 5)
        result["source_asset_verified"] = True
        result["status"] = "source_image_header_verified"
    except Exception as exc:
        # Preserve evidence but never leak URLs, query strings or credentials.
        result["status"] = "source_http_or_header_inconclusive"
        result["error_class"] = type(exc).__name__[:60]
    return result


def main() -> None:
    content = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = content.get("entries", [])
    if (content.get("record_count") != 11 or len(entries) != 11
            or content.get("canonical_source_candidates") != 10
            or content.get("ambiguous_human_review") != 1
            or content.get("release_to_publish_authorized") is not False):
        raise SystemExit("source_manifest_identity_or_safety_failure")
    numbers = [int(x["output_number"]) for x in entries]
    if len(set(numbers)) != 11:
        raise SystemExit("duplicated_output_identity_in_source_manifest")
    slides = [(int(e["output_number"]), s) for e in entries for s in e["slides"]]
    if len(slides) != EXPECTED:
        raise SystemExit("source_slide_count_drift")
    if not all(safe_url(str(s["public_4x5_url"])) for _, s in slides):
        raise SystemExit("source_asset_host_not_allowlisted")
    records = []
    with ThreadPoolExecutor(max_workers=7) as pool:
        futures = [pool.submit(check_image, out, s) for out, s in slides]
        for future in as_completed(futures):
            records.append(future.result())
    by_output = {n: [] for n in numbers}
    for r in records:
        by_output[r["output"]].append(r)
    disposition = []
    for entry in entries:
        n = int(entry["output_number"])
        image_results = sorted(by_output[n], key=lambda x: (int(x["number"]), x["source_slide_id"]))
        all_http = all(x["source_asset_verified"] for x in image_results)
        all_4x5 = all(x["source_asset_verified"] and 0.77 <= x["ratio"] <= 0.83 for x in image_results)
        original_gallery_unique = entry["canonical_candidate"] is True
        disposition.append({
            "output": n, "profile": entry["market_name"],
            "source_gallery_unique": original_gallery_unique,
            "source_image_headers_verified": all_http,
            "source_images_4x5": all_4x5,
            "source_slide_count": len(image_results),
            "review_lane": (
                "source_gallery_ready_for_human_creative_review"
                if original_gallery_unique and all_http and all_4x5
                else "creative_repair_or_source_verification_needed"
            ),
            "assets": image_results,
        })
    report = {
        "version": "issue2374_ig_gallery_http_v1",
        "read_only": True, "source": "production_supabase_source_manifest",
        "provider_writes": 0, "output_writes": 0, "publish_calls": 0,
        "slides_examined": len(records),
        "http_header_verified": sum(x["source_asset_verified"] for x in records),
        "four_by_five_verified": sum(x["source_asset_verified"] and 0.77 <= x["ratio"] <= 0.83 for x in records),
        "canonical_galleries_available_for_review": sum(
            x["review_lane"] == "source_gallery_ready_for_human_creative_review" for x in disposition
        ),
        "ambiguous_galleries_not_auto_released": sum(not x["source_gallery_unique"] for x in disposition),
        "rework_held": 11, "auto_approval": False, "auto_publish": False,
        "dispositions": sorted(disposition, key=lambda x: x["output"]),
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("ISSUE2374_IG_SOURCE_VERIFY=" + json.dumps({
        k: v for k, v in report.items() if k != "dispositions"
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
