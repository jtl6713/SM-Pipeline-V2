from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_runtime_ai_stages_do_not_hardcode_primary_openai_endpoints():
    routed = [
        ROOT / "p4" / "openai_plan.py",
        ROOT / "r2" / "openai_selection.py",
        ROOT / "carousel" / "image_gen.py",
    ]
    for path in routed:
        source = path.read_text(encoding="utf-8")
        assert "https://api.openai.com" not in source, f"{path.name} bypasses provider routing"


def test_text_bypass_stages_use_runtime_router():
    assert "from ai_api_router import post_responses" in (ROOT / "p4" / "openai_plan.py").read_text(encoding="utf-8")
    assert "from ai_api_router import post_responses" in (ROOT / "r2" / "openai_selection.py").read_text(encoding="utf-8")


def test_image_generation_uses_runtime_router():
    source = (ROOT / "carousel" / "image_gen.py").read_text(encoding="utf-8")
    assert "from ai_image_router import post_image_generation" in source
    assert "post_image_generation(" in source
