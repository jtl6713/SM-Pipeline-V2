import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("home start-post launcher uses a compact wide-screen layout", () => {
  assert.match(css, /Home launcher density: keep all three start paths above the fold on wide screens/);
  assert.match(css, /grid-template-areas:"copy wizard video"/);
  assert.match(css, /grid-template-columns:minmax\(165px,.48fr\) minmax\(285px,.82fr\) minmax\(390px,1.25fr\)/);
  assert.match(css, /\.az-drop-zone\{[\s\S]*padding:10px 12px/);
});

test("compact launcher remains single-column on narrow screens", () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.main:has\(#page-home\.active\):has\(#page-dashboard\.active\) \.ez-path-fork-inner\{[\s\S]*grid-template-columns:1fr/);
});

test("compact launcher uses a cache-busted Pages stylesheet and Pages build", () => {
  assert.match(html, /styles-phase7-0621\.css\?v=0\.6\.560-approve-all-budget/);
  assert.match(html, /home-density-0517\.css\?v=0\.6\.560-approve-all-budget/);
  assert.match(html, /UI build 0\.6\.556/);
});
