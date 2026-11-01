import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const factory = read("./assets/factory-desk.js");
const review = read("./assets/rendering-review-queue.js");
const svg = read("./assets/needs-asset.svg");
const factoryCss = read("./assets/factory-layout-0680.css");
const reviewCss = read("./assets/rendering-review-queue.css");
const workspace = read("../studio-api/rendering-review-workspace.mjs");

test("Factory and Rendering Review reuse exactly the same NEEDS ASSET thumbnail", () => {
  assert.match(svg, /<title id="title">NEEDS ASSET<\/title>/);
  assert.match(svg, /<text[^>]*>NEEDS<\/text>/);
  assert.match(svg, /<text[^>]*>ASSET<\/text>/);
  assert.match(factory, /const NEEDS_ASSET_THUMB = "\/assets\/needs-asset\.svg"/);
  assert.match(review, /const NEEDS_ASSET_THUMB = '\/assets\/needs-asset\.svg'/);
  assert.match(factory, /image\.matches\("#page-factory \.factory-line-thumb img"\)/);
  assert.match(factory, /image\.src = NEEDS_ASSET_THUMB/);
  assert.match(review, /cover\.src=coverUrl\|\|NEEDS_ASSET_THUMB/);
  assert.match(review, /cover\.src=NEEDS_ASSET_THUMB/);
});

test("Real thumbnail URLs stay on their own outputs and compact layouts", () => {
  assert.match(factory, /const thumb = String\(card\.thumbnail_url/);
  assert.match(factory, /<img src="\$\{esc\(thumb\)\}"/);
  assert.match(review, /safeUrl\(entry\.thumbnail_url\)/);
  assert.match(workspace, /'Final_File_URL','Thumbnail_URL','Output_Title'/);
  assert.match(workspace, /thumbnail_url:text\(f\.Thumbnail_URL\)\|\|null/);
  assert.match(factoryCss, /#page-factory \.factory-line-thumb-empty img/);
  assert.match(reviewCss, /\.rr-entry-thumb\{display:block/);
});
