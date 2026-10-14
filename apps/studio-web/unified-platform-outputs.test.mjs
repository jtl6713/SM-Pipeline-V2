import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("./", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");
const html = read("index.html");
const app = read("assets/app-item4-1008.js");
const css = read("assets/factory-layout-0680.css");
const worker = read("../studio-api/worker.js");

test("Platforms & Frames owns the only visible editable output matrix", () => {
  const formatStart = html.indexOf('id="item4PlatformToggles"');
  const matrix = html.indexOf('id="prOutputMatrixSection"');
  const details = html.indexOf('id="ezAdvancedOptions"');
  assert.ok(formatStart > 0 && formatStart < matrix && matrix < details);
  assert.equal(html.split('id="prOutputMatrixSection"').length - 1, 1);
  assert.match(html, /id="item4OutputPlan" hidden/);
  assert.match(html, /id="item4PlatformToggles" hidden/);
  assert.match(html, /id="item4SaveOutputSelection"/);
  assert.match(html, /Save output selections/);
  assert.match(html, /data-pr-output data-platform="Instagram" value="Carousel"/);
  assert.match(html, /data-pr-output data-platform="Instagram" value="Reel"/);
  assert.match(html, /data-pr-output data-platform="Facebook" value="Multi-Image Post"/);
  assert.match(html, /data-pr-output data-platform="Facebook" value="Reel"/);
  assert.match(css, /#item4OutputPlan\[hidden\]/);
  assert.match(css, /#prOutputMatrix/);
  assert.doesNotMatch(app, /<select data-item4-format/);
});

test("Recommend checks persisted output rows and manual Save syncs Frames", () => {
  const start = app.indexOf("async function buildItem4Plan()");
  const end = app.indexOf("function selectedRequestPlatforms()", start);
  const recommend = app.slice(start, end);
  assert.match(recommend, /extras: \[\]/);
  assert.match(recommend, /await loadProductionRequestOutputs\(activeProductionRequest\)/);
  assert.doesNotMatch(recommend, /restoreProductionOutputSelection\(/);
  assert.match(app, /async function saveItem4OutputSelection\(\)/);
  assert.match(app, /await saveProductionRequestOutputs\(activeProductionRequest\)/);
  assert.match(app, /item4OutputSelectionDirty = true/);
  assert.match(app, /Save your platform output selections before preparing frames/);
  assert.match(app, /"item4SaveOutputSelection"\)\?\.addEventListener\("click", saveItem4OutputSelection\)/);
});

test("Worker output synchronization REPLACES stale plan items with enabled output types", () => {
  const start = worker.indexOf("async function item4ReconcilePlanWithEnabledOutputs(");
  const end = worker.indexOf("async function item4DisableUnsupportedCompanions(", start);
  assert.ok(start > 0 && end > start);
  const functionBody = worker.slice(start, end);
  assert.match(functionBody, /const items = \[\];/);
  assert.match(functionBody, /for \(const pair of enabledPairs \|\| \[\]\)/);
  assert.match(functionBody, /Studio_Output_Plan_JSON: JSON\.stringify\(plan\)/);
  assert.doesNotMatch(functionBody, /\.\.\.existingPlan\.items/);
  assert.match(functionBody, /const sameKeys = /);
  assert.match(worker, /updatedParent = await item4ReconcilePlanWithEnabledOutputs\(env, updatedParent, planItems\)/);
});

test("Studio build label, app BUILD_ID, and asset versions are aligned", () => {
  assert.match(html, /UI build 0\.6\.686/);
  assert.match(app, /const BUILD_ID = "item4-0\.6\.686-unified-platform-outputs"/);
  const versions = [...html.matchAll(/\?v=(\d+\.\d+\.\d+)-/g)].map((x) => x[1]);
  assert.ok(versions.length > 10);
  assert.ok(versions.every((x) => x === "0.6.686"));
});
