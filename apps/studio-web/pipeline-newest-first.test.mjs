import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("Pipeline content packages sort by numeric Content ID descending, independent of approval and schedule", () => {
  const start = app.indexOf("function groupedPipelineRecords(records)");
  const end = app.indexOf("function isPipelineGroupExpanded(", start);
  assert.ok(start >= 0 && end > start);
  const source = app.slice(start, end);
  assert.match(source, /contentNumber\(b\) - contentNumber\(a\)/);
  assert.doesNotMatch(source, /production_approved_at|scheduled_post_date|publish_date/);
  assert.match(source, /pipelineOutputNumber/);
});

test("Pipeline defaults to all records rather than a schedule-week filter", () => {
  const start = app.indexOf("function showStudioPage(page, options = {})");
  const end = app.indexOf("initStudioNavCollapse()", start);
  const source = app.slice(start, end);
  assert.match(source, /pipelineViewFilter = requestedFilter \|\| "all"/);
});
