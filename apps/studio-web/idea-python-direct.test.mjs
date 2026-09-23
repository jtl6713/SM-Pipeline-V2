import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, "..", "studio-api", "worker.js");
const appPath = path.join(here, "assets", "app-item4-0625.js");

test("Studio idea generation routes directly to Python I1", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function startStudioIdeaGeneration");
  const end = source.indexOf("async function studioIdeaGenerationStatus", start);
  assert.ok(start >= 0 && end > start, "idea generation handler should exist");
  const handler = source.slice(start, end);

  assert.match(handler, /item4PulsePipelineStage\(env, "i1"/);
  assert.match(handler, /backend: "python"/);
  assert.doesNotMatch(handler, /phase6ScenarioState/);
  assert.doesNotMatch(handler, /studioIdeaCreateBatch/);
  assert.doesNotMatch(handler, /studioIdeaSetProfileOverrides/);
  assert.match(source, /version: "0\.10\.361-idea-python-direct"/);
});

test("Studio UI accepts synchronous Python I1 completion", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /result\.completed \|\| result\.status === "Complete"/);
  assert.match(source, /created_count/);
  assert.match(source, /timeoutMs: 120000/);
});
