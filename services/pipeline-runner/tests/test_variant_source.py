import io

from PIL import Image

from integrations.variant_service import prepare_variant_source


def _jpeg(width: int, height: int, quality: int = 95) -> bytes:
    image = Image.new("RGB", (width, height), (12, 40, 80))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=quality)
    return out.getvalue()


def test_prepare_variant_source_passes_small_files_through():
    raw = _jpeg(200, 200)
    assert prepare_variant_source(raw, max_bytes=1_000_000) is raw


def test_prepare_variant_source_downscales_huge_jpegs():
    raw = _jpeg(4000, 3000)
    assert len(raw) > 80_000
    prepared = prepare_variant_source(raw, max_bytes=80_000, max_edge=800)
    assert len(prepared) < len(raw)
    image = Image.open(io.BytesIO(prepared))
    assert max(image.size) <= 800
