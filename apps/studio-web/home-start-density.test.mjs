import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");
const density = fs.readFileSync(path.join(here, "assets/home-density-0517.css"), "utf8");
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");

test("home start-post launcher uses a compact wide-screen layout", () => {
  assert.match(css, /Home launcher density: keep all three start paths above the fold on wide screens/);
  assert.match(density, /grid-template-areas:"copy portal"/);
  assert.match(density, /grid-template-columns:minmax\(165px,.48fr\) minmax\(320px,1.52fr\)/);
  assert.match(css, /\.az-drop-zone\{[\s\S]*padding:10px 12px/);
});

test("home portal exposes three EZ path cards", () => {
  assert.match(html, /id="ezPortal"/);
  assert.match(html, /data-ez-portal-path="vibe"/);
  assert.match(html, /data-ez-portal-path="completed"/);
  assert.match(html, /data-ez-portal-path="wizard"/);
  assert.match(app, /function bindEzPortal/);
  assert.match(app, /0.6.598-approve-publish-fast/);
});

test("compact launcher remains single-column on narrow screens", () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.main:has\(#page-home\.active\):has\(#page-dashboard\.active\) \.ez-path-fork-inner\{[\s\S]*grid-template-columns:1fr/);
});

test("compact launcher uses a cache-busted Pages stylesheet and Pages build", () => {
  assert.match(html, /styles-phase7-0621\.css\?v=0.6.598-approve-publish-fast/);
  assert.match(html, /home-density-0517\.css\?v=0.6.598-approve-publish-fast/);
  assert.match(html, /UI build 0\.6\.598/);
});
