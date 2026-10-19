import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = await readFile(path.join(here, "index.html"), "utf8");

test("Studio core exposes one guarded visual script bridge", () => {
  assert.match(app, /window\.StudioVisualScriptBridge = \{/);
  assert.match(app, /snapshot: creativeVisualScriptSnapshot/);
  assert.match(app, /request: creativeVisualScriptRequest/);
  assert.match(app, /creativeFeatures\?\.visual_timeline_v1 && creativeFeatures\?\.visual_script_v1/);
  assert.match(app, /visual_script_base: \{/);
  assert.match(app, /script_revision: creativeVisualScript\?\.revision/);
  assert.match(app, /visual_revision: creativeVisualTimeline\?\.revision/);
});

test("creative loads keep accepted script state and refresh the single editor launcher", () => {
  assert.match(app, /creativeVisualScript = data\.visual_script/);
  assert.match(app, /window\.StudioVisualScriptEditor\?\.syncAvailability\?\.\(\)/);
  assert.doesNotMatch(app, /StudioVisualScriptReview/);
});

test("accepted visual script refreshes authoritative creative state before returning", () => {
  assert.match(app, /if \(result\?\.visual_script_action === "accepted"\)/);
  assert.match(app, /const refreshed = await api\(\x60\/api\/outputs\/\$\{encodeURIComponent\(activeCreativeOutputId\)\}\/creative\x60\)/);
  assert.match(app, /populateCreativeEditor\(refreshed\)/);
});

test("Pipeline lazy-loads only the canonical visual script editor", () => {
  assert.match(html, /visual-script-editor\.css/);
  assert.match(html, /"outputs": \[[\s\S]*visual-script-editor\.js/);
  assert.doesNotMatch(html, /visual-script-review/);
  assert.match(html, /0\.6\.721-profile-audio-previews/);
});
