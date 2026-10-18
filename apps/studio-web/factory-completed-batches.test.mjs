/**
 * Regression for missing Factory Completed Batches after a successful global
 * submission. The active feed deliberately excludes completed jobs; the view
 * must render the selected completed snapshot and preserve it during refresh.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const first = source.indexOf("  function renderFactoryBatchActivity(batch) {");
const last = source.indexOf("  // Batch status is independently polled", first);
assert.ok(first !== -1 && last > first);
const body = source.slice(first, last);

function viewHarness() {
  const ids = [
    "factoryBatchSummary", "factoryBatchMetricValue", "factoryBatchRecentList",
    "factoryBatchInspect", "factoryBatchRetry", "factoryBatchDetails",
    "factoryBatchUpdated", "factoryBatchListHeading", "factoryBatchCompletedToggle",
    "factoryBatchCompletedPrev", "factoryBatchCompletedNext", "factoryBatchCompletedPage",
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, {
    innerHTML: "", textContent: "", hidden: false,
    setAttribute() {}, addEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
  }]));
  const state = {
    completedOpen: false, completedBatch: null, completedLoading: false,
    completedOffset: 0, batch: null, batchDetailsOpen: true,
    inspectedBatchKey: "", submittingBatch: false,
  };
  const context = {
    state,
    $: id => nodes[id],
    esc: val => String(val ?? ""),
    factoryProfileLabel: profile => profile || "All Profiles",
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
  };
  const render = vm.runInNewContext(body + "\nrenderFactoryBatchActivity", context);
  return { state, nodes, render };
}
const job = (id, title) => ({
  job_id: id, request_id: id.slice(3), profile_id: "recTestProfileAAAA",
  status: "completed", group: true, profile_ids: ["recTestProfileAAAA"], total: 24, done_count: 24,
  approved_count: 24, pending_count: 0, failed_count: 0,
  created_at: "2026-10-17T22:00:00.000Z",
  items: [{id:"recTestOutputAAA",output_id: 5047,title,status:"approved"}],
});

test("completed history shows a 24-output batch when active activity has no rows", () => {
  const { state, nodes, render } = viewHarness();
  const emptyActive = { view:"active",batches:[],totals:{batches:0,active:0,pending:0,approved:0,failed:0} };
  render(emptyActive);
  assert.match(nodes.factoryBatchRecentList.innerHTML, /No active approval batches/);
  assert.equal(nodes.factoryBatchMetricValue.textContent,"0");

  state.completedOpen = true;
  const completed = { view:"completed",batches:[job("fg_batch123","24 Outputs")],
    totals:{batches:1,active:0,approved:24,pending:0,failed:0},has_more:false };
  render(completed);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/24 approved/);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/24 outputs/);
  assert.doesNotMatch(nodes.factoryBatchRecentList.innerHTML,/No completed batches/);
  assert.match(nodes.factoryBatchDetails.innerHTML,/24 \/ 24 processed/);
  assert.equal(state.completedBatch,completed);
  assert.equal(state.batch,emptyActive, "Completed fetch must not overwrite active snapshot");

  // The Completed Batches finally block re-renders using the active response.
  // Previously this replaced the completed list with zero active rows.
  render(state.batch);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/24 outputs/);
  assert.match(nodes.factoryBatchSummary.textContent,/24 approved/);
  assert.equal(nodes.factoryBatchListHeading.textContent,"Completed approvals");

  state.completedOpen = false;
  render(state.batch);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/No active approval batches/);
});

test("completed view renders a terminal per-profile batch as well as a global group", () => {
  const {state,nodes,render}=viewHarness();
  render({view:"active",batches:[],totals:{batches:0}});
  state.completedOpen=true;
  render({view:"completed",batches:[{...job("fb_job123","Finished reel"),group:false}],totals:{batches:1,approved:24}});
  assert.match(nodes.factoryBatchRecentList.innerHTML,/Finished reel/);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/24 approved/);
});
