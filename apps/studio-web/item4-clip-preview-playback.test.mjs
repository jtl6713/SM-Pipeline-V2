import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

test("clip player keeps stream authority even when preloaded", () => {
  assert.match(app, /class="item4-clip-video" data-item4-stream="\$\{escapeHtml\(src\)\}"/);
  assert.match(app, /if \(video\.currentSrc \|\| video\.getAttribute\("src"\)\) return true;\s*if \(!pending\) return false;/);
});

test("broken clip poster preserves the playable video instead of replacing the card", () => {
  assert.match(app, /function item4PreserveClipPlayerAfterPosterFailure\(img\)/);
  assert.match(app, /img\.remove\(\)/);
  assert.match(app, /video\.preload = "auto"/);
  assert.match(app, /item4EnsureClipPosters\(\[asset\]\)/);
  assert.match(app, /if \(item4PreserveClipPlayerAfterPosterFailure\(img\)\) return;/);
});

test("video preview candidates include a Drive thumbnail fallback", () => {
  assert.match(app, /const driveThumb = item4DriveThumbnailUrl\(asset\?\.google_drive_file_id\)/);
  assert.match(app, /if \(driveThumb\) candidates\.push\(driveThumb\)/);
});

test("async poster repair repaints the Frames gallery", () => {
  assert.match(app, /if \(\$\("item4VariantGallery"\)\) renderItem4Variants\(item4Workspace\)/);
});

test("Studio build is 0.6.390 clip preview playback", () => {
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.equal(build, "0.6.390-clip-preview-playback");
  assert.match(html, /UI build 0\.6\.390/);
  assert.ok(html.includes(`/assets/app-item4-0625.js?v=${build}`));
});
