import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const planSrc = fs.readFileSync(path.join(here, "assets/ez-plan.js"), "utf8");
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");

test("ez-plan exposes aspect-based output routing", () => {
  assert.match(planSrc, /function ezPlanFromSourceAspect/);
  assert.match(planSrc, /source_aspect: "horizontal"/);
  assert.match(planSrc, /Standard Video/);
  assert.match(planSrc, /source-aspect=/);
});

test("startEzProduction probes video aspect before plan save", () => {
  assert.match(app, /aspectPlanFromVideoFiles/);
  assert.match(app, /ezMergeAspectPlan/);
  assert.match(app, /sourceAspect/);
});

test("Vibe Cut upload opens Production workspace", () => {
  assert.match(app, /ezIsVibeCut\(\) && activeProductionRequest\?\.id/);
  assert.match(app, /showProductionRequestWorkspace\(\)/);
});
