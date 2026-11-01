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
const layout=read("assets/factory-layout-0680.css");

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
 assert.match(desk,/includeOtherProfiles \|\| factoryMatchesProfile\(card\)/);
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
  for (const id of ["factoryBatchCompletedToggle", "factoryBatchCompletedClose", "factoryBatchCompletedPrev",
    "factoryBatchCompletedNext", "factoryBatchCompletedPage", "factoryBatchListHeading"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Active approvals/);
  assert.match(html, /Completed Batches/);
  const load = desk.slice(desk.indexOf("async function refreshFactoryBatchActivity("),
    desk.indexOf("async function submitFactoryGlobalApprovalBatches("));
  assert.match(load, /params\.set\("view", "active"\)/);
  assert.match(load, /async function refreshFactoryCompletedBatches\(offset = 0\)/);
  assert.match(load, /view: "completed", offset: String\(offset\)/);
  const initial = desk.slice(desk.indexOf("async function loadFactoryDesk("),
    desk.indexOf('  $("factoryFeedbackForm")'));
  assert.doesNotMatch(initial, /refreshFactoryCompletedBatches/);
  const timer = desk.slice(desk.indexOf("async function loadFactoryDesk("));
  assert.match(timer, /refreshFactoryBatchActivity\(true\)/);
  assert.match(timer, /function setFactoryCompletedOpen\(open\)[^]*?refreshFactoryCompletedBatches\(0\)/);
  assert.match(timer, /factoryBatchCompletedToggle[^]*?setFactoryCompletedOpen\(!state\.completedOpen\)/);
  assert.match(timer, /factoryBatchCompletedClose[^]*?setFactoryCompletedOpen\(false\)/);
  assert.match(timer, /factoryBatchCompletedNext[^]*?state\.completedOffset \+ 20/);
  assert.match(desk, /previousActive\.some\(row => !liveIds\.has\(row\.job_id\)\)/);
});

test("Factory batch counts and status never overlap the full-width progress rail", () => {
  const renderer = desk.slice(desk.indexOf('return `<button type="button" class="factory-batch-recent-row'),
    desk.indexOf(': \'<p class="subtle">\''));
  assert.ok(renderer.includes('class="factory-batch-recent-info"'));
  const counts = renderer.indexOf('${Number(row.approved_count)||0} approved');
  const status = renderer.indexOf('class="factory-batch-recent-result"');
  const progress = renderer.indexOf('class="factory-batch-mini-progress"');
  assert.ok(counts > 0 && counts < status && status < progress,
    "counts, status and progress must be separate siblings in DOM order");
  assert.match(layout, /\.factory-batch-recent-row\.factory-batch-activity-choice\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\) max-content/);
  assert.match(layout, /grid-template-areas:"info status" "progress progress"/);
  assert.match(layout, /\.factory-batch-activity-choice \.factory-batch-recent-info\{[^}]*grid-area:info/);
  assert.match(layout, /\.factory-batch-activity-choice \.factory-batch-recent-result\{[^}]*grid-area:status/);
  assert.match(layout, /\.factory-batch-activity-choice \.factory-batch-mini-progress\{[^}]*grid-area:progress;[^}]*position:static/);
  assert.match(layout, /width:100%;max-width:none;height:5px/);
  assert.match(layout, /grid-template-areas:"info" "status" "progress"/);
  assert.doesNotMatch(layout, /max-width:260px|position:absolute;left:10px/);
  assert.match(desk, /style="width:\$\{percent\}%"/);
});

test("Factory Quality Agent starts collapsed, expands via native accessible disclosure, and keeps metric visible", () => {
 const factory=html.match(/<details class="factory-batch-quality-panel factory-global-quality"[^]*?<\/details>/)?.[0];
 assert.ok(factory, "Factory Quality Agent uses a native disclosure");
 assert.doesNotMatch(factory.slice(0, factory.indexOf(">")), /\sopen(?:\s|=|$)/, "starts collapsed");
 const summary=factory.match(/<summary[^>]*>[^]*?<\/summary>/)?.[0];
 assert.ok(summary, "summary is the click/keyboard toggle");
 assert.match(summary, /id="factoryBatchQualityHeading"[^>]*>Quality Agent/);
 assert.match(summary, /id="factoryBatchQualityMetric"[^>]*aria-live="polite"/);
 assert.match(factory.slice(factory.indexOf("</summary>")), /id="factoryBatchQualityRefresh"/);
 assert.match(factory.slice(factory.indexOf("</summary>")), /id="factoryBatchQualitySignals"/);
 assert.match(css, /#factoryBatchQuality\[open\] \.factory-batch-quality-toggle-hint/);
 assert.match(css, /#factoryBatchQuality > \.factory-batch-quality-toggle:focus-visible/);
 assert.match(quality, /factoryBatchQualityMetric/);
 assert.match(html, /<section class="factory-batch-quality-panel" id="operationsFactoryBatchQuality"/,
   "Operations Quality Agent remains independent");
});
