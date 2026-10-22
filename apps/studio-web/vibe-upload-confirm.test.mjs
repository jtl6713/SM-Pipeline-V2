import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function section(a, b) {
  const start = app.indexOf(a);
  const end = app.indexOf(b, start + a.length);
  assert.ok(start !== -1 && end > start, `Expected ${a} before ${b}`);
  return app.slice(start, end);
}

test("Vibe Cut source must have a persisted video asset before Continue is enabled", () => {
  assert.match(html, /id="ezContinue" hidden>Save Video &amp; Continue to Production/);
  const sourceCheck = section("function vibeCutPersistedSource(", "function ezPersistedKindCounts(");
  assert.match(sourceCheck, /item4AssetLooksLikeVideo\(asset\)/);
  assert.match(sourceCheck, /id\.startsWith\("local:"\)/);
  const create = section("async function startEzProduction(", "function bindEzWizard(");
  assert.match(create, /!uploadResult\?\.ok \|\| !vibeCutPersistedSource\(\)/);
  assert.match(create, /action\.hidden = !vibeCutReadySource\(\)/);
  assert.doesNotMatch(create, /action\.hidden = false/);
  assert.doesNotMatch(create, /Production is ready — outputs match your source video/);
});

test("Upload failure cannot silently advance the Vibe Cut workflow", () => {
  const upload = section("async function uploadItem4Files(", "const item4PendingRemoves");
  assert.match(upload, /failed\.push\(/);
  assert.match(upload, /return \{ ok: !failed\.length && !incomplete,/);
  assert.match(upload, /return \{ ok: false, error: friendly \}/);
  assert.match(upload, /throw new Error\("Upload returned without a saved source video attachment/);
  const listener = section("function bindEzIntake(", "function item4SelectedPlatforms(");
  assert.match(listener, /if \(ezIsVibeCut\(\)\)/);
  assert.match(listener, /!activeProductionRequest\?\.id \|\| !vibeCutReadySource\(\)/);
  assert.match(listener, /showProductionRequestWorkspace\(\)/);
});
