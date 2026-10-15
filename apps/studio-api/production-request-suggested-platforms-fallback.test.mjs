import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("production draft falls back to Suggested_Platforms when explicit targets are absent", async () => {
  const worker = readStudioWorkerSource();
  const start = worker.indexOf("function productionRequestDefaultsFromIdea");
  const end = worker.indexOf("function suggestPrimaryLocationFromIdea", start);
  const fn = worker.slice(start, end);
  assert.match(fn, /Production_Target_Platforms/);
  assert.match(fn, /if \(productionPlatforms\.length\) return canonicalProductionPlatforms\(productionPlatforms\)/);
  assert.match(fn, /Suggested_Platforms/);
});


test("legacy output-style platform labels normalize to Production platforms", async () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /\["youtube shorts", "YouTube"\]/i);
  assert.match(worker, /\["instagram reels", "Instagram"\]/i);
  assert.match(worker, /\["facebook reels", "Facebook"\]/i);
  assert.match(worker, /function canonicalProductionPlatform/);
  assert.match(worker, /const platforms = canonicalProductionPlatforms\(platformsRaw\)/);
  assert.match(worker, /if \(productionPlatforms\.length\) return canonicalProductionPlatforms\(productionPlatforms\)/);
});
