import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const home = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.join(home,file),"utf8");
const html=read("index.html");
const desk=read("assets/factory-desk.js");
const quality=read("assets/factory-batch-quality-0710.js");
const css=read("assets/factory-batch-quality-0710.css");

test("Factory is global by default with an independent optional profile filter", () => {
 new Function(desk);
 new Function(quality);
 assert.match(html,/id="factoryProfileFilter"/);
 assert.match(html,/<option value="">All Profiles<\/option>/);
 assert.match(desk,/function factoryProfileId\(/);
 assert.match(desk,/function factoryMatchesProfile\(/);
 assert.match(desk,/syncFactoryFilterOptions\(\)/);
 assert.match(desk,/new URLSearchParams\(\{ scope: "all" \}\)/);
 assert.match(desk,/params\.set\("factory_profile", factoryProfileId\(\)\)/);
 assert.doesNotMatch(desk.slice(desk.indexOf("async function refreshFactoryBatchActivity"),
    desk.indexOf("async function submitFactoryBatchApprovals")),/studioProfileSelect/);
 assert.match(quality,/new URLSearchParams\(\{ scope: "all" \}\)/);
 assert.match(desk,/filter\(factoryMatchesProfile\)/);
});

test("Factory counts and Quality Agent appear as compact metrics; no raw IDs in ordinary rows", () => {
 for(const id of ["factoryBatchMetricValue","factoryBatchQualityMetric",
   "factoryBatchRecentList","factoryBatchUpdated","factoryBatchDetails"]) {
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(css,/factory-mini-metric/);
 assert.match(css,/factory-batch-recent-row/);
 assert.match(desk,/Output #\$\{esc\(card\.output_id\)\}/);
 assert.match(desk,/data-factory-copy-batch/);
 assert.match(desk,/factory-batch-technical/);
 assert.match(desk,/recent\.innerHTML = batches\.length/);
 assert.match(quality,/factoryBatchQualityMetric/);
});

test("Profile-scoped writes still use canonical submission and unchanged rollout rules", () => {
 assert.match(desk,/!global && profiles\.length!==1/);
 assert.match(desk,/if \(global\) \{\s*return submitFactoryGlobalApprovalBatches\(ready\);\s*\}/);
 assert.match(desk,/action: "start_group"/);
 assert.match(desk,/action: "start"/);
 assert.match(desk,/content_profile_id: profiles\[0\]/);
 assert.match(desk,/record_ids: ready\.map/);
 assert.match(desk,/already_running && !batch\.already_submitted/);
 assert.match(desk,/reconcileFinishedBatchDesk/);
});

test("Factory loads only active batches by default; completed history is explicit and paged", () => {
  new Function(desk);
  for (const id of ["factoryBatchCompletedToggle", "factoryBatchCompletedPrev",
    "factoryBatchCompletedNext", "factoryBatchCompletedPage", "factoryBatchListHeading"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Active approvals/);
  assert.match(html, /Completed Batches/);
  const load = desk.slice(desk.indexOf("async function refreshFactoryBatchActivity("),
    desk.indexOf("async function submitFactoryGlobalApprovalBatches("));
  assert.match(load, /params\\.set\\("view", "active"\\)/);
  assert.match(load, /async function refreshFactoryCompletedBatches\\(offset = 0\\)/);
  assert.match(load, /view: "completed", offset: String\\(offset\\)/);
  const initial = desk.slice(desk.indexOf("async function loadFactoryDesk("),
    desk.indexOf('  $("factoryFeedbackForm")'));
  assert.doesNotMatch(initial, /refreshFactoryCompletedBatches/);
  const timer = desk.slice(desk.indexOf("async function loadFactoryDesk("));
  assert.match(timer, /refreshFactoryBatchActivity\\(true\\)/);
  assert.match(timer, /factoryBatchCompletedToggle[^]*?refreshFactoryCompletedBatches\\(0\\)/);
  assert.match(timer, /factoryBatchCompletedNext[^]*?state\\.completedOffset \\+ 20/);
  assert.match(desk, /previousActive\\.some\\(row => !liveIds\\.has\\(row\\.job_id\\)\\)/);
});
