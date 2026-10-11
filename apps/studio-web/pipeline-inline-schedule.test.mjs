import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("Pipeline typed schedule autosaves without requiring Save", () => {
  assert.match(app, /item4-0.6.577-reopen-production-draft/);
  assert.match(app, /input\.addEventListener\("change", \(\) => \{\s*markDirty\(\);\s*saveTypedValue\(\);/);
  assert.match(app, /input\.addEventListener\("blur", saveTypedValue\)/);
  assert.match(app, /if \(event\.key !== "Enter"\) return;[\s\S]*saveTypedValue\(\)/);
  assert.match(app, /saves automatically when you leave the field or press Enter/);
});

test("Published Pipeline schedules render locked and cannot save", () => {
  assert.match(app, /const publishedSchedule = creativeIsPublished\(r\)/);
  assert.match(app, /pipeline-schedule-locked/);
  assert.match(app, /disabled aria-label="Published schedule locked"/);
  assert.match(app, /if \(creativeIsPublished\(record\)\) \{/);
  assert.match(app, /Locked — already published/);
  assert.match(css, /\.pipeline-schedule-locked/);
  assert.match(css, /cursor:not-allowed/);
});

test("Compact schedule row no longer reserves a Save-button column", () => {
  assert.match(css, /pipeline-schedule-controls\{display:grid;grid-template-columns:minmax\(0,1fr\) 30px;/);
});

test("Bulk schedule regeneration includes blank unpublished schedules", () => {
  const start = app.indexOf("async function regeneratePipelineSchedulesForPlatforms");
  const end = app.indexOf("async function regeneratePipelineContentSchedule", start);
  assert.ok(start >= 0 && end > start);
  const handler = app.slice(start, end);
  assert.match(handler, /return !iso \|\| !Number\.isFinite\(ms\)/);
  assert.match(handler, /creativeIsPublished\(record\)/);
  assert.match(handler, /14 \* 24 \* 60 \* 60 \* 1000/);
});
