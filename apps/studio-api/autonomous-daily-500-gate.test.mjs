import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { autonomousDailyIdeaBudget } from "./autonomous-produce.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

test("nightly I1 generates nothing when a city already has 500 or more scheduled+awaiting outputs", () => {
  for (const load of [500, 501, 509, 510, 1200]) {
    assert.equal(autonomousDailyIdeaBudget({ pipeline_load: load }, 10), 0, String(load));
  }
});

test("nightly I1 only requests the remaining estimated ideas below the 500 target", () => {
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 499 }, 10), 1);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 495 }, 10), 1);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 490 }, 10), 2);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 451 }, 10), 10);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 0 }, 4), 4);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 0 }, 50), 10);
});

test("nightly I1 fails closed on missing, invalid, or unverified load", () => {
  for (const score of [undefined, null, {}, { pipeline_load: null }, { pipeline_load: -1 },
    { pipeline_load: NaN }, { pipeline_load: Infinity }, { pipeline_load: "broken" }]) {
    assert.equal(autonomousDailyIdeaBudget(score, 10), 0, JSON.stringify(score));
  }
});

test("scheduled daily runner requires fresh authoritative counts before batch creation", () => {
  const source = readStudioWorkerSource();
  const start = source.indexOf("async function executeStudioDailyIdeas(");
  const end = source.indexOf("async function runStudioDailyIdeas(", start);
  assert.ok(start >= 0 && end > start);
  const run = source.slice(start, end);
  assert.match(run, /studioGlobalAutomaticIdeaInventory\(env\)/);
  assert.match(run, /skipped: "global_inventory_unavailable"/);
  assert.match(run, /globalAutomaticIdeaBudget\(/);
  assert.match(run, /global_idea_target_met/);
  assert.ok(run.indexOf("global_inventory_unavailable") < run.indexOf("studioIdeaCreateBatch("));
  const module = fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker-functions-04.mjs"), "utf8");
  assert.match(module, /if \(requireLive \|\| summaryEnabled \|\| !rows\.length\) return \{ scores: \{\}/);
});
