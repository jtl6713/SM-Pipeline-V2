import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("A3 OpenAI classify timeout is under one minute", () => {
  const source = read("services/pipeline-runner/a3/openai_classify.py");
  assert.match(source, /timeout=45/);
  assert.doesNotMatch(source, /timeout=300/);
});

test("Worker heals stale library Processing and classifies small uploads inline", () => {
  const funcs = read("apps/studio-api/worker-functions-03.mjs");
  const worker = read("apps/studio-api/worker.js");
  assert.match(funcs, /LIBRARY_CLASSIFY_STALE_MS = 60_000/);
  assert.match(funcs, /studioHealStaleLibraryClassification/);
  assert.match(funcs, /background: uploadedIds\.length > 3/);
  assert.match(worker, /studioHealStaleLibraryClassification\(env/);


  assert.match(worker, /0\.10\.995-produce-job-persist/);
});

test("Asset Manager Classifying watch expires at 60 seconds", () => {
  const ui = read("apps/studio-web/assets/app-item4-1008.js");
  assert.match(ui, /LIBRARY_CLASSIFY_WATCH_MAX_AGE_MS = 60 \* 1000/);
  assert.match(ui, /Classification is taking too long/);
});

test("Recovery Classify all uses bounded single-image A3 admissions without unpausing publication", () => {
  const funcs = read("apps/studio-api/worker-functions-03.mjs");
  const start = funcs.indexOf("export async function classifyAllLibraryAssets(");
  const end = funcs.indexOf("/*__STUDIO_WORKER_END:classifyAllLibraryAssets__*/", start);
  assert.ok(start > 0 && end > start);
  const source = funcs.slice(start, end);
  assert.match(source, /recovery_a3_metadata_write_scoped/);
  assert.match(source, /const recoveryLimit = 5;/);
  assert.match(source, /record_ids: \[id\], trigger_a4: false, wait_for_next: false/);
  assert.match(source, /drain: false, background: true/);
  assert.match(source, /if \(recovery\) \{/);
  assert.match(source, /stampLibraryAssetsClassifying/);
  assert.ok(source.indexOf("if (recovery) {") < source.indexOf("stampLibraryAssetsClassifying("),
    "Recovery branch returns before legacy bulk mutation and A3 dispatch");
  assert.match(source, /A3 recovery rejected/);
});
