import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { autonomousDailyIdeaBudget } from "./autonomous-produce.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

test("nightly I1 generates nothing when a city has at least 1,000 approved ready outputs", () => {
  for (const load of [1000, 1001, 1009, 1010, 1200]) {
    assert.equal(autonomousDailyIdeaBudget({ pipeline_load: load }, 10), 0, String(load));
  }
});

test("nightly I1 only requests the remaining estimated ideas below 1,000", () => {
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 999 }, 10), 1);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 995 }, 10), 1);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 990 }, 10), 2);
  assert.equal(autonomousDailyIdeaBudget({ pipeline_load: 951 }, 10), 10);
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
  assert.match(run, /studioLoadAutonomousRefillScores\(env, profiles/);
  assert.match(run, /skipped: "global_inventory_unavailable"/);
  assert.match(run, /autonomousDailyIdeaBudget\(refillScores\?\.\[profile\.id\]/);
  assert.match(run, /global_idea_target_met/);
  assert.ok(run.indexOf("global_inventory_unavailable") < run.indexOf("studioIdeaCreateBatch("));
  const module = fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker-functions-04.mjs"), "utf8");
  assert.match(module, /if \(requireLive \|\| summaryEnabled \|\| !rows\.length\) return \{ scores: \{\}/);
  assert.match(run, /ready_inventory_verified !== true/);
});
