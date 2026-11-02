"""Conservative pixel evidence of the *actual* official watermark in V1.

Owning the watermark PNG alone is not proof that an original image includes
the mark. This compares opaque logo pixels at the deterministic C6 top-left
position/scale to real decoded source pixels and requires visible contrast.
False negatives are permitted (keep generation blocked); false positives
should be minimized. Does not authorize generation/publishing by itself.
"""
from __future__ import annotations

from io import BytesIO
from PIL import Image, UnidentifiedImageError

SCALE = 0.12
MARGIN = 30


def visible_source_watermark(original: bytes, watermark: bytes) -> bool:
    """Require exact-looking official logo placement, not metadata/provenance."""
    if not isinstance(original, bytes) or not isinstance(watermark, bytes):
        return False
    try:
        with Image.open(BytesIO(original)) as src, Image.open(BytesIO(watermark)) as logo:
            src.load()
            logo.load()
            if logo.format != "PNG" or not 128 <= src.width <= 12000 or (
                not 128 <= src.height <= 12000
            ) or logo.width < 8 or logo.height < 2:
                return False
            candidate = src.convert("RGB")
            overlay = logo.convert("RGBA")
            target_width = max(1, round(src.width * SCALE))
            target_height = max(1, round(target_width * overlay.height / overlay.width))
            if target_width + MARGIN > src.width or target_height + MARGIN > src.height:
                return False
            overlay = overlay.resize((target_width, target_height),
                                     Image.Resampling.LANCZOS)
            source_pixels = candidate.load()
            logo_pixels = overlay.load()
            hits = 0
            samples = 0
            # Only opaque mark cores have known output RGB regardless of what
            # was originally under a normal alpha-composited logo.
            # Subsampling bounds memory/time even on large originals.
            stride = max(1, round(target_width / 160))
            for y in range(0, target_height, stride):
                for x in range(0, target_width, stride):
                    r, g, b, alpha = logo_pixels[x, y]
                    if alpha < 248:
                        continue
                    samples += 1
                    actual = source_pixels[MARGIN + x, MARGIN + y]
                    if max(abs(actual[i] - color)
                           for i, color in enumerate((r, g, b))) <= 21:
                        hits += 1
            if samples < 80 or hits / samples < 0.94:
                return False
            # A plain white/black background can match a monochrome mark
            # without the mark actually being visible. Require real visual
            # contrast across at least a few mark boundaries.
            edges = contrasting_edges = 0
            for y in range(1, target_height - 1, stride):
                for x in range(1, target_width - 1, stride):
                    r, g, b, alpha = logo_pixels[x, y]
                    if alpha < 248:
                        continue
                    for nx, ny in ((x - 3, y), (x + 3, y),
                                   (x, y - 3), (x, y + 3)):
                        if not (0 <= nx < target_width and 0 <= ny < target_height):
                            continue
                        if logo_pixels[nx, ny][3] > 8:
                            continue
                        edges += 1
                        outside = source_pixels[MARGIN + nx, MARGIN + ny]
                        if max(abs(outside[i] - color)
                               for i, color in enumerate((r, g, b))) >= 35:
                            contrasting_edges += 1
            return edges >= 8 and contrasting_edges >= max(8, round(edges * 0.15))
    except (OSError, ValueError, UnidentifiedImageError):
        return False
