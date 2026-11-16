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
  assert.match(worker, /0\.10\.968-library-upload-async/);
});

test("Asset Manager Classifying watch expires at 60 seconds", () => {
  const ui = read("apps/studio-web/assets/app-item4-1008.js");
  assert.match(ui, /LIBRARY_CLASSIFY_WATCH_MAX_AGE_MS = 60 \* 1000/);
  assert.match(ui, /Classification is taking too long/);
});
