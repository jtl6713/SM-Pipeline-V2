#!/usr/bin/env python3
"""Exact-scope asset staging for FB output #10738; no database or Meta mutations.

Run only on the owner-authorized Ops host with the configured runner Drive/R2
credentials. Creates separate, attributable 4:5 replacement images without
overwriting the old Runyon Canyon files. Receipts are emitted for later
transactional output/slides update. The images are AI-generated candidate art.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps
from dotenv import load_dotenv

OUTPUT_ID = "recfGHDLbkTBLuPYx"
NUMBER = 10738
DRIVE_FOLDER = "1UXVnEeky9FghOO-tYV5VkuJUk-Mkpaud"  # Studio Variants, owner-verified
URLS = [
    "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:d535db6e-0fb4-4462-994e-4db5f9cd3d21",
    "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:a645f65b-c3df-4755-9937-3aa175acfd99",
    "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:022f3008-8b69-462f-b6bd-1bb3d645fa9e",
    "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:ba04ce00-050f-418f-ace0-1133be2fddb1",
]
LABELS = ["Echo-Park-Lake", "Angels-Point", "Baxter-Stairs", "Dodger-Stadium-Overlook"]


def _load_runner():
    root = Path.cwd() / "Services" / "pipeline-runner" / "service"
    env_file = root / ".env"
    if not root.is_dir() or not env_file.is_file():
        raise RuntimeError("runner_environment_not_found")
    load_dotenv(env_file, override=False)
    # Some Ops service.env deployments define PORT with an empty value;
    # the runner listens on 3350 and load_settings() otherwise int("").
    if not os.environ.get("PORT"):
        os.environ["PORT"] = "3350"
    sys.path.insert(0, str(root))
    for k in (
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
        "R2_UPLOAD_WORKER_URL", "R2_UPLOAD_WORKER_SECRET",
    ):
        if not os.getenv(k):
            raise RuntimeError("missing_runner_configuration_" + k)
    from integrations.google_drive import GoogleDriveClient
    from integrations.r2_upload import R2UploadClient
    return GoogleDriveClient(), R2UploadClient()


def _verify_output():
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    r = requests.get(
        base + "/rest/v1/platform_outputs",
        params={
            "airtable_record_id": "eq." + OUTPUT_ID,
            "select": "output_number,platform,platform_output_type,output_status,review_status,publish_status,fb_publish_status,do_not_publish,published_at,platform_post_url,render_clip_list,error_messages",
        },
        headers={"apikey": key, "Authorization": "Bearer " + key},
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    if not isinstance(rows, list) or len(rows) != 1:
        raise RuntimeError("output_id_not_unique")
    o = rows[0]
    if not (
        o["output_number"] == NUMBER
        and o["platform"] == "Facebook"
        and o["platform_output_type"] == "Facebook Photo Set"
        and o["output_status"] == "Approved for Publishing"
        and o["review_status"] == "Approved"
        and o["publish_status"] == "Failed"
        and o["fb_publish_status"] == "Manual Fallback Required"
        and o["do_not_publish"] is False
        and not o.get("published_at")
        and not o.get("platform_post_url")
        and not (o.get("error_messages") or {}).get("Platform_Post_ID")
    ):
        raise RuntimeError("output_10738_state_changed_aborting")
    clips = o.get("render_clip_list")
    if not isinstance(clips, list) or len(clips) != 4 or any(
        "Runyon-Canyon" not in str(x.get("assetName") or "") for x in clips
    ):
        raise RuntimeError("output_10738_source_manifest_changed_aborting")


def _brand_jpeg(blob: bytes) -> bytes:
    if not 1024 < len(blob) < 15_000_000:
        raise RuntimeError("input_image_byte_size_invalid")
    with Image.open(io.BytesIO(blob)) as input_img:
        im = ImageOps.exif_transpose(input_img).convert("RGB")
    if im.size != (1080, 1350):
        raise RuntimeError("input_image_not_1080_by_1350")
    # This is a textual LA Shining identity mark, not a counterfeit logo.
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = None
    for path in ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.isfile(path):
            font = ImageFont.truetype(path, 41)
            break
    if font is None:
        font = ImageFont.load_default()
    text = "LA SHINING"
    bbox = d.textbbox((0, 0), text, font=font)
    width, height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x, y = im.width - width - 54, im.height - height - 54
    d.rounded_rectangle((x - 17, y - 17, x + width + 17, y + height + 18), radius=12, fill=(10, 15, 24, 185))
    d.text((x, y - bbox[1]), text, font=font, fill=(255, 255, 255, 255), stroke_width=0)
    im = Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")
    out = io.BytesIO()
    im.save(out, "JPEG", quality=92, subsampling=0, optimize=True)
    result = out.getvalue()
    if not 1024 < len(result) < 15_000_000:
        raise RuntimeError("branded_jpeg_byte_size_invalid")
    return result


def _verify_public(url: str, digest: str):
    for n in range(5):
        try:
            r = requests.get(url, timeout=35, headers={"Cache-Control": "no-cache"})
            r.raise_for_status()
            blob = r.content
            if hashlib.sha256(blob).hexdigest() != digest:
                raise RuntimeError("r2_public_bytes_do_not_match_upload")
            with Image.open(io.BytesIO(blob)) as image:
                image.load()
                if image.size != (1080, 1350) or image.format != "JPEG":
                    raise RuntimeError("r2_public_image_dimensions_invalid")
            return
        except (requests.RequestException, OSError, RuntimeError):
            if n == 4:
                raise
            time.sleep(3)


def main():
    drive, r2 = _load_runner()
    _verify_output()
    # Verify the folder is the known owner's Studio Variants folder before creating copies.
    folder = drive.get_file(DRIVE_FOLDER)
    if folder.get("id") != DRIVE_FOLDER or folder.get("mimeType") != "application/vnd.google-apps.folder" or folder.get("trashed"):
        raise RuntimeError("source_folder_not_verified")

    # Fetch/validate ALL four before creating any remote asset.
    staged = []
    for i, source in enumerate(URLS, 1):
        r = requests.get(source, timeout=55)
        r.raise_for_status()
        if "image/jpeg" not in r.headers.get("Content-Type", "").lower():
            raise RuntimeError(f"candidate_{i}_not_jpeg")
        data = _brand_jpeg(r.content)
        staged.append(data)
    print("fb10738_all_four_branded_jpegs=VERIFIED", flush=True)

    receipts = []
    for i, data in enumerate(staged, 1):
        digest = hashlib.sha256(data).hexdigest()
        key = f"studio/previews/repairs/issue2556/{OUTPUT_ID}/slide-{i:02d}-{digest[:16]}.jpg"
        public_url = "https://media.chicagoshining.com/" + key
        r2.put_object(key, data, "image/jpeg")
        _verify_public(public_url, digest)
        name = f"LA_Echo_Park_10738_{i:02d}_{LABELS[i-1]}_4x5_AIgenerated.jpg"
        uploaded = drive.upload_file(DRIVE_FOLDER, name, data, "image/jpeg")
        drive_id = str(uploaded.get("id") or "")
        if len(drive_id) < 20:
            raise RuntimeError(f"drive_upload_{i}_did_not_return_file_id")
        saved, mime = drive.download_file(drive_id)
        if mime != "image/jpeg" or hashlib.sha256(saved).hexdigest() != digest:
            raise RuntimeError(f"drive_upload_{i}_readback_mismatch")
        receipt = {
            "output_number": NUMBER, "index": i, "label": LABELS[i - 1],
            "name": name, "drive_id": drive_id, "r2_url": public_url,
            "sha256": digest, "bytes": len(data), "dimensions": "1080x1350",
            "generated": True, "brand_mark": "LA SHINING textual overlay",
        }
        receipts.append(receipt)
        print("fb10738_staged_asset=" + json.dumps(receipt, separators=(",", ":")), flush=True)

    if len(receipts) != 4:
        raise RuntimeError("four_assets_not_fully_staged")
    print("fb10738_stage_media=PASS_4_OF_4_NO_DB_OR_META_WRITES", flush=True)


if __name__ == "__main__":
    main()
