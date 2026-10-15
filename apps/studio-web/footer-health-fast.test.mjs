import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");

test("UI build advertises no-home-recent-outputs", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.689-balanced-four-week-slots"/);
});

test("api() backs off longer on Airtable 429 / cooling-down", () => {
  assert.match(app, /API_AIRTABLE_COOLDOWN_RETRY_MS = 12000/);
  assert.match(app, /function apiRetryDelayMs/);
  assert.match(app, /function isAirtableCooldownFailure/);
  assert.match(app, /cooling down\|rate\.\?limit\|too many requests/);
  const apiStart = app.indexOf("async function api(path, options = {})");
  assert.ok(apiStart >= 0);
  const apiFn = app.slice(apiStart, apiStart + 3500);
  assert.match(apiFn, /apiRetryDelayMs\(/);
  assert.doesNotMatch(apiFn, /await sleepMs\(API_TRANSIENT_RETRY_MS\);/);
});

test("checkHealth paints Worker/API before loading profiles", () => {
  const start = app.indexOf("async function checkHealth()");
  assert.ok(start >= 0);
  const end = app.indexOf("\n  let dashboardInflight", start);
  const fn = app.slice(start, end);
  const paintWorker = fn.indexOf("workerBuildLabel.textContent = formatWorkerBuild");
  const paintApi = fn.indexOf('apiStatus").textContent');
  const loadProfiles = fn.indexOf("loadStudioProfiles({ quiet: true })");
  assert.ok(paintWorker >= 0, "must paint workerBuildLabel");
  assert.ok(paintApi >= 0, "must paint apiStatus");
  assert.ok(loadProfiles >= 0, "must still kick profile load");
  assert.ok(paintWorker < loadProfiles, "worker label before profiles");
  assert.ok(paintApi < loadProfiles, "api status before profiles");
  assert.doesNotMatch(fn, /await loadStudioProfiles/);
});
