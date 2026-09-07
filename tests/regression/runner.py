#!/usr/bin/env python3
"""Local regression CLI: hermetic packs, local-service health, one live id at a time."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from catalog import get_live, live_ids, load_catalog, next_live_id, remember_live_id


def _run(command: list[str], *, cwd: Path, env: dict | None = None) -> None:
    print("+", " ".join(command), flush=True)
    completed = subprocess.run(command, cwd=str(cwd), env=env)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def collect_node_tests() -> list[str]:
    files = []
    for folder in (
        ROOT / "apps",
        ROOT / "tests" / "regression",
    ):
        if not folder.exists():
            continue
        files.extend(str(path) for path in folder.rglob("*.test.mjs"))
    files.sort()
    if not files:
        raise SystemExit("no *.test.mjs files found")
    return files


VENV = HERE / ".venv"


def _venv_python() -> Path:
    if os.name == "nt":
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def _service_python() -> str:
    if os.environ.get("GITHUB_ACTIONS"):
        return sys.executable
    py = _venv_python()
    if py.exists():
        return str(py)
    print("creating tests/regression/.venv for pytest", flush=True)
    subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
    pip = [str(py), "-m", "pip", "install", "-q", "pytest"]
    subprocess.run(pip + ["-r", str(ROOT / "services" / "pipeline-runner" / "requirements.txt")], check=True)
    timing_req = ROOT / "services" / "timing-engine" / "requirements.txt"
    installed = subprocess.run(pip + ["-r", str(timing_req)])
    if installed.returncode != 0:
        print("timing-engine extras not installed; timing pytest will be skipped", flush=True)
    return str(py)


def hermetic() -> None:
    node = os.environ.get("NODE", "node")
    python = _service_python()
    _run([node, "--test", *collect_node_tests()], cwd=ROOT)
    _run([python, "-m", "pytest", "tests", "-q"], cwd=ROOT / "services" / "pipeline-runner")
    timing_probe = subprocess.run([python, "-c", "import librosa, fastapi"], capture_output=True)
    if timing_probe.returncode == 0:
        _run([python, "-m", "pytest", "tests", "-q"], cwd=ROOT / "services" / "timing-engine")
    else:
        print("skip timing-engine pytest (librosa/fastapi not installed)", flush=True)
    py_files = [
        ROOT / "services" / "frame-extractor" / "app.py",
        ROOT / "services" / "video-compressor" / "app.py",
        ROOT / "services" / "timing-engine" / "app.py",
        ROOT / "services" / "pipeline-runner" / "app.py",
    ]
    _run([python, "-m", "py_compile", *[str(path) for path in py_files]], cwd=ROOT)
    js_files = [
        ROOT / "services" / "watermark" / "server.js",
        ROOT / "services" / "voiceover-normalizer" / "voiceover-normalizer.js",
        ROOT / "services" / "youtube-uploader" / "youtube-upload-service.js",
        ROOT / "services" / "remotion-renderer" / "render-server.js",
    ]
    _run([node, "--check", *[str(path) for path in js_files]], cwd=ROOT)
    print("hermetic packs passed", flush=True)


def cmd_list() -> None:
    catalog = load_catalog()
    print("Live ids (one at a time):")
    for live_id in live_ids(catalog):
        spec = get_live(live_id, catalog)
        print(f"  {live_id:24}  {spec.get('kind')}  {spec.get('title') or spec.get('service')}")


def cmd_health(*, public: bool) -> None:
    from local_services import health_all

    result = health_all(public=public)
    print(json.dumps({"ok": True, "public": public, "count": len(result["services"])}, indent=2))
    for name, payload in result["services"].items():
        print(f"  {name}: ok service={payload.get('service') or payload.get('ok')}")


def cmd_run(live_id: str, *, public: bool, remember: bool) -> None:
    spec = get_live(live_id)
    kind = spec.get("kind")
    if kind == "service-smoke":
        from local_services import run_smoke

        result = run_smoke(live_id, spec, public=public)
        print(json.dumps({k: v for k, v in result.items() if k != "health"}, indent=2, default=str)[:4000])
    elif kind == "studio-scenario":
        from live_runner import run_studio_scenario

        result = run_studio_scenario(live_id, spec)
        print(json.dumps({k: v for k, v in result.items() if k != "steps"}, indent=2, default=str)[:4000])
    else:
        raise SystemExit(f"unknown kind {kind}")
    if remember:
        remember_live_id(live_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ChicagoShining regression runner")
    parser.add_argument("--public", action="store_true", help="Hit Cloudflare public routes instead of localhost")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    sub.add_parser("hermetic")
    sub.add_parser("health")
    sub.add_parser("pick")
    run = sub.add_parser("run")
    run.add_argument("id")
    sub.add_parser("next")
    args = parser.parse_args(argv)

    if args.command == "list":
        cmd_list()
        return 0
    if args.command == "hermetic":
        hermetic()
        return 0
    if args.command == "health":
        cmd_health(public=args.public)
        return 0
    if args.command == "pick":
        print(next_live_id(), flush=True)
        return 0
    if args.command == "run":
        cmd_run(args.id, public=args.public, remember=True)
        return 0
    if args.command == "next":
        live_id = next_live_id()
        print(f"next={live_id}", flush=True)
        cmd_run(live_id, public=args.public, remember=True)
        return 0
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"REGRESSION_FAILED {exc}", file=sys.stderr)
        raise
