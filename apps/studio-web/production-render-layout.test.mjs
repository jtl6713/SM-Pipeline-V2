import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("./", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("assets/production-render-layout-0678.css", root), "utf8");

test("Rendering layout fix is linked and shipped with its cache-busted version", () => {
assert.match(html, /production-render-layout-0678\.css\?v=0.6.683-factory-all-lanes/);
assert.match(html, /UI build 0.6.683/);
});
test("Production no longer crops a long timed script at an 880px shell", () => {
  assert.match(css, /#page-content\.production-page\s*\{[^}]*max-width:\s*1280px/);
  assert.match(css, /\.production-render-settings\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.timed-script-pool\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.production-render-settings\s*\{[^}]*background:\s*#fff/);
  assert.match(css, /@media \(max-width: 620px\)/);
});
