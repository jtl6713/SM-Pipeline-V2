"""Version gate for the controlled local YouTube/pipeline deployment.

The deployed runner's public /health version is calculated from source and may
also reflect a *newer* explicit SERVICE_VERSION environment pin. Requiring an
old incident-specific literal rejects otherwise successful current deployments.
"""
from pathlib import Path
import re


def expected_runner_version(source_path=None):
    source = Path(source_path) if source_path else (
        Path(__file__).resolve().parents[2] / "services" / "pipeline-runner" / "config.py"
    )
    contents = source.read_text(encoding="utf-8")
    match = re.search(r'^PIPELINE_RUNNER_CODE_VERSION\s*=\s*["\x27]([^"\x27]+)["\x27]', contents, re.M)
    if not match or not re.fullmatch(r"\d{4}-\d{2}-\d{2}-.+", match.group(1)):
        raise ValueError("Runner source version unavailable; do not deploy")
    return match.group(1)


def verified_runner_public_version(log, expected):
    values = re.findall(r"PASS public health version=([^\s]+)", str(log))
    if len(values) != 1:
        return False
    observed = values[0]
    # config._resolve_service_version explicitly supports newer-dated pins.
    if observed == expected:
        return True
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}-.+", observed):
        return False
    return observed[:10] > expected[:10]
