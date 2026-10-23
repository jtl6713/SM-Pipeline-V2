import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = await readFile(path.join(here, "index.html"), "utf8");

test("Studio bridge exposes independently gated visual script state", () => {
  assert.match(app, /let creativeVisualScript = null/);
  assert.match(app, /creativeFeatures\?\.visual_timeline_v1 && creativeFeatures\?\.visual_script_v1/);
  assert.match(app, /window\.StudioVisualScriptBridge = \{/);
  assert.match(app, /snapshot: creativeVisualScriptSnapshot/);
  assert.match(app, /request: creativeVisualScriptRequest/);
});

test("proposal generation synchronizes only the visual subset first", () => {
  assert.match(app, /async function creativeVisualScriptSyncVisualIfDirty/);
  assert.match(app, /voiceover_mode: slide\.voiceover_mode/);
  assert.match(app, /source_in_ms: slide\.source_in_ms/);
  assert.match(app, /source_out_ms: slide\.source_out_ms/);
  assert.match(app, /await creativeVisualScriptSyncVisualIfDirty\(\)/);
  assert.match(app, /const currentSlides = syncCreativeSlidesFromDom\(\)/);
  assert.doesNotMatch(
    app.match(/async function creativeVisualScriptSyncVisualIfDirty[\s\S]*?^  }/m)?.[0] || "",
    /collectCreativePayload\(\)/,
  );
  assert.match(app, /Only the visual subset was synchronized|visualRows/);
});

test("script modal is refreshed when creative review state changes", () => {
  assert.match(app, /StudioVisualScriptEditor\?\.syncAvailability\?\.\(\)/);
  assert.doesNotMatch(app, /StudioVisualScriptReview\?\.sync/);
});

test("visual script editor is lazy-loaded with Pipeline and keeps the current production build marker", () => {
  assert.match(html, /visual-script-editor\.css\?v=0\.6\.752-script-a-short-plan/);
  assert.match(html, /"outputs": \[[\s\S]*visual-script-editor\.js\?v=0\.6\.752-script-a-short-plan/);
});


test("legacy narration text cannot bypass versioned script acceptance", () => {
  assert.match(app, /data-field="voiceover_text" \$\{creativeFeatures\?\.visual_script_v1 \? "readonly" : ""\}/);
  assert.match(app, /Versioned narration is edited through Regenerate VO script/);
  assert.match(app, /When visual-aware narration is enabled, use Regenerate VO script/);
});
