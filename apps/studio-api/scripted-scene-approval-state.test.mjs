import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("bridge preflight treats an unassigned scripted scene as not ready", () => {
  const start = worker.indexOf("async function item4SourceToProductionBridgePreflight");
  const end = worker.indexOf("async function productionRequestBridgePreflightRoute", start);
  const preflight = worker.slice(start, end);
  assert.ok(start >= 0 && end > start, "source-to-production bridge preflight missing");
  assert.match(preflight, /scripted_short_timeline_present/);
  assert.match(preflight, /scripted_short_scenes_assigned/);
  assert.match(preflight, /scriptedShortUnassignedMessage\(proposalTimeline\)/);
});

test("Production disables Approve and replaces Ready when a scene is unassigned", () => {
  const controlStart = app.indexOf("function setProductionRequestControlState");
  const controlEnd = app.indexOf("function populateProductionRequestForm", controlStart);
  const controls = app.slice(controlStart, controlEnd);
  assert.ok(controlStart >= 0 && controlEnd > controlStart, "Production control-state helper missing");
  assert.match(controls, /const scriptedSceneBlocker = scriptedShortMissingSceneMessage\(record\)/);
  assert.match(controls, /promote\.disabled = Boolean\(item4Uploading \|\| scriptedSceneBlocker\)/);
  assert.match(controls, /kind = "error-text";\s*text = scriptedSceneBlocker/);
});

test("the blocker names the exact scene and points to the matching action", () => {
  const start = app.indexOf("function scriptedShortMissingSceneMessage");
  const end = app.indexOf("function productionStillAssets", start);
  const helper = app.slice(start, end);
  assert.ok(start >= 0 && end > start, "scripted-scene blocker helper missing");
  assert.match(helper, /sceneLabel/);
  assert.match(helper, /Match stills in order/);
  assert.match(helper, /in Rendering before Approve/);
});
