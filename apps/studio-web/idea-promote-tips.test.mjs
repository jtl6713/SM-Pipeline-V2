import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const config = fs.readFileSync(path.join(here, "assets", "config-0621.js"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");

test("idea promote drawer documents duration vs voiceover tail precedence", () => {
  assert.match(html, /id="promoteTimingHint"/);
  assert.match(html, /id="promoteVoiceoverTail"/);
  assert.match(html, /id="promoteVideoDuration"/);
  assert.match(html, /UI build 0\.6\.338/);
  assert.match(html, /app-item4-0625\.js\?v=0\.6\.338-save-stills/);
  assert.match(html, /id="ideaLibraryPickerForm"/);
  assert.match(config, /promoteVoiceoverTail: "Seconds of picture/);
  assert.match(config, /Video duration still wins/);
  assert.match(config, /prVoiceoverDuration: "Spoken narration length/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.338-save-stills"/);
  assert.match(app, /function syncPromoteTimingHint/);
  assert.match(app, /Video duration is the hard cap/);
  assert.match(app, /library_asset_ids/);
  assert.match(app, /restoreIdeaLibraryPickerAfterDrawerUpdate/);
});
