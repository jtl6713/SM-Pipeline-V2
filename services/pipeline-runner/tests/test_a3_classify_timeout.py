"""A3 must fail closed well under the Asset Manager 60s Classifying SLA."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class A3ClassifyTimeoutTests(unittest.TestCase):
    def test_openai_classify_uses_sub_minute_timeout(self):
        source = (ROOT / "a3" / "openai_classify.py").read_text(encoding="utf-8")
        self.assertIn("timeout=45", source)
        self.assertNotIn("timeout=300", source)

    def test_processor_clears_processing_on_skip_or_miss(self):
        source = (ROOT / "a3" / "processor.py").read_text(encoding="utf-8")
        self.assertIn('Classification_Status": "Needs Classification"', source)
        self.assertIn("A3 skipped: Content_Profile is required", source)
        self.assertIn("A3 could not load asset:", source)


if __name__ == "__main__":
    unittest.main()
