import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const progress = fs.readFileSync(new URL("./assets/production-progress-0601.js", import.meta.url), "utf8");
test("Ready platform formats alone cannot complete narrated timeline indicator", () => {
  assert.match(app, /timeline: Boolean\(productionTimedScript\?\.segments\?\.length/);
  assert.match(app, /segments\.every\(segment => String\(segment\?\.voiceover_text \|\| ""\)\.trim\(\)\)/);
  assert.doesNotMatch(app, /timeline: Boolean\(item4Workspace\?\.plan/);
});
test("Four progress steps preserve independent reality even after approval", () => {
  assert.match(progress, /const labels=\['Timeline created','Stills attached','Platform crops ready','Production approved'\]/);
  assert.match(progress, /Boolean\(state.timeline\),Boolean\(state.stills\),Boolean\(state.crops\),Boolean\(state.approved\)/);
  assert.doesNotMatch(progress, /flags\.fill\(true\)/);
});
