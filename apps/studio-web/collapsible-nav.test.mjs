import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-0625.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("UI 0.6.512 exposes a collapsible left navigation for mobile and desktop", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.512-collapsible-nav"/);
  assert.match(html, /UI build 0\.6\.512/);
  assert.match(html, /app-item4-0625\.js\?v=0\.6\.512-collapsible-nav/);
  assert.match(html, /styles-phase7-0621\.css\?v=0\.6\.512-collapsible-nav/);
  assert.match(html, /id="studioNavToggle"/);
  assert.match(html, /id="studioSidebar"/);
  assert.match(html, /id="studioNavBackdrop"/);
  assert.match(html, /aria-controls="studioSidebar"/);
  assert.match(app, /function setStudioNavCollapsed\(/);
  assert.match(app, /function initStudioNavCollapse\(/);
  assert.match(app, /NAV_COLLAPSE_STORAGE_KEY = "studio\.nav_collapsed"/);
  assert.match(app, /NAV_MOBILE_MQ = "\(max-width: 760px\)"/);
  assert.match(app, /if \(isMobileNavViewport\(\)\) setStudioNavCollapsed\(true, \{ persist: false \}\)/);
  assert.match(css, /COLLAPSIBLE_NAV_V1_20261006/);
  assert.match(css, /body\.nav-collapsed \.sidebar/);
  assert.match(css, /body\.nav-open \.sidebar/);
  assert.match(css, /\.studio-nav-toggle/);
  assert.match(css, /transform:translateX\(-105%\)/);
});
