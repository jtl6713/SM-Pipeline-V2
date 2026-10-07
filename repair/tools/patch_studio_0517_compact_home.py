from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps/studio-web/assets/app-item4-0625.js"
INDEX = ROOT / "apps/studio-web/index.html"
OLD_DENSITY = ROOT / "apps/studio-web/assets/home-density-0516.css"
NEW_DENSITY = ROOT / "apps/studio-web/assets/home-density-0517.css"
DEPLOY_WORKFLOW = ROOT / ".github/workflows/deploy-cloudflare-pages-production.yml"
DEPLOY_MARKER = ROOT / "deploy/cloudflare-pages-production.txt"

OLD_BUILD = "0.6.515-always-hamburger-nav"
NEW_BUILD = "0.6.517-compact-home-launcher"


def replace_exact(path: Path, old: str, new: str, expected: int = 1):
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {count}: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


# Make the application bundle itself authoritative for the new Pages build.
replace_exact(
    APP,
    'const BUILD_ID = "item4-0.6.515-always-hamburger-nav";',
    'const BUILD_ID = "item4-0.6.517-compact-home-launcher";',
)

# Keep every top-level Studio cache key coherent with the actual app BUILD_ID.
text = INDEX.read_text(encoding="utf-8")
replacements = {
    "/assets/styles-phase7-0621.css?v=0.6.515-always-hamburger-nav":
        "/assets/styles-phase7-0621.css?v=0.6.517-compact-home-launcher",
    "/assets/home-density-0516.css?v=0.6.516-home-density":
        "/assets/home-density-0517.css?v=0.6.517-compact-home-launcher",
    "UI build 0.6.516": "UI build 0.6.517",
    "/assets/ez-plan.js?v=0.6.515-always-hamburger-nav":
        "/assets/ez-plan.js?v=0.6.517-compact-home-launcher",
    "/assets/timed-script.js?v=0.6.515-always-hamburger-nav":
        "/assets/timed-script.js?v=0.6.517-compact-home-launcher",
    "/assets/app-item4-0625.js?v=0.6.515-always-hamburger-nav":
        "/assets/app-item4-0625.js?v=0.6.517-compact-home-launcher",
}
for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{INDEX}: expected one occurrence, found {count}: {old!r}")
    text = text.replace(old, new)
INDEX.write_text(text, encoding="utf-8")

# Use a new physical CSS filename, not merely a query string, so the compact layout
# cannot be hidden behind a stale Cloudflare/browser cache entry.
density = OLD_DENSITY.read_text(encoding="utf-8")
density = density.replace("HOME_DENSITY_0_6_516", "HOME_DENSITY_0_6_517")
NEW_DENSITY.write_text(density, encoding="utf-8")

# Update version-contract tests without changing the older hamburger feature marker.
for base in (ROOT / "apps/studio-web", ROOT / "apps/studio-api"):
    for path in base.glob("*.test.mjs"):
        t = path.read_text(encoding="utf-8")
        original = t
        t = t.replace(r'item4-0\.6\.515-always-hamburger-nav', r'item4-0\.6\.517-compact-home-launcher')
        t = t.replace('item4-0.6.515-always-hamburger-nav', 'item4-0.6.517-compact-home-launcher')
        t = t.replace(r'app-item4-0625\.js\?v=0\.6\.515-always-hamburger-nav', r'app-item4-0625\.js\?v=0\.6\.517-compact-home-launcher')
        t = t.replace(r'styles-phase7-0621\.css\?v=0\.6\.515-always-hamburger-nav', r'styles-phase7-0621\.css\?v=0\.6\.517-compact-home-launcher')
        t = t.replace(r'UI build 0\.6\.515', r'UI build 0\.6\.517')
        t = t.replace(r'UI build 0\.6\.516', r'UI build 0\.6\.517')
        t = t.replace('UI build 0.6.515', 'UI build 0.6.517')
        t = t.replace('UI build 0.6.516', 'UI build 0.6.517')
        t = t.replace('assert.equal(uiBuild, "0.6.516");', 'assert.equal(uiBuild, "0.6.517");')
        t = t.replace('home-density-0516\\.css\\?v=0\\.6\\.516-home-density',
                      'home-density-0517\\.css\\?v=0\\.6\\.517-compact-home-launcher')
        t = t.replace('home-density-0516.css?v=0.6.516-home-density',
                      'home-density-0517.css?v=0.6.517-compact-home-launcher')
        if t != original:
            path.write_text(t, encoding="utf-8")

marker = DEPLOY_MARKER.read_text(encoding="utf-8")
line = (
    "Deploy UI 0.6.517-compact-home-launcher. Full app BUILD_ID + cache-key bump, "
    "new physical home-density-0517.css asset, and custom-domain verification for "
    "the compact Start a post launcher.\n"
)
if line not in marker:
    if marker and not marker.endswith("\n"):
        marker += "\n"
    marker += line
    DEPLOY_MARKER.write_text(marker, encoding="utf-8")

print("studio_0517_compact_home_patch=PASS")
