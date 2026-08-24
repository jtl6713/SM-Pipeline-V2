from io import BytesIO

from PIL import Image

from lettering.compositor import is_ai_cover_clip, letter_jpeg_bytes, overlay_text_for_clip
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


def test_ai_cover_clips_are_skipped():
    assert is_ai_cover_clip({"id": "studio-ai-cover", "source": "studio_ai_grid_cover"})
    assert not is_ai_cover_clip({"id": "clip-2", "source": "studio_platform_variant"})


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
