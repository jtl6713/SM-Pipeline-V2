#!/usr/bin/env python3
"""#2294: exact NYC 10992/10993 candidate image GET-only geometric verification.

This cannot write DB rows, release holds, create carousel slides or contact
Instagram/Facebook. It does not assert creative/brand/final approval.
"""
from __future__ import annotations

import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "repair/manifests/issue2294-nyc-ferry-original-source-16-20261122.json"
REPORT = Path("/tmp/issue2294-nyc-native-photo-public-geometry.json")
MAX_BYTES = 15 * 1024 * 1024
REC = __import__("re").compile(r"rec[A-Za-z0-9]{14}")

def assert_source() -> list[dict]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert data["schema"] == "studio.issue2294.original_selected_image_http_audit.1"
    assert data["read_only"] is True and data["publication_authorized"] is False
    assert data["db_writes"] == data["provider_writes"] == 0
    outputs = data["outputs"]
    assert [item["output_number"] for item in outputs] == [10992, 10993]
    assert [item["output_record_id"] for item in outputs] == ["rec1p9SOjrpxtpQkV", "recX9tOrTfQldqs32"]
    selected = []
    for item in outputs:
        assert item["release_to_publish_authorized"] is False
        assert item["slide_package_state"] == "missing_canonical_slides"
        assert item["expected_slides"] == 8 and len(item["images"]) == 8
        ids, urls = set(), set()
        for index, image in enumerate(item["images"], 1):
            assert image["order"] == index
            assert image["selected_render_match"] is True
            assert image["source_rights_metadata"] == "Owned"
            assert image["cdn_image_bytes_verified"] is False and image["aspect_4x5_verified"] is False
            assert REC.fullmatch(image["source_asset_record_id"])
            url = image["public_url"]
            parts = urlsplit(url)
            assert parts.scheme == "https" and parts.hostname == "media.chicagoshining.com"
            assert parts.port in (None, 443) and not parts.username and not parts.password
            assert not parts.query and not parts.fragment and parts.path.endswith(".jpg")
            assert parts.path.startswith("/studio/previews/")
            if item["output_number"] == 10992:
                assert parts.path == f"/studio/previews/lettered/{item['output_record_id']}/{index-1}.jpg"
            else:
                assert parts.path.startswith("/studio/previews/item4/reczvqjo1xs2jYXn0/ITEM4-VARIANT-fill-crop-v2-")
            assert url not in urls and image["source_asset_record_id"] not in ids
            urls.add(url);ids.add(image["source_asset_record_id"])
            selected.append((item["output_number"],index,url))
    assert len(selected) == 16
    return selected

def read_candidate(item: tuple[int,int,str]) -> dict:
    output, slot, address = item
    result = {"output_number":output,"slot":slot,"http":0,"mime":None,
              "bytes":0,"width":0,"height":0,"ratio":None,
              "aspect_4x5_verified":False,"status":"unverified"}
    try:
        req = Request(address, headers={
            "User-Agent":"SM-Pipeline-V2-issue2294-gallery-GET-only/1.0",
            "Accept":"image/jpeg,image/png,image/webp",
        }, method="GET")
        with urlopen(req, timeout=25) as response:
            result["http"] = int(response.status)
            result["mime"] = response.headers.get("Content-Type", "").split(";",1)[0].lower().strip()
            if response.geturl() != address:
                result["status"]="redirected_outside_original_source"
                return result
            if result["http"] != 200 or result["mime"] not in {"image/jpeg","image/png","image/webp"}:
                result["status"]="http_or_mime_invalid"
                return result
            raw = response.read(MAX_BYTES+1)
        result["bytes"] = len(raw)
        if len(raw) < 1024 or len(raw) > MAX_BYTES:
            result["status"]="image_size_invalid"
            return result
        with Image.open(io.BytesIO(raw)) as image:
            image.verify()
        with Image.open(io.BytesIO(raw)) as image:
            result["width"],result["height"]=image.size
            actual=image.format
        if (result["mime"] == "image/jpeg" and actual != "JPEG") or (
            result["mime"] == "image/png" and actual != "PNG") or (
            result["mime"] == "image/webp" and actual != "WEBP"):
            result["status"]="image_content_type_mismatch"
            return result
        if result["height"] < 800 or result["width"] < 640:
            result["status"]="image_geometry_too_small"
            return result
        result["ratio"]=round(result["width"]/result["height"],5)
        result["sha256"]=hashlib.sha256(raw).hexdigest()
        result["aspect_4x5_verified"]=abs(result["ratio"]-0.8)<=0.025
        result["status"]="4x5_verified" if result["aspect_4x5_verified"] else "wrong_aspect_for_native_photo"
    except Exception as exc:
        result["status"]="http_or_image_verification_inconclusive"
        result["error_type"]=type(exc).__name__[:60]
    return result

def main() -> None:
    candidates=assert_source()
    with ThreadPoolExecutor(max_workers=4) as pool:
        checked=list(pool.map(read_candidate,candidates))
    summaries={}
    for output in (10992,10993):
        images=[x for x in checked if x["output_number"]==output]
        distinct=len({x.get("sha256") for x in images if x.get("sha256")})
        ready=all(x["aspect_4x5_verified"] for x in images) and distinct==8
        summaries[str(output)]={
            "source_images":8,"http_200":sum(x["http"]==200 for x in images),
            "4x5_verified":sum(x["aspect_4x5_verified"] for x in images),
            "distinct_sha256":distinct,
            "source_geometry_candidate_verified":ready,
            "native_slides_created":0,"final_review_approved":False,
            "publishing_authorized":False,
        }
    report={
        "schema":"studio.issue2294.original_source_public_geometry.1",
        "checked_at_utc":datetime.now(timezone.utc).isoformat(),
        "read_only":True,"db_writes":0,"provider_writes":0,
        "auto_approve":False,"publishing_authorized":False,
        "totals":{"image_attempts":len(checked),"http_200":sum(x["http"]==200 for x in checked),
                  "geometry_4x5":sum(x["aspect_4x5_verified"] for x in checked)},
        "outputs":summaries,"images":checked,
    }
    REPORT.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print("ISSUE2294_SOURCE_GEOMETRY="+json.dumps({
        "totals":report["totals"],"outputs":summaries,
        "read_only":True,"publishing_authorized":False,
    },sort_keys=True))

if __name__=="__main__":
    main()
