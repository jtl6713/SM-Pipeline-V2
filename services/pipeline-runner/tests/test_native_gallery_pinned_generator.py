import base64
import unittest
from unittest.mock import patch

from carousel.image_gen import generate_carousel_png


class PinnedGeneratorTests(unittest.TestCase):
    def test_exact_approved_provider_and_model_settings_are_forwarded(self):
        class Response:
            ok = True
            def json(self):
                return {"data": [{"b64_json": base64.b64encode(b"png").decode()}]}
        settings = {"openai_secondary_image_deployment": "approved-azure-model"}
        with patch("carousel.image_gen.post_image_generation",
                   return_value=Response()) as called:
            result = generate_carousel_png(
                "Make a clean replacement skyline image", ratio="4:5",
                preferred_account="SECONDARY", settings_override=settings)
        self.assertEqual(result, b"png")
        args, kwargs = called.call_args
        self.assertIs(args[0], settings)
        self.assertEqual(kwargs["preferred_account"], "SECONDARY")
        self.assertEqual(kwargs["stage"], "carousel")

    def test_legacy_call_does_not_force_provider_override(self):
        class Response:
            ok = True
            def json(self):
                return {"data": [{"b64_json": base64.b64encode(b"old").decode()}]}
        with patch("carousel.image_gen.load_settings", return_value={}), patch(
            "carousel.image_gen.post_image_generation",
            return_value=Response()) as called:
            self.assertEqual(generate_carousel_png("City sunrise", ratio="4:5"),
                             b"old")
        self.assertNotIn("preferred_account", called.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
