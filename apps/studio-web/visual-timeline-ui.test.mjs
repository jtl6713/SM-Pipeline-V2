import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "assets/app-item4-1008.js");

test("creative editor keeps visual timeline UI behind the server feature flag", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /let creativeVisualTimeline = null;/);
  assert.match(source, /let creativeFeatures = \{\};/);
  assert.match(source, /creativeFeatures\?\.visual_timeline_v1/);
  assert.match(source, /data\.visual_timeline/);
  assert.match(source, /features: creativeFeatures/);
});

test("scene cards expose explicit No voiceover and basic source trim controls only in visual timeline mode", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /data-field="voiceover_silent"/);
  assert.match(source, /No voiceover for this scene/);
  assert.match(source, /data-field="source_in_seconds"/);
  assert.match(source, /data-field="source_out_seconds"/);
  assert.match(source, /data-visual-trim-open/);
  assert.match(source, /Open trim editor/);
  assert.match(source, /data-trim-stream/);
  assert.match(source, /visualTimelineEnabled && isVideo \? "readonly" : ""/);
});

test("trim edits drive effective duration but untouched suggested trim does not claim user authority", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /dataset\.trimTouched = "true"/);
  assert.match(source, /duration\.value = Math\.max\(0\.1, end - start\)\.toFixed\(3\)/);
  assert.match(source, /trim_user_set: isVideo \? Boolean\(base\.trim_user_set \|\| trimTouched\) : false/);
});

test("creative save carries optimistic visual revision protection and preserves returned revision", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /visual_timeline: \{/);
  assert.match(source, /base_revision: creativeVisualTimeline\?\.revision \?\? null/);
  assert.match(source, /base_sequence_hash: creativeVisualTimeline\?\.sequence_hash \|\| ""/);
  assert.match(source, /if \(result\.visual_timeline\) creativeVisualTimeline = result\.visual_timeline/);
});

test("production review action describes combined visual and audio rerender when gated on", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /Apply visual\/audio changes & rerender/);
  assert.match(source, /creativeVisualTimeline = null;/);
  assert.match(source, /creativeVisualScript = null;/);
  assert.match(source, /creativeFeatures = \{\};/);
});

test("Pipeline lazy-loads the isolated trim editor and stylesheet without changing the core build marker", async () => {
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(html, /visual-timeline-trim\.css/);
  assert.match(html, /"outputs": \[[\s\S]*visual-timeline-trim\.js/);
  assert.match(html, /0\.6\.739-approved-past-due-qa/);
});
