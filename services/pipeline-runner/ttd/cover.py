"""Select the designed photo-carousel grid cover for TikTok PHOTO drafts.

The TikTok API accepts a cover only when it is one of photo_images.
Preserve the approved Carousel Slide order and Image_Count.
"""
from __future__ import annotations

from urllib.parse import urlparse

from ap0.public_cover import ensure_public_cover_url
from ap0.public_mp4 import is_public_publish_url


class TikTokPhotoCoverError(ValueError):
    """Prevent a coverless carousel from entering a TikTok draft."""


def prepare_photo_cover_manifest(client, record: dict, images: list[str], *, max_photos: int = 35) -> tuple[list[str], int]:
    """Return photo images and cover index without duplicating any existing cover."""
    ordered = list(images)
    if len(ordered) <= 1:
        return ordered, 0
    limit = min(35, max(1, int(max_photos)))
    if not all(is_public_publish_url(url) for url in ordered):
        raise TikTokPhotoCoverError("TikTok carousel contains a non-public slide URL")
    try:
        cover = ensure_public_cover_url(client, record, prefer_jpeg=True)
    except Exception as exc:
        raise TikTokPhotoCoverError(f"TikTok grid cover staging failed: {type(exc).__name__}: {exc}") from exc
    if not cover:
        raise TikTokPhotoCoverError("TikTok photo carousel requires a designed Thumbnail_URL or Thumbnail_Google_Drive_File_ID")
    ext = urlparse(cover).path.lower()
    if not is_public_publish_url(cover) or not ext.endswith((".jpg", ".jpeg", ".webp")):
        raise TikTokPhotoCoverError("TikTok carousel cover must be a public JPG or WebP on the verified media domain")
    if cover in ordered:
        return ordered, ordered.index(cover)
    if len(ordered) >= limit:
        raise TikTokPhotoCoverError(f"TikTok carousel already has {len(ordered)} photos; no room for cover under limit {limit}")
    return [cover, *ordered], 0
