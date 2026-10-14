import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("UI 0.6.516 Pipeline overview is a bounded horizontal scrollport on phones", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.682-factory-mobile-cards"/);
  assert.match(html, /UI build 0.6.682/);
  assert.match(html, /styles-phase7-0621\.css\?v=0.6.682-factory-mobile-cards/);
  assert.match(css, /PIPELINE_MOBILE_SCROLL_0_6_514/);
  assert.match(css, /body:has\(#page-outputs\.active\) \.main/);
  assert.match(css, /#page-outputs \.panel:has\(#outputsList\)/);
  assert.match(css, /#outputsList\{\s*overflow-x:auto;/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /touch-action:pan-x pan-y/);
  assert.match(css, /\.pipeline-compact-table\{[^}]*min-width:980px/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*#outputsList\{[\s\S]*overflow-x:auto/);
  assert.match(css, /\.data-table:not\(\.pipeline-compact-table\)/);
  assert.match(css, /#outputsList \.pipeline-compact-table\{\s*min-width:1040px!important/);
  assert.doesNotMatch(css, /#outputsList\{overflow:visible\}/);
});
