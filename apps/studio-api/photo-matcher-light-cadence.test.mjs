import test from "node:test";
import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

test("light scheduled cadence independently drains waiting photo ideas with cooldown protection", () => {
  const source = readStudioWorkerSource();
  const start = source.indexOf("async scheduled(event, env, ctx)");
  assert.ok(start >= 0);
  const scheduled = source.slice(start);
  assert.match(scheduled, /if \(!cadence\.heavy && airtableCooldownWaitMs\(\) <= AIRTABLE_SLOT_FAIL_FAST_MS\)/);
  assert.match(scheduled, /ctx\.waitUntil\(runWaitingIdeaPhotoMatches\(env, \{ limit: 2 \}\)/);
  assert.match(scheduled, /\.catch\(\(error\) => console\.warn\("Light-cadence photo matching failed", error\)\)/);
  assert.match(scheduled, /await runWaitingIdeaPhotoMatches\(env, \{ limit: 12 \}\)/);
});
