import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets", "sticky-footer-scroll.css"), "utf8");
const js = fs.readFileSync(path.join(here, "assets", "sticky-footer-scroll.js"), "utf8");

test("Studio keeps the footer accessible and exposes a synchronized bottom scrollbar", () => {
  assert.match(html, /sticky-footer-scroll\.css/);
  assert.match(html, /id="studioBottomScroll"/);
  assert.match(html, /id="studioBottomScrollInner"/);
  assert.match(html, /sticky-footer-scroll\.js/);

  assert.match(css, /\.studio-footer\s*\{[^}]*position:fixed/s);
  assert.match(css, /\.studio-bottom-scroll\s*\{[^}]*position:fixed/s);
  assert.match(css, /bottom:var\(--studio-footer-height\)/);

  assert.match(js, /scrollWidth - element\.clientWidth/);
  assert.match(js, /activeTarget\.scrollLeft/);
  assert.match(js, /bottomScroll\.scrollLeft/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /ResizeObserver/);
});
