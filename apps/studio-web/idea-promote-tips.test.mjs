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
  assert.match(html, /UI build 0\.6\.347/);
  assert.match(html, /app-item4-0625\.js\?v=0\.6\.347-unified-lower-third/);
  assert.match(html, /id="ideaLibraryPickerForm"/);
  assert.match(html, /class="idea-type-guide"/);
  assert.match(html, /Photo Set turns stills into Reels|Photo Set/);
  assert.match(html, />Vertical Short Video</);
  assert.match(html, />Carousel</);
  assert.match(config, /promoteVoiceoverTail: "Seconds of picture/);
  assert.match(config, /Video duration still wins/);
  assert.match(config, /prVoiceoverDuration: "Spoken narration length/);
  assert.match(config, /Help → Ideas has a graphic/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.347-unified-lower-third"/);
  assert.match(app, /function syncPromoteTimingHint/);
  assert.match(app, /Video duration is the hard cap/);
  assert.match(app, /library_asset_ids/);
  assert.match(app, /restoreIdeaLibraryPickerAfterDrawerUpdate/);
});

test("Vertical Short Video defaults Instagram and Facebook to Reel plus Story", () => {
  assert.match(app, /"Vertical Short Video": \{Instagram:"Reel", Facebook:"Reel"/);
  assert.match(app, /verticalShort && \["Instagram", "Facebook"\]\.includes\(platform\) && primary === "Reel"/);
  assert.match(app, /defaults\.push\("Story"\)/);
  assert.match(app, /applyDefaultOutputsForPlatform\(input\.value, \{ replace: true \}\)/);
});

test("review audio defaults use sixty percent of the previous mix", () => {
  assert.match(html, /id="creativeMusicNormal"[^>]+value="60"/);
  assert.match(html, /id="creativeMusicDucked"[^>]+value="5\.04"/);
  assert.match(app, /phase6Percent\(output\.music\?\.normal_volume, 60\)/);
  assert.match(app, /phase6Percent\(output\.music\?\.ducked_volume, 5\.04\)/);
});

test("Manage Idea attaches both library photos and clips", () => {
  assert.match(html, /id="configureProductionButton">Add new media</);
  assert.match(html, /Search library photos and clips/);
  assert.match(app, /params\.set\("include", "video"\)/);
  assert.match(app, /allow_video: true/);
  assert.match(app, /origin_kind: "photos-and-clips"/);
});
