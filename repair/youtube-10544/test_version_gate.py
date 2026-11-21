import tempfile
import unittest
from pathlib import Path
from version_gate import expected_runner_version, verified_runner_public_version


class ControlledDeployVersionGateTest(unittest.TestCase):
    def test_authoritative_source_version_present(self):
        version = expected_runner_version()
        self.assertRegex(version, r"^\d{4}-\d{2}-\d{2}-.+")
        self.assertTrue(verified_runner_public_version(
            "PASS public health version=" + version, version))

    def test_newer_runtime_env_version_supported_because_app_resolver_allows_it(self):
        self.assertTrue(verified_runner_public_version(
            "PASS public health version=2026-11-21-newer-env", "2026-11-20-current"))

    def test_stale_or_unrelated_version_rejected(self):
        current = "2026-11-20-current"
        for log in [
            "",
            "PASS public health version=2026-11-16-older",
            "PASS public health version=2026-11-20-other",
            "PASS public health version=garbage",
            "PASS public health version=2026-11-20-current\nPASS public health version=2026-11-20-current",
        ]:
            with self.subTest(log=log):
                self.assertFalse(verified_runner_public_version(log, current))

    def test_missing_version_in_config_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "config.py"
            source.write_text("SERVICE_VERSION = 'wrong'\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                expected_runner_version(source)


if __name__ == "__main__":
    unittest.main()
