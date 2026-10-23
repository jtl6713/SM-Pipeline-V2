import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
const worker = fs.readFileSync(path.join(here, "worker-functions-02.mjs"), "utf8");
const index = fs.readFileSync(path.join(here, "../studio-web/index.html"), "utf8");

function extractAppFunction(name, nextName) {
  const start = app.indexOf(`  function ${name}(`);
  const end = app.indexOf(`\n  function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${name}`);
  return vm.runInNewContext(`(() => { ${app.slice(start, end)}; return ${name}; })()`);
}

const progressCounts = extractAppFunction("item4VariantProgressCounts", "item4VariantCountLabel");
const countLabel = extractAppFunction("item4VariantCountLabel", "item4PrepareButtonView");

test("Prepare derives an actual target from saved plan while the manifest is absent", () => {
  const status = {
    variant_status: "Preparing",
    assets: [{ id: "a" }, { id: "b" }],
    plan: { items: [{ platform: "Instagram", aspect_ratio: "9:16" }, { platform: "Facebook", aspect_ratio: "4:5" }] },
  };
  const { readyCount, targetCount } = progressCounts(status);
  assert.equal(readyCount, 0);
  assert.equal(targetCount, 4);
  assert.equal(countLabel(readyCount, targetCount), "0/4");
});

test("Prepare counts an additional hero cover ratio for YouTube", () => {
  const status = {
    assets: [{ id: "a" }, { id: "b" }],
    plan: { items: [{ platform: "YouTube", aspect_ratio: "9:16" }] },
  };
  assert.equal(progressCounts(status).targetCount, 3);
});

test("Authoritative manifest totals override inferred planned totals", () => {
  const status = {
    assets: [{ id: "a" }],
    plan: { items: [{ platform: "Instagram", aspect_ratio: "9:16" }] },
    variants: { target_count: 5, ready_count: 2 },
    variant_progress: { target: 5, ready: 3 },
  };
  const counts = progressCounts(status);
  assert.equal(counts.targetCount, 5);
  assert.equal(counts.readyCount, 3);
});

test("A plan manifest is used before variant targets exist", () => {
  assert.equal(progressCounts({ variants: { plan_target_count: 6, plan_ready_count: 2 } }).readyCount, 2);
  assert.equal(progressCounts({ variants: { plan_target_count: 6, plan_ready_count: 2 } }).targetCount, 6);
});

test("An unknown total remains explicitly unknown instead of 0/?", () => {
  assert.equal(progressCounts({}).targetCount, 0);
  assert.equal(countLabel(0, 0), "total pending");
  assert.equal(countLabel(2, 0), "2 ready");
});

test("Variant GET remains safe if no manifest has been stored yet", () => {
  const start = worker.indexOf("export async function getItem4Variants(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:getItem4Variants__*/", start);
  assert.ok(start >= 0 && end > start);
  const handler = worker.slice(start, end);
  assert.match(handler, /const manifest = reconciled\.manifest/);
  assert.match(handler, /assets\.length \* planRatios\.length/);
  assert.match(handler, /manifest\?\.target_count \|\| plannedTotal/);
  assert.doesNotMatch(handler, /reconciled\.manifest\.target_count/);
  assert.doesNotMatch(handler, /reconciled\.manifest\.ready_count/);
});

test("Production's lazy loader points at the corrected cached asset", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.754-producer-conversation"/);
  assert.match(index, /app-item4-1008\.js\?v=0\.6\.754-producer-conversation/);
});
