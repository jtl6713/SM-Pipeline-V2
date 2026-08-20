from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "apps/studio-web/assets/app-item4-0619.js"
HTML = ROOT / "apps/studio-web/index.html"
DEPLOY = ROOT / "deploy/cloudflare-pages-production.txt"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def patch_js(text: str) -> str:
    old = '''  function collectEzManualCaptions() {\n    return Array.from(document.querySelectorAll("[data-ez-asset-caption]"))\n      .filter((input) => !input.hidden && ezCaptionModeFor(input.dataset.ezAssetCaption) === "manual")\n      .map((input) => input.value);\n  }\n'''
    new = '''  function collectEzManualCaptions() {\n    const byAsset = new Map();\n    document.querySelectorAll("[data-ez-asset-caption]").forEach((input) => {\n      const id = String(input.dataset.ezAssetCaption || "");\n      if (!id || input.hidden || ezCaptionModeFor(id) !== "manual") return;\n      const current = String(byAsset.get(id) || "");\n      const next = String(input.value || "");\n      if (!byAsset.has(id) || (!current.trim() && next.trim())) byAsset.set(id, next);\n    });\n\n    const assets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];\n    const ordered = assets\n      .map((asset) => String(asset?.id || ""))\n      .filter((id) => byAsset.has(id))\n      .map((id) => byAsset.get(id));\n    return ordered.length ? ordered : Array.from(byAsset.values());\n  }\n'''
    text = replace_once(text, old, new, "caption collector")
    text = replace_once(
        text,
        '  const BUILD_ID = "item4-0.6.70-idea-count-entry";',
        '  const BUILD_ID = "item4-0.6.71-caption-dedupe";',
        "UI build id",
    )
    return text


def patch_html(text: str) -> str:
    text = text.replace('0.6.70-idea-count-entry', '0.6.71-caption-dedupe')
    text = text.replace('UI build 0.6.70', 'UI build 0.6.71')
    return text


js = patch_js(JS.read_text(encoding="utf-8"))
html = patch_html(HTML.read_text(encoding="utf-8"))

JS.write_text(js, encoding="utf-8")
HTML.write_text(html, encoding="utf-8")

marker = DEPLOY.read_text(encoding="utf-8")
line = "Caption dedupe Pages deploy: 2026-08-20 — Manual per-photo caption collection deduplicates repeated DOM controls by asset ID so one photo saves one caption. UI 0.6.71-caption-dedupe."
if line not in marker:
    DEPLOY.write_text(marker.rstrip() + "\n\n" + line + "\n", encoding="utf-8")

print("patched Studio manual caption dedupe")
