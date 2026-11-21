"""Issue #2374: bounded GET-only original Studio preview gallery recovery.

Seven original IG outputs have no linked C9 slide rows; their original
studio_preview_url gives a real first-image location, not proof that any
adjacent image exists. Probe 32 candidate index paths with actual HTTP + image
header checks, without changing Supabase, R2, Instagram or Factory approval.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "repair/manifests/issue2374-seven-original-ig-preview-candidates-20261121.json"
REPORT = Path("/tmp/issue2374-seven-original-ig-preview-http-evidence.json")
MAX_BYTES = 196608
EXPECTED_IMAGES = 32
ORIGINAL = re.compile(
    r"^/studio/previews/(?P<family>lettered|watermarked)/(?P<record>rec[A-Za-z0-9]{14})/0\.jpg$"
)


def build_candidate(first: str, index: int) -> str:
    url = urlsplit(first)
    if (url.scheme != "https" or url.hostname != "media.chicagoshining.com"
            or url.port not in (None, 443) or url.username or url.password
            or url.query or url.fragment or not ORIGINAL.fullmatch(url.path)
            or isinstance(index, bool) or not isinstance(index, int)
            or index < 0 or index > 9):
        raise ValueError("original_preview_url_or_index_not_allowed")
    return urlunsplit((url.scheme, url.netloc, url.path[:-5] + str(index) + ".jpg", "", ""))


def check_image(output: int, n: int, url: str) -> dict:
    result = {"output": output, "index": n, "http": 0,
              "mime": "", "image_width": 0, "image_height": 0,
              "ratio": 0, "real_image_header": False,
              "is_4x5": False, "status": "not_checked"}
    try:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.hostname != "media.chicagoshining.com"
                or parsed.port not in (None, 443) or parsed.username or parsed.password):
            raise ValueError("candidate_host_not_allowlisted")
        req = Request(
            url, method="GET",
            headers={"Range": f"bytes=0-{MAX_BYTES-1}",
                     "User-Agent": "SM-Pipeline-V2-HeldIGPreviewRecovery/1.0"},
        )
        with urlopen(req, timeout=20) as response:
            final = urlsplit(response.geturl())
            if final.scheme != "https" or final.hostname != "media.chicagoshining.com":
                raise ValueError("unapproved_image_redirect")
            result["http"] = int(response.status)
            result["mime"] = response.headers.get("Content-Type", "").split(";")[0].lower()
            if result["http"] not in (200, 206) or result["mime"] not in (
                "image/jpeg", "image/png", "image/webp"
            ):
                result["status"] = "non_image_response"
                return result
            data = response.read(MAX_BYTES)
        with Image.open(BytesIO(data)) as im:
            result["image_width"], result["image_height"] = im.size
            result["image_format"] = str(im.format or "")
        h = result["image_height"]
        if h < 1:
            raise ValueError("invalid_image_dimensions")
        result["real_image_header"] = True
        result["ratio"] = round(result["image_width"] / h, 5)
        result["is_4x5"] = 0.77 <= result["ratio"] <= 0.83
        result["status"] = "verified_4x5_source" if result["is_4x5"] else "verified_wrong_aspect_source"
    except Exception as err:
        result["status"] = "source_image_missing_or_inconclusive"
        result["error_class"] = type(err).__name__[:64]
    return result


def main() -> None:
    source = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = source["outputs"]
    if (source["source"] != "production_supabase" or source["output_count"] != 7
            or len(entries) != 7 or source["original_expected_images"] != EXPECTED_IMAGES
            or source["read_only"] is not True
            or source["publish_calls_authorized"] is not False
            or source["fresh_factory_approval_required"] is not True):
        raise SystemExit("original_source_manifest_contract_changed")
    if len({e["output_number"] for e in entries}) != 7:
        raise SystemExit("original_source_duplicate_identity")
    tasks = []
    for e in entries:
        if e["held_verified"] is not True:
            raise SystemExit("original_hold_not_verified")
        n = int(e["expected_image_count"])
        if n < 2 or n > 10:
            raise SystemExit("unexpected_carousel_size")
        for i in range(n):
            tasks.append((int(e["output_number"]), i,
                          build_candidate(e["original_first_image"], i)))
    if len(tasks) != EXPECTED_IMAGES:
        raise SystemExit("candidate_count_not_32")
    outcomes = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        future_map = {
            executor.submit(check_image, output, i, url): (output, i)
            for output, i, url in tasks
        }
        for future in as_completed(future_map):
            outcomes.append(future.result())
    status = []
    for e in entries:
        n = int(e["output_number"])
        checks = sorted((x for x in outcomes if x["output"] == n),
                        key=lambda x: x["index"])
        if len(checks) != e["expected_image_count"]:
            raise SystemExit("missing_source_image_result")
        real = all(x["real_image_header"] for x in checks)
        all4x5 = all(x["is_4x5"] for x in checks)
        status.append({
            "output": n, "market": e["market_name"],
            "title": e["content_title"],
            "expected": e["expected_image_count"],
            "source_first_preview_family": urlsplit(
                e["original_first_image"]).path.split("/")[3],
            "accessible_images": sum(x["real_image_header"] for x in checks),
            "valid_4x5_images": sum(x["is_4x5"] for x in checks),
            "original_preview_sequence_available": real and all4x5,
            "original_factory_slide_identity_proven": False,
            "stage_ingest_authorized": False,
            "fresh_factory_approval_required": True,
            "disposition": (
                "candidate_original_visual_sequence_for_human_review"
                if real and all4x5 else
                "manual_creative_rebuild_or_dimension_repair_needed"
            ),
            "source_image_checks": checks,
        })
    report = {
        "schema_version": "issue2374_seven_original_preview_http_v1",
        "read_only": True, "source": "production_supabase_preview_manifest",
        "output_writes": 0, "provider_writes": 0,
        "graph_media_creates": 0, "publishes": 0, "airtable_operations": 0,
        "candidate_http_gets": len(outcomes),
        "real_image_headers": sum(x["real_image_header"] for x in outcomes),
        "valid_4x5_images": sum(x["is_4x5"] for x in outcomes),
        "valid_full_sequences": sum(x["original_preview_sequence_available"] for x in status),
        "human_review_required": True, "held_outputs": 7,
        "original_image_identity_proven": False,
        "outputs": sorted(status, key=lambda x: x["output"]),
    }
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                      encoding="utf-8")
    print("ISSUE2374_ORIGINAL_IG_PREVIEW_HTTP=" + json.dumps({
        k: v for k, v in report.items() if k != "outputs"
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
