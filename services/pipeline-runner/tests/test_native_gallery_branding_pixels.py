import unittest
from io import BytesIO
from PIL import Image, ImageDraw

from rendering_review.gallery_branding_pixels import visible_source_watermark
from branding.watermark import watermark_photo_bytes


def png(image):
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def inputs():
    # Rich pixel texture makes a flattened overlay distinguishable from
    # a coincidentally matching flat white or black background.
    original = Image.effect_noise((900, 1125), 68).convert("RGB")
    logo = Image.new("RGBA", (190, 90), (0, 0, 0, 0))
    painter = ImageDraw.Draw(logo)
    painter.rectangle((24, 18, 165, 66), fill=(242, 25, 50, 255))
    painter.rectangle((70, 30, 124, 54), fill=(32, 210, 60, 255))
    return png(original), png(logo)


class SourceBrandingPixelsTests(unittest.TestCase):
    def test_real_flattened_logo_is_detected(self):
        before, mark = inputs()
        after = watermark_photo_bytes(before, mark, output_format="png")
        self.assertTrue(visible_source_watermark(after, mark))

    def test_unbranded_source_is_denied(self):
        before, mark = inputs()
        self.assertFalse(visible_source_watermark(before, mark))

    def test_foreign_logo_is_denied(self):
        before, mark = inputs()
        after = watermark_photo_bytes(before, mark, output_format="png")
        other = Image.new("RGBA", (190, 90), (0, 0, 0, 0))
        ImageDraw.Draw(other).rectangle((24, 18, 165, 66),
                                        fill=(20, 20, 250, 255))
        self.assertFalse(visible_source_watermark(after, png(other)))

    def test_invalid_bytes_and_flat_color_not_branding(self):
        before, mark = inputs()
        self.assertFalse(visible_source_watermark(before, b"not png"))
        uniform = png(Image.new("RGB", (900, 1125), (242, 25, 50)))
        self.assertFalse(visible_source_watermark(uniform, mark))


if __name__ == "__main__":
    unittest.main()
