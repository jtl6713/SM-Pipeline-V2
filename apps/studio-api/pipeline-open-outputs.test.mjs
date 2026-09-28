import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Pipeline keeps unfinished packages via open-output merge", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-0625.js"), "utf8");
  assert.match(worker, /function studioPipelineOpenOutputFormula/);
  assert.match(worker, /function mergePipelineOutputRecords/);
  assert.match(worker, /function listPipelineOutputsForContentIds/);
  assert.match(worker, /function listPipelineContentByIds/);
  assert.match(worker, /CI 206/);
  assert.match(worker, /Pull every sibling on unfinished packages/);
  assert.match(worker, /clampLimit\(url, 200, 250\)/);
  assert.match(worker, /version: "0\.10\.417-pipeline-open-packages"/);
  assert.match(worker, /FIND\("Manual Action",\{TikTok_Draft_Status\}/);
  assert.match(app, /\/api\/outputs\?limit=250/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.414-pipeline-open-packages"/);
  assert.match(app, /function partitionPipelineGroups/);
  assert.match(app, /pipelineContentGroupFullyPublished/);
});
