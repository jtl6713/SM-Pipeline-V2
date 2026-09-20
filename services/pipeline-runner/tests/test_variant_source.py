import io

from PIL import Image

from integrations.variant_service import (
    looks_like_heic_bytes,
    pillow_image_decodable,
    pillow_image_format,
    prepare_variant_source,
    rasterize_still_bytes,
)


def _jpeg(width: int, height: int, quality: int = 95) -> bytes:
    image = Image.new("RGB", (width, height), (12, 40, 80))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=quality)
    return out.getvalue()


def _heic_header() -> bytes:
    return b"\x00\x00\x00\x18ftypheic" + (b"\x00" * 64)


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


def test_looks_like_heic_bytes_from_ftyp():
    assert looks_like_heic_bytes(_heic_header()) is True
    assert looks_like_heic_bytes(_jpeg(32, 32)) is False


def test_heic_bytes_are_rasterized_before_variant_service(monkeypatch):
    jpeg = _jpeg(64, 80)
    monkeypatch.setattr(
        "integrations.variant_service.ffmpeg_heic_still",
        lambda *_args, **_kwargs: jpeg,
    )
    raw = _heic_header()
    prepared = prepare_variant_source(raw, max_bytes=1_000_000, ext="heic")
    assert prepared == jpeg
    assert prepared is not raw


def test_rasterize_heic_does_not_prefer_tiny_drive_thumbnail(monkeypatch):
    jpeg = _jpeg(320, 480)
    monkeypatch.setattr(
        "integrations.variant_service.ffmpeg_heic_still",
        lambda *_args, **_kwargs: jpeg,
    )
    monkeypatch.setattr(
        "integrations.variant_service._drive_jpeg_thumbnail",
        lambda *_args, **_kwargs: _jpeg(16, 20),
    )
    out = rasterize_still_bytes(_heic_header(), drive=object(), drive_id="drive1", ext="heic")
    assert out == jpeg


def test_truncated_jpeg_uses_complete_drive_thumbnail(monkeypatch):
    truncated = _jpeg(640, 960)[:-7]
    thumbnail = _jpeg(320, 480)
    assert pillow_image_format(truncated) == "JPEG"
    assert pillow_image_decodable(truncated) is False
    monkeypatch.setattr(
        "integrations.variant_service._drive_jpeg_thumbnail",
        lambda *_args, **_kwargs: thumbnail,
    )

    out = rasterize_still_bytes(
        truncated,
        drive=object(),
        drive_id="drive-truncated",
        ext="jpg",
    )

    assert out == thumbnail
