import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const baseCss = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");
const fixCss = fs.readFileSync(path.join(here, "assets/idea-drawer-safe-offset.css"), "utf8");

test("idea drawer layout correction is the last stylesheet", () => {
  const preceding = html.indexOf("/assets/factory-layout-0680.css");
  const fix = html.indexOf("/assets/idea-drawer-safe-offset.css");
  assert.ok(preceding >= 0 && fix > preceding);
  assert.match(html, /idea-drawer-safe-offset\.css\?v=0\.6\.724-profile-fast-music/);
  assert.match(html, /id="ideaManageDrawer"/);
  assert.match(html, /id="ideaDrawerHeading"/);
  assert.match(html, /id="closeIdeaDrawer"/);
});

test("drawer is offset below the fixed topbar and keeps its content scrollable", () => {
  assert.match(baseCss, /\.idea-drawer\{position:fixed;top:0/);
  assert.match(fixCss, /#ideaManageDrawer\s*\{[^}]*top:\s*var\(--studio-topbar-height,\s*72px\)/s);
  assert.match(fixCss, /height:\s*calc\(100dvh\s*-\s*var\(--studio-topbar-height,\s*72px\)\)/);
  assert.match(fixCss, /#ideaManageDrawer \.drawer-header\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(fixCss, /#ideaManageDrawer \.drawer-body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto/s);
});

test("mobile drawer offset matches actual minimum header height", () => {
  assert.match(baseCss, /\.topbar\s*\{\s*min-height:\s*64px/);
  assert.match(fixCss, /@media\s*\(max-width:\s*760px\)/);
  assert.match(fixCss, /--studio-topbar-height:\s*64px/);
});
