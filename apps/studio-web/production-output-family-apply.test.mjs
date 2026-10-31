import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const ui = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "assets/app-item4-1008.js"), "utf8");

test("Output override defaults to one output and offers a compatible family", () => {
  new Function(js);
  assert.match(ui, /id="prOverrideApplyScope"/);
  assert.match(ui, /<option value="single">Only this output<\/option>/);
  assert.match(ui, /<option value="family" hidden>All matching outputs<\/option>/);
  assert.match(js, /function productionOutputRenderFamily\(row\)/);
  for (const type of [
    "Instagram::Reel", "Facebook::Reel", "TikTok::Video Draft",
    "YouTube::Short", "Instagram::Story", "Facebook::Story",
  ]) assert.ok(js.includes(type), type);
  assert.match(js, /if \(scope\) scope\.value = "single"/);
  assert.match(js, /familyOption\.disabled = familyMembers\.length < 2/);
  assert.match(js, /productionOutputRenderFamily\(candidate\) === kind/);
});

test("Fanout excludes publishing and scheduling changes on siblings", () => {
  const start = js.indexOf("async function saveProductionRequestOutputOverride()");
  const end = js.indexOf("function syncLegacyPlatformsFromOutputMatrix()", start);
  assert.ok(start > 0 && end > start);
  const save = js.slice(start, end);
  assert.match(save, /selectedScope === "family"/);
  assert.match(save, /publish_mode: _publishMode, scheduled_at: _scheduledAt, \.\.\.sharedPayload/);
  assert.match(save, /target\.id === recordId \? payload : sharedPayload/);
  assert.match(save, /Saved \$\{applied\.length\} of \$\{targets\.length\}/);
  assert.doesNotMatch(save, /Promise\.all\(/);
  assert.match(save, /renderProductionRequestOutputCards\(\)/);
});
