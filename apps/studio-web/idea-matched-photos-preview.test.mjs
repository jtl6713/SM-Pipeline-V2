import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");

test("Manage Idea shows matched photo thumbnails when photos are ready", () => {
  assert.match(html, /id="ideaMatchedPhotos"/);
  assert.match(html, /id="ideaMatchedPhotosGrid"/);
  assert.match(app, /function renderIdeaMatchedPhotos/);
  assert.match(app, /Selected photos \(\$\{ids\.length\}\)/);
  assert.match(app, /matched_media_asset_links/);
  assert.match(app, /photo_match\?\.selected/);
  assert.match(app, /Open Production to add, remove, or reorder them before approval/);
  assert.match(app, /renderIdeaMatchedPhotos\(idea\)/);
});

test("matched photo preview uses authenticated Studio media preview route", () => {
  assert.match(app, /\/api\/media-assets\/\$\{encodeURIComponent\(id\)\}\/preview/);
  assert.match(app, /bindLibraryPickerPreviews\(grid, items\)/);
});
