"""Read-only public CDN probe for TikTok photo draft delivery.

Tests the exact R2 public URLs held in the six failed 2026-11-08
Platform Outputs. No TikTok API calls, credentials or mutations.
"""
import concurrent.futures
import urllib.error
import urllib.request

OUTPUTS = (
    (9921, "rec3FO174xdgwM4mu", 8),
    (9897, "recH1C9xp9LwHHsAR", 4),
    (9907, "recRg41NO885N7Rxz", 4),
    (9869, "recWuGqtBA1cZ7SuV", 4),
    (9884, "recc6jsIUkCyuxoGc", 4),
    (9910, "recxChzJygYjPs4fl", 8),
)
HOST = "https://media.chicagoshining.com"

def public_urls():
    for output_id, record_id, count in OUTPUTS:
        yield output_id, "cover", f"{HOST}/publish/platform-output-{output_id}/cover.jpg"
        for index in range(count):
            yield output_id, f"slide-{index}", f"{HOST}/studio/previews/lettered/{record_id}/{index}.jpg"

def check(item):
    """TikTok downloads full files, not HTTP byte ranges.

    Validate redirect-free access, complete JPEG bytes and content sizes,
    with a 20MB bound per photo matching the Content Posting API limit.
    """
    import io
    from PIL import Image

    output_id, label, url = item
    headers = {
        "User-Agent": "Mozilla/5.0 TikTokPhotoDeliveryPreflight/1.0",
        "Accept": "image/jpeg,image/png,image/webp,*/*",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=45) as response:
            status = response.status
            media_type = response.headers.get("Content-Type", "").split(";")[0].lower()
            challenge = response.headers.get("cf-mitigated", "")
            final_url = response.geturl()
            data = response.read(20 * 1024 * 1024 + 1)
            with Image.open(io.BytesIO(data)) as image:
                kind = image.format
                width, height = image.size
                image.verify()  # decoder validates full JPEG content
            ok = (
                status == 200
                and final_url == url
                and not challenge
                and 0 < len(data) <= 20 * 1024 * 1024
                and kind in {"JPEG", "WEBP"}
                and media_type in {"image/jpeg", "image/webp"}
                and width > 0
                and height > 0
                and max(width, height) <= 1920
                and min(width, height) <= 1080
            )
            return ok, (
                f"output={output_id} asset={label} http={status} type={media_type or 'missing'} "
                f"bytes={len(data)} format={kind} width={width} height={height} "
                f"redirect={final_url != url} cf_mitigated={challenge or 'none'} url={url}"
            )
    except Exception as exc:
        return False, f"output={output_id} asset={label} ERROR={type(exc).__name__}: {exc} url={url}"


def main():
    targets = list(public_urls())
    print(f"Checking {len(targets)} public photo URLs across {len(OUTPUTS)} failed drafts")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, targets))
    for ok, line in results:
        print(("PASS " if ok else "FAIL ") + line, flush=True)
    failures = [line for ok, line in results if not ok]
    print(f"Results: {len(results) - len(failures)}/{len(results)} media URLs passed")
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
