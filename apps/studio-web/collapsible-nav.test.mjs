import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("UI 0.6.516 preserves hamburger off-canvas nav on every viewport", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.625-library-search-all-hits"/);
  assert.match(html, /UI build 0\.6\.625/);
  assert.match(html, /app-item4-1008\.js\?v=0.6.625-library-search-all-hits/);
  assert.match(html, /styles-phase7-0621\.css\?v=0.6.625-library-search-all-hits/);
  assert.match(html, /id="studioNavToggle"/);
  assert.match(html, /id="studioSidebar"/);
  assert.match(html, /id="studioNavBackdrop"/);
  assert.match(html, /aria-controls="studioSidebar"/);
  assert.match(app, /function setStudioNavCollapsed\(/);
  assert.match(app, /function initStudioNavCollapse\(/);
  assert.match(app, /ALWAYS_HAMBURGER_NAV_0_6_515/);
  assert.match(app, /setStudioNavCollapsed\(true\)/);
  assert.doesNotMatch(app, /NAV_MOBILE_MQ/);
  assert.doesNotMatch(app, /isMobileNavViewport/);
  assert.match(css, /ALWAYS_HAMBURGER_NAV_0_6_515/);
  assert.match(css, /COLLAPSIBLE_NAV_V2_20261006/);
  assert.match(css, /body\.nav-collapsed \.sidebar/);
  assert.match(css, /body\.nav-open \.sidebar/);
  assert.match(css, /\.studio-nav-toggle/);
  assert.match(css, /position:fixed;top:0;left:0;right:0;z-index:30/);
  assert.match(app, /function scrollStudioToTop\(/);
  assert.doesNotMatch(html, /City Setup/);
  assert.doesNotMatch(html, /profile-setup\.js/);
  assert.doesNotMatch(app, /page === "profile-setup"/);
  // Drawer is not limited to the phone breakpoint.
  assert.match(css, /\.sidebar\{\s*position:fixed/);
});
