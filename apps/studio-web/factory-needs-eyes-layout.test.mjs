import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readUiReleaseContract } from "./ui-release-contract.mjs";
const root = new URL("./", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("assets/factory-layout-0680.css", root), "utf8");
const factory = readFileSync(new URL("assets/factory-desk.js", root), "utf8");

test("Needs eyes responsive action layout is shipped after base stylesheet", () => {
  const app=readFileSync(new URL("assets/app-item4-1008.js", root),"utf8");
  const release=readUiReleaseContract(html,app);
  const asset=html.match(/\/assets\/factory-layout-0680\.css\?[^"'<>]+/);
  assert.ok(asset, "Factory action layout CSS must be linked by Studio Pages");
  assert.equal(new URL(asset[0],"https://studio.invalid").searchParams.get("v"),release.cacheKey);
  assert.ok(html.includes("UI build "+release.version));
  assert.ok(html.indexOf("factory-layout-0680.css") > html.indexOf("styles-phase7-0621.css"));
});
test("Review buttons have two grid rows and an accessible size", () => {
  assert.match(css, /\.factory-line-actions\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.factory-line-actions > button\s*\{[^}]*min-height:30px/);
  assert.match(css, /\[data-factory-send-back\]\s*\{[^}]*grid-column:1 \/ span 2/);
  assert.match(css, /\[data-factory-delete\]\s*\{[^}]*grid-column:3/);
  assert.match(css, /max-height:min\(72vh,760px\)/);
  for (const action of ["open", "preview", "approve", "send-back", "delete"]) {
    assert.ok(factory.includes('data-factory-' + action + '="'), action + " still wired");
  }
});
test("Content-level buttons and narrow layout retain readable actions", () => {
  assert.match(css, /\.factory-content-bar\s*\{[^}]*display:grid/);
  assert.match(css, /@media \(max-width:980px\)/);
  assert.match(css, /@media \(max-width:520px\)/);
  assert.match(factory, /data-factory-approve-content/);
  assert.match(factory, /data-factory-send-back-content/);
});
