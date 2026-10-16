import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const js = fs.readFileSync(path.join(here, "assets/factory-desk.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/factory-layout-0680.css"), "utf8");

test("Factory batch UI has selection, activity, refresh, inspect and failed-only retry", () => {
  new Function(js); // Parse the production browser script without executing browser globals.
  for (const id of ["factoryBatchActivity", "factoryBatchSummary", "factoryBatchDetails",
    "factoryBatchSelectionCount", "factoryBatchSubmit", "factoryBatchClear",
    "factoryBatchInspect", "factoryBatchRetry", "factoryBatchRefresh"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /data-factory-select-content/);
  assert.match(js, /data-factory-select-output/);
  assert.match(js, /new Set\(\)/);
  assert.match(js, /localStorage\.setItem\(FACTORY_SELECTION_KEY/);
  assert.match(js, /record_ids: ready\.map/);
  assert.match(js, /request_id: requestId/);
  assert.match(js, /already_running && !batch\.already_submitted/);
  assert.match(js, /refreshFactoryBatchActivity\(\)\.catch/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /action: "retry"/);
  assert.match(css, /position:sticky/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test("Factory submit returns after durable enqueue rather than awaiting 20 approvals", () => {
  const start = js.indexOf("async function submitFactoryBatchApprovals");
  const end = js.indexOf("async function retryFactoryBatchFailures", start);
  assert.ok(start > 0 && end > start);
  const submit = js.slice(start, end);
  assert.match(submit, /await fetchJson\("\/api\/factory\/approval-batches"/);
  assert.doesNotMatch(submit, /await watchApproveAll/);
  assert.match(submit, /Never wait for all approvals/);
  assert.match(html, /factory-desk\.js\?v=0\.6\.706-tiktok-live-copy/);
});
