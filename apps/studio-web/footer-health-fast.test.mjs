import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");

test("UI build advertises footer-health-fast", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.586-footer-health-fast"/);
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
