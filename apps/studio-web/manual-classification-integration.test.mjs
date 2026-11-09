import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Issue 1716 server routes are authenticated, profile-scoped and gated", () => {
  const worker = read("../studio-api/worker.js");
  const funcs = read("../studio-api/worker-functions-03.mjs");
  assert.match(worker, /isAssetLibraryManualClassificationWrite/);
  assert.match(worker, /assertWriteRequest\(request, env\);\s*return await manualLibraryClassificationRoute/);
  assert.match(funcs, /requirePermission\(authorization, "production_configure"\)/);
  assert.match(funcs, /owner !== profileId/);
  assert.match(funcs, /Manual_Classification_JSON: JSON\.stringify\(applied\.manual\)/);
  assert.match(funcs, /Manual_Classification_Audit: JSON\.stringify\(events\)/);
  assert.match(funcs, /\{Manual_Classification_JSON\}/);
});
test("Issue 1716 Studio editor is connected and publishes matching version", () => {
  const html = read("./index.html");
  const ui = read("./assets/manual-asset-classification.js");
  const main = read("./assets/app-item4-1008.js");
  const jsVersion = /manual-asset-classification\.js\?v=([^"]+)/.exec(html)?.[1];
  const cssVersion = /manual-asset-classification\.css\?v=([^"]+)/.exec(html)?.[1];
  const appVersion = /const BUILD_ID = "item4-([^"]+)"/.exec(main)?.[1];
  assert.ok(jsVersion, "manual classification runtime must remain wired to Studio HTML");
  assert.equal(cssVersion, jsVersion, "manual classification CSS must share UI release");
  assert.equal(appVersion, jsVersion, "manual classification UI must share the app's active build");
  assert.match(main, /window\.StudioManualClassificationBridge/);
  assert.match(main, /StudioManualClassificationRefreshToken/);
  assert.match(ui, /MutationObserver/);
  assert.match(ui, /record_ids/);
  assert.match(ui, /manual-classification/);
});
