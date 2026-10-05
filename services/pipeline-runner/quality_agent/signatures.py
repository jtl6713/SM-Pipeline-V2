from __future__ import annotations

from typing import Any


TIKTOK_DUPLICATE_SLIDES = "QA-TT-DUPLICATE-SLIDES"


def detect_tiktok_duplicate_slides(
    *,
    actual: int,
    expected: int | None,
    stamped_urls: list[str] | None = None,
) -> dict[str, Any] | None:
    """Recognize the Output 997 duplicate-carousel signature.

    Signature:
    - TikTok photo package expects N approved images.
    - Ready Carousel Slide rows linked to the output total exactly 2*N.
    - The stamped output package still contains exactly N authoritative images.

    The stamped manifest requirement makes automatic recovery conservative: a
    doubled database link set alone is not enough to guess which assets belong.
    """
    try:
        actual_n = int(actual)
        expected_n = int(expected) if expected is not None else 0
    except (TypeError, ValueError):
        return None

    urls = [str(url or "").strip() for url in (stamped_urls or []) if str(url or "").strip()]
    if expected_n <= 0 or actual_n != expected_n * 2 or len(urls) != expected_n:
        return None

    return {
        "id": TIKTOK_DUPLICATE_SLIDES,
        "platform": "TikTok",
        "stage": "TTD0_ASSETS",
        "actual_ready_slides": actual_n,
        "expected_slides": expected_n,
        "duplicate_factor": 2,
        "authoritative_manifest_count": len(urls),
        "auto_repair_safe": True,
    }
