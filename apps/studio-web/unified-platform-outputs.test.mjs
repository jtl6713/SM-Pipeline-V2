import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";
const root = new URL("./", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");
const html = read("index.html");
const app = read("assets/app-item4-1008.js");
const css = read("assets/factory-layout-0680.css");
const worker = readStudioWorkerSource();

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

test("Recommend checks visible boxes before Save and the persist path stays available", () => {
  const start = app.indexOf("async function buildItem4Plan(options = {})");
  const end = app.indexOf("function selectedRequestPlatforms()", start);
  const recommend = app.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(recommend, /const persist = options\.persist !== false/);
  assert.match(recommend, /applyRecommendedOutputChecks\(platforms\)/);
  assert.match(recommend, /item4OutputSelectionDirty = true/);
  assert.match(recommend, /if \(!persist\)/);
  assert.match(recommend, /extras: \[\]/);
  assert.match(recommend, /await loadProductionRequestOutputs\(activeProductionRequest\)/);
  assert.doesNotMatch(recommend, /restoreProductionOutputSelection\(/);
  assert.match(app, /buildItem4Plan\(\{ persist: false \}\)/);
  assert.match(app, /async function saveItem4OutputSelection\(\)/);
  assert.match(app, /await saveProductionRequestOutputs\(activeProductionRequest\)/);
  assert.match(app, /Saving selected formats before preparing frames/);
  assert.match(app, /"item4SaveOutputSelection"\)\?\.addEventListener\("click", saveItem4OutputSelection\)/);
});

test("Details summarizes the same matrix and each platform can be turned off", () => {
  const detailsStart = html.indexOf('id="ezAdvancedOptions"');
  const detailsEnd = html.indexOf('id="productionRequestListPanel"', detailsStart);
  const details = html.slice(detailsStart, detailsEnd);
  assert.match(details, /id="prDetailsOutputSummary"/);
  assert.match(details, /id="prEditOutputsInFrames"/);
  assert.doesNotMatch(details, /data-pr-output/);
  assert.match(html, /data-pr-platform-include value="Instagram"/);
  assert.match(html, /data-pr-platform-include value="Facebook"/);
  assert.match(html, /data-pr-platform-include value="TikTok"/);
  assert.match(html, /data-pr-platform-include value="YouTube"/);
  assert.equal(html.split('id="prOutputMatrix"').length - 1, 1);
  assert.match(app, /function syncPlatformIncludeChecks\(\)/);
  assert.match(app, /prDetailsOutputSummary/);
  assert.match(app, /setProductionWorkspaceTab\("formats", \{ focus: true \}\)/);
});

test("Saved selections are not silently replaced on open or timeline save", () => {
  const loadStart = app.indexOf("async function loadProductionRequestOutputs(");
  const loadEnd = app.indexOf("function defaultOutputsForPlatforms(", loadStart);
  const loadBody = app.slice(loadStart, loadEnd);
  assert.doesNotMatch(loadBody, /Slideshow Reel/);
  assert.doesNotMatch(loadBody, /item4PlanOverrides = \{ \.\.\.item4PlanOverrides, Facebook: "Reel" \}/);
  const saveStart = app.indexOf("async function saveProductionRequestOutputs(");
  const saveEnd = app.indexOf("function setProductionRequestControlState(", saveStart);
  const saveBody = app.slice(saveStart, saveEnd);
  assert.match(saveBody, /let outputs = selectedOutputMatrix\(\)/);
  assert.match(saveBody, /if \(!outputs\.length && item4HasTimedScript\(record\)\)/);
  assert.doesNotMatch(saveBody, /item4HasTimedScript\(record\)\s*\?\s*defaultOutputsForPlatforms/);
  const autoStart = app.indexOf("async function maybeAutoEzPlan(");
  const autoEnd = app.indexOf("function renderEzPerPhotoCaptions(", autoStart);
  assert.match(app.slice(autoStart, autoEnd), /enabledProductionRequestOutputs\(\)\.length/);
  const prepStart = app.indexOf("async function prepareItem4Variants(");
  const prepEnd = app.indexOf("function renderItem4Workspace(", prepStart);
  const prep = app.slice(prepStart, prepEnd);
  assert.match(prep, /productionOutputSelectionKeys\(\)/);
  assert.match(prep, /await saveProductionRequestOutputs\(activeProductionRequest\)/);
  assert.match(prep, /restoreProductionOutputSelection\(requestedKeys\)/);
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
  assert.match(html, /UI build 0\.6\.694/);
  assert.match(app, /const BUILD_ID = "item4-0\.6\.694-factory-approve-story-bounce"/);
  const versions = [...html.matchAll(/\?v=(\d+\.\d+\.\d+)-/g)].map((x) => x[1]);
  assert.ok(versions.length > 10);
  assert.ok(versions.every((x) => x === "0.6.694"));
});
