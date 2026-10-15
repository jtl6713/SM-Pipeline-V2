import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");

test("Studio idea generation accepts a batch then finishes Python I1 in waitUntil", async () => {
  const source = readStudioWorkerSource();
  const start = source.indexOf("async function startStudioIdeaGeneration");
  const end = source.indexOf("async function studioIdeaGenerationStatus", start);
  assert.ok(start >= 0 && end > start, "idea generation handler should exist");
  const handler = source.slice(start, end);
  const run = source.slice(
    source.indexOf("async function studioIdeaRunPythonBatch"),
    source.indexOf("async function startStudioIdeaGeneration")
  );

  assert.match(handler, /studioIdeaCreateBatch/);
  assert.match(handler, /studioIdeaRunPythonBatch/);
  assert.match(handler, /ctx\.waitUntil/);
  assert.match(handler, /status: "Pending"/);
  assert.match(handler, /backend: "python"/);
  assert.match(run, /item4PulsePipelineStage\(env, "i1"/);
  assert.match(run, /batch_record_id: batch\.id/);
  assert.doesNotMatch(handler, /phase6ScenarioState/);
  assert.match(source, /version: "0.10.620-approve-all-fast-stamp"/);
});

test("Studio UI polls idea batches and explains aborted Generate starts", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /result\.completed \|\| result\.status === "Complete"/);
  assert.match(source, /created_count/);
  assert.match(source, /timeoutMs: 45000/);
  assert.match(source, /activeIdeaGenerationBatchId = result\.batch_record_id/);
  assert.match(source, /connection dropped/);
  assert.match(source, /BUILD_ID = "item4-0.6.695-approve-all-fast-stamp"/);
});
