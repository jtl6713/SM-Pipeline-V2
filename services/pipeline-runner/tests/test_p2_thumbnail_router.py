from __future__ import annotations

import base64
import importlib.util
import sys
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_thumbnail_client(monkeypatch_modules: dict[str, types.ModuleType]):
    """Load thumbnail_client with stubs, then restore sys.modules so later tests keep real PIL."""
    previous = {name: sys.modules.get(name) for name in monkeypatch_modules}
    try:
        for name, module in monkeypatch_modules.items():
            sys.modules[name] = module
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        # Drop a previously imported real/fake module so we always reload under stubs.
        sys.modules.pop("p2_thumbnail_client_under_test", None)
        path = ROOT / "p2" / "thumbnail_client.py"
        spec = importlib.util.spec_from_file_location("p2_thumbnail_client_under_test", path)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module
    finally:
        for name, prior in previous.items():
            if prior is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = prior
        sys.modules.pop("p2_thumbnail_client_under_test", None)


def test_generate_thumbnail_png_uses_image_router():
    calls = []

    class FakeResponse:
        def __init__(self):
            self.ok = True
            self.status_code = 200
            self.text = ""

        def json(self):
            return {"data": [{"b64_json": base64.b64encode(b"raw-bytes").decode("ascii")}]}

    ai_image_router = types.ModuleType("ai_image_router")

    def post_image_generation(settings, body, *, timeout=300, preferred_account=None, stage=None):
        calls.append({"model": body.get("model"), "size": body.get("size"), "timeout": timeout})
        return FakeResponse()

    ai_image_router.post_image_generation = post_image_generation

    config = types.ModuleType("config")
    config.load_settings = lambda: {"openai_account": "PRIMARY"}

    requests_mod = types.ModuleType("requests")

    # Do not stub PIL here — fit_png_to_ratio is swapped after load, and leaving a fake
    # PIL.Image in sys.modules broke hermetic test_public_cover (Image.new missing).
    module = _load_thumbnail_client({
        "ai_image_router": ai_image_router,
        "config": config,
        "requests": requests_mod,
    })
    module.fit_png_to_ratio = lambda raw, aspect_ratio="9:16": b"fitted-png"

    out = module.generate_thumbnail_png("A rainy Chicago street at dusk", aspect_ratio="9:16")
    assert out == b"fitted-png"
    assert len(calls) == 1
    assert calls[0]["model"] == "gpt-image-1.5"
    assert calls[0]["size"] == "1024x1536"
