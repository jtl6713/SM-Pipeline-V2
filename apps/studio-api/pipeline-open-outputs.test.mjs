import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Pipeline keeps unfinished packages via open-output merge", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  assert.match(worker, /function studioPipelineOpenOutputFormula/);
  assert.match(worker, /STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT = 1000/);
  assert.match(worker, /function mergePipelineOutputRecords/);
  assert.match(worker, /function listPipelineOutputsForContentIds/);
  assert.match(worker, /function listPipelineContentByIds/);
  assert.match(worker, /CI 206/);
  assert.match(worker, /CI 143/);
  assert.match(worker, /Manual Fallback/);
  assert.match(worker, /Full packages for this page only/);
  assert.match(worker, /skip the open-output 1000 scan/);
  assert.match(worker, /clampLimit\(url, 200, 250\)/);
  assert.match(worker, /version: "0.10.520-pipeline-content-page"/);
  assert.match(worker, /FIND\("Manual Action",\{TikTok_Draft_Status\}/);
  assert.match(worker, /FIND\("Manual Fallback",\{TikTok_Draft_Status\}/);
  assert.match(worker, /manual fallback/);
  assert.match(app, /content_limit=\$\{PIPELINE_CONTENT_PAGE_SIZE\}/);
  assert.match(app, /mode=review&limit=80/);
  assert.match(app, /BUILD_ID = "item4-0.6.582-pipeline-content-page"/);
  assert.match(app, /function partitionPipelineGroups/);
  assert.match(app, /pipelineContentGroupFullyPublished/);
  assert.match(app, /matchingKeys/);
  assert.match(app, /Keep every sibling on a matching package/);
});
