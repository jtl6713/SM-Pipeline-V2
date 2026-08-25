import json
from io import BytesIO

from PIL import Image

from branding.watermark import already_branded_url, apply_watermark_bytes
from lettering.compositor import (
    already_lettered_url,
    is_ai_cover_clip,
    is_leftover_overlay_text,
    letter_jpeg_bytes,
    overlay_text_for_clip,
)
from lettering.processor import branding_jobs_for_clips
from lettering.formulas import lettering_exact_output_formula, lettering_production_formula


def test_lettering_production_formula_targets_native_photo_route():
    formula = lettering_production_formula()
    assert '{Render_Status}="Native Photo Route"' in formula
    assert '{Output_Status}="Ready for Review"' in formula
    assert "{Test_Run_ID}=BLANK()" in formula


def test_lettering_exact_formula_pins_record():
    formula = lettering_exact_output_formula("recLETTER1", "")
    assert 'RECORD_ID()="recLETTER1"' in formula
    assert '{Render_Status}="Native Photo Route"' in formula
    assert formula.count("(") == formula.count(")")


def test_overlay_text_falls_back_to_title_when_caption_is_long():
    clip = {"overlay": {"text": "x" * 200}, "caption": ""}
    assert overlay_text_for_clip(clip, "Millennium Park") == "Millennium Park"


def test_leftover_rainy_overlay_falls_back_to_title():
    clip = {"overlay": {"text": "Rainy downtown Chicago"}, "caption": "Rainy downtown Chicago"}
    assert is_leftover_overlay_text("Rainy downtown Chicago")
    assert overlay_text_for_clip(clip, "Navy Pier — still-as-body native test") == (
        "Navy Pier — still-as-body native test"
    )


def test_ai_cover_clips_are_skipped():
    assert is_ai_cover_clip({"id": "studio-ai-cover", "source": "studio_ai_grid_cover"})
    assert not is_ai_cover_clip({"id": "clip-2", "source": "studio_platform_variant"})


def test_leftover_lettered_clip_uses_raw_crop_source():
    from lettering.processor import _clip_has_leftover_overlay, _unlettered_source_url

    clip = {
        "url": "https://media.chicagoshining.com/studio/previews/lettered/recX/0.jpg",
        "overlay": {"text": "Rainy downtown Chicago"},
        "caption": "Rainy downtown Chicago",
    }
    raw = "https://media.chicagoshining.com/studio/previews/item4/recPR/ITEM4-VARIANT-fill-crop-v2.jpg"
    output = {
        "fields": {
            "Selected_Assets_JSON": json.dumps(
                {"render_prep": {"render_clip_list_json": json.dumps([{"url": raw}])}}
            )
        }
    }
    assert _clip_has_leftover_overlay(clip)
    assert _unlettered_source_url(clip, output, 0) == raw


def test_branded_urls_include_watermarked_path():
    assert already_lettered_url("https://media.chicagoshining.com/studio/previews/watermarked/recX/0.jpg")
    assert already_branded_url("https://media.chicagoshining.com/lettered/a.jpg")
    assert not already_branded_url("https://media.chicagoshining.com/catalog/bean.jpg")


def test_watermark_only_jobs_include_stills_without_overlay_text():
    raw = "https://media.chicagoshining.com/studio/previews/item4/recPR/crop.jpg"
    clips = [
        {"id": "clip-1", "url": raw, "source": "studio_platform_variant"},
        {"id": "studio-ai-cover", "url": "https://media.chicagoshining.com/ai-cover.jpg", "source": "studio_ai_grid_cover"},
    ]
    output = {"fields": {}}
    jobs = branding_jobs_for_clips(clips, output, "")
    assert [item[0] for item in jobs] == [0, 1]
    assert jobs[0][2] == ""
    assert jobs[0][3] == raw


def test_already_watermarked_stills_are_skipped():
    url = "https://media.chicagoshining.com/studio/previews/watermarked/recX/0.jpg"
    jobs = branding_jobs_for_clips([{"id": "clip-1", "url": url}], {"fields": {}}, "Title")
    assert jobs == []


def _tiny_png(color) -> bytes:
    image = Image.new("RGBA", (200, 200), color)
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_apply_watermark_bytes_stamps_top_left():
    photo = _tiny_png((20, 80, 140, 255))
    mark = _tiny_png((255, 255, 255, 255))
    branded = apply_watermark_bytes(photo, mark, scale=0.2, margin=4, output_format="png")
    out = Image.open(BytesIO(branded)).convert("RGB")
    corner = out.getpixel((10, 10))
    center = out.getpixel((160, 160))
    assert corner[0] > 180
    assert center[2] > 100


def test_letter_jpeg_bytes_paints_lower_third():
    image = Image.new("RGB", (1080, 1350), (30, 80, 140))
    src = BytesIO()
    image.save(src, format="JPEG", quality=90)
    lettered = letter_jpeg_bytes(src.getvalue(), "Chicago at night")
    out = Image.open(BytesIO(lettered)).convert("RGB")
    bottom = out.getpixel((540, 1280))
    top = out.getpixel((540, 80))
    assert bottom != top
    assert bottom[0] < 80
