"""No-network proof that a wide title Graphic is fit, not center-cropped.

No uploads, writes, renders, or production configuration are touched.
"""
import io
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw

from integrations.variant_service import VariantServiceClient, graphic_fit_canvas_bytes


def wide_graphic():
    original=Image.new("RGB",(900,300),(25,25,25))
    painter=ImageDraw.Draw(original)
    painter.rectangle((0,0,120,299),fill=(230,28,30))
    painter.rectangle((780,0,899,299),fill=(28,170,45))
    result=io.BytesIO()
    original.save(result,"JPEG",quality=96)
    return result.getvalue()


class GraphicFitTests(unittest.TestCase):
    def test_title_edges_survive_full_fit_without_network_or_master_write(self):
        source=wide_graphic()
        client=object.__new__(VariantServiceClient)
        with patch("integrations.variant_service.requests.post",side_effect=AssertionError("network forbidden")), \
             patch.object(client,"_base_url",side_effect=AssertionError("external variant forbidden")):
            data=client.render(source,"9:16",gravity="graphic_fit",ext="jpg")
        self.assertEqual(source,wide_graphic())
        with Image.open(io.BytesIO(data)) as result:
            result.load()
            self.assertEqual(result.size,(1080,1920))
            self.assertEqual(result.format,"JPEG")
            left=result.getpixel((35,960))
            right=result.getpixel((1045,960))
            self.assertGreater(left[0],170)
            self.assertGreater(right[1],115)
            self.assertLess(left[1],100)
            self.assertLess(right[0],100)
            self.assertEqual(result.getpixel((540,80)),(11,27,52))

    def test_graphic_fit_blocks_nonvertical_and_invalid_image(self):
        client=object.__new__(VariantServiceClient)
        source=wide_graphic()
        for ratio in ("1:1","4:5","16:9"):
            with self.subTest(ratio=ratio):
                with self.assertRaisesRegex(RuntimeError,"restricted to vertical"):
                    client.render(source,ratio,gravity="graphic_fit")
        with self.assertRaises(RuntimeError):
            graphic_fit_canvas_bytes(b"not-an-image")

    def test_generic_center_variant_never_invokes_graphic_fit(self):
        client=object.__new__(VariantServiceClient)
        with patch("integrations.variant_service.graphic_fit_canvas_bytes",side_effect=AssertionError("wrong recipe")), \
             patch.object(client,"_base_url",return_value="https://variant.example"), \
             patch.object(client,"_token",return_value="test-token"), \
             patch("integrations.variant_service.requests.post") as sender:
            sender.return_value.ok=True
            sender.return_value.content=b"center-cropped-by-existing-service"
            result=client.render(wide_graphic(),"9:16",gravity="center")
        self.assertEqual(result,b"center-cropped-by-existing-service")
        sender.assert_called_once()


if __name__=="__main__":
    unittest.main()
