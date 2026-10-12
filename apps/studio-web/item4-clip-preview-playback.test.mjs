import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");
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

test("Creative Editor renders source video clips with posters and playable streams", () => {
  assert.match(app, /function phase6CreativeSlideIsVideo\(slide = \{\}\)/);
  assert.match(app, /function phase6CreativeSlidePosterCandidates\(slide = \{\}\)/);
  assert.match(app, /function phase6CreativeSlideStreamUrl\(slide = \{\}\)/);
  assert.match(app, /const previewHtml = isVideo\s*\? \(item4ClipPlayerHtml\(\{/);
  assert.match(app, /item4BindClipPlayers\(target\)/);
  assert.match(html, /<h3>Media \/ slide sequence<\/h3>/);
});

test("Studio build and app cache key stay aligned after clip preview playback changes", () => {
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  const uiBuild = html.match(/UI build (0\.6\.\d+)/)?.[1];
  assert.ok(build);
  assert.ok(uiBuild);
  assert.equal(uiBuild, "0.6.645");
  assert.ok(html.includes(`/assets/app-item4-1008.js?v=${build}`));
});
