import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("TikTok photo posts require sound confirmation before Studio completion", () => {
  assert.match(app, /item4-0.6.572-idea-timeline-photo-wait/);
  assert.match(app, /function tiktokPhotoSoundRequired\(/);
  assert.match(app, /Add a sound in TikTok before publishing this photo carousel/);
  assert.match(app, /music\?\.focus\(\)/);
  assert.match(html, /Sound required for photo posts/);
  assert.match(html, /Yes — I added\/selected sound in TikTok before posting/);
  assert.match(css, /TIKTOK_PHOTO_SOUND_GUARD_0_6_513/);
});

test("TikTok photo requirement remains scoped away from ordinary video drafts", () => {
  assert.match(app, /if \(\/\\bvideo\\b\/\.test\(combined\) && !\/\(photo\|carousel\|slideshow\)\/\.test\(combined\)\) return false;/);
});
