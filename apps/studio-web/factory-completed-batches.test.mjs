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
    "factoryBatchCompletedClose", "factoryBatchActiveCollapse",
    "factoryBatchCompletedPrev", "factoryBatchCompletedNext", "factoryBatchCompletedPage",
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, {
    innerHTML: "", textContent: "", hidden: false,
    setAttribute() {}, addEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
  }]));
  nodes.factoryBatchRecentList.querySelectorAll = (selector) => {
    if (selector !== "[data-factory-activity-key]") return [];
    const buttons = [...nodes.factoryBatchRecentList.innerHTML.matchAll(/data-factory-activity-key="([^"]+)"/g)]
      .map((match) => ({
        key: match[1],
        getAttribute(name) { return name === "data-factory-activity-key" ? this.key : null; },
        addEventListener(name, handler) { if (name === "click") this.click = handler; },
      }));
    nodes.factoryBatchRecentList.buttons = buttons;
    return buttons;
  };
  const state = {
    completedOpen: false, activeApprovalsCollapsed: false, completedBatch: null, completedLoading: false,
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
  assert.equal(nodes.factoryBatchCompletedClose.hidden, true, "Close button stays hidden in active view");
  assert.equal(nodes.factoryBatchActiveCollapse.hidden, false, "Active collapse control is visible");
  assert.equal(nodes.factoryBatchCompletedPrev.hidden, true, "Previous stays hidden in active view");
  assert.equal(nodes.factoryBatchCompletedNext.hidden, true, "Next stays hidden in active view");
  assert.equal(nodes.factoryBatchCompletedPage.hidden, true, "Pagination label stays hidden in active view");
  assert.match(nodes.factoryBatchRecentList.innerHTML, /No active approval batches/);
  assert.equal(nodes.factoryBatchMetricValue.textContent,"0");

  state.completedOpen = true;
  const completed = { view:"completed",batches:[job("fg_batch123","24 Outputs")],
    totals:{batches:1,active:0,approved:24,pending:0,failed:0},has_more:false };
  render(completed);
  assert.equal(nodes.factoryBatchCompletedClose.hidden, false, "Completed view exposes header close button");
  assert.equal(nodes.factoryBatchActiveCollapse.hidden, true, "Completed history hides active collapse control");
  assert.equal(nodes.factoryBatchCompletedToggle.hidden, true, "Completed history uses Close rather than duplicate Back button");
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
  assert.equal(nodes.factoryBatchCompletedClose.hidden, true, "Closing completed history restores active header");
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


test("clicking the same active batch twice collapses its details; another batch opens normally", () => {
  const {state,nodes,render}=viewHarness();
  state.batchDetailsOpen=false;
  const active = {view:"active",batches:[
    {...job("fg_batchA","First"),status:"running",approved_count:2,pending_count:22},
    {...job("fg_batchB","Second"),status:"running",approved_count:4,pending_count:20},
  ]};
  render(active);
  assert.equal(nodes.factoryBatchDetails.hidden,true);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/aria-expanded="false"/);

  nodes.factoryBatchRecentList.buttons[0].click();
  assert.equal(state.inspectedBatchKey,"fg_batchA");
  assert.equal(nodes.factoryBatchDetails.hidden,false);
  assert.match(nodes.factoryBatchRecentList.innerHTML,/data-factory-activity-key="fg_batchA" aria-pressed="true"\s+aria-expanded="true"/);

  nodes.factoryBatchRecentList.buttons[0].click();
  assert.equal(nodes.factoryBatchDetails.hidden,true,"Second click should collapse the batch");
  assert.equal(state.batchDetailsOpen,false);
  render(active); // Background status polling must not reopen the collapsed batch.
  assert.equal(nodes.factoryBatchDetails.hidden,true);

  nodes.factoryBatchRecentList.buttons[1].click();
  assert.equal(state.inspectedBatchKey,"fg_batchB");
  assert.equal(nodes.factoryBatchDetails.hidden,false);
  nodes.factoryBatchRecentList.buttons[1].click();
  assert.equal(nodes.factoryBatchDetails.hidden,true);
});

test("completed batch rows also collapse on second click without replacing active activity", () => {
  const {state,nodes,render}=viewHarness();
  state.batchDetailsOpen=false;
  const active={view:"active",batches:[],totals:{batches:0}};
  render(active);
  state.completedOpen=true;
  render({view:"completed",batches:[job("fg_completedA","Finished")],totals:{batches:1}});
  nodes.factoryBatchRecentList.buttons[0].click();
  assert.equal(nodes.factoryBatchDetails.hidden,false);
  nodes.factoryBatchRecentList.buttons[0].click();
  assert.equal(nodes.factoryBatchDetails.hidden,true);
  assert.equal(state.batch,active,"Completed view must not overwrite active state");
});

test("completed header Close control is wired to the shared active-view transition", () => {
  const html = readFileSync(join(here, "index.html"), "utf8");
  assert.match(html, /id="factoryBatchCompletedClose"[^>]*aria-label="Close completed approvals and return to active approvals"[^>]*hidden/);
  assert.match(source, /\$\("factoryBatchCompletedClose"\)\?\.addEventListener\("click", \(\) => setFactoryCompletedOpen\(false\)\)/);
  assert.match(source, /\$\("factoryBatchCompletedToggle"\)\?\.addEventListener\("click", \(\) => setFactoryCompletedOpen\(!state\.completedOpen\)\)/);
});

test("Factory action controls are visually hidden when the DOM hidden property is set", () => {
  const css = readFileSync(join(here, "assets/factory-layout-0680.css"), "utf8");
  const html = readFileSync(join(here, "index.html"), "utf8");
  assert.match(css, /#page-factory\s+\.factory-batch-activity\s+\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  for (const id of ["factoryBatchCompletedClose", "factoryBatchCompletedPrev", "factoryBatchCompletedNext", "factoryBatchCompletedPage"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*\\bhidden\\b`), `${id} must start hidden before the first activity fetch`);
  }
});

test("Factory navigation stays above active rows; collapsing preserves live totals", () => {
  const html = readFileSync(join(here, "index.html"), "utf8");
  const panel = html.slice(html.indexOf('id="factoryBatchActivity"'), html.indexOf('id="factoryBatchQuality"'));
  const rowAt = panel.indexOf('id="factoryBatchRecentList"');
  assert.ok(rowAt > 0);
  for (const id of ["factoryBatchRefresh", "factoryBatchCompletedToggle", "factoryBatchActiveCollapse",
    "factoryBatchCompletedClose", "factoryBatchCompletedPrev", "factoryBatchCompletedNext"]) {
    const at = panel.indexOf('id="' + id + '"');
    assert.ok(at >= 0 && at < rowAt, id + " must precede the batch list");
  }
  assert.match(panel, /id="factoryBatchActiveCollapse"[^>]*aria-expanded="true"[^>]*aria-controls="factoryBatchRecentList factoryBatchDetails"/);
  assert.ok(source.includes('$("factoryBatchActiveCollapse")?.addEventListener("click"'));
  const {state,nodes,render} = viewHarness();
  const active = {view:"active",batches:[{...job("fg_active","First"), status:"running", pending_count:4}],
    totals:{batches:1,active:1,approved:20,pending:4,failed:0}};
  render(active);
  assert.equal(nodes.factoryBatchRecentList.hidden,false);
  state.activeApprovalsCollapsed = true;
  render(active);
  assert.equal(nodes.factoryBatchRecentList.hidden,true);
  assert.equal(nodes.factoryBatchDetails.hidden,true);
  assert.equal(nodes.factoryBatchInspect.hidden,true);
  assert.equal(nodes.factoryBatchRetry.hidden,true);
  assert.equal(nodes.factoryBatchActiveCollapse.textContent,"Expand list");
  assert.match(nodes.factoryBatchSummary.textContent,/4 pending/);
  assert.equal(nodes.factoryBatchMetricValue.textContent,"1");
  render(active); // Status polling must not expand the list.
  assert.equal(nodes.factoryBatchRecentList.hidden,true);
  state.completedOpen=true;
  render({view:"completed",batches:[job("fg_complete","Done")],has_more:false});
  assert.equal(nodes.factoryBatchRecentList.hidden,false);
  assert.equal(nodes.factoryBatchCompletedPage.hidden,true,"No pagination for a single completed page");
  assert.equal(nodes.factoryBatchCompletedClose.hidden,false);
  state.completedOpen=false;
  render(active);
  assert.equal(nodes.factoryBatchRecentList.hidden,true,"Returning to active restores collapsed state");
  state.activeApprovalsCollapsed=false;
  render(active);
  assert.equal(nodes.factoryBatchRecentList.hidden,false);
  assert.equal(nodes.factoryBatchActiveCollapse.textContent,"Collapse list");
});

test("Completed pagination is only visible when more than one page exists", () => {
  const {state,nodes,render}=viewHarness();
  render({view:"active",batches:[],totals:{batches:0}});
  state.completedOpen=true;
  render({view:"completed",batches:[job("fg_one","Completed")],has_more:true});
  assert.equal(nodes.factoryBatchCompletedPage.hidden,false);
  assert.equal(nodes.factoryBatchCompletedNext.hidden,false);
  assert.equal(nodes.factoryBatchCompletedPrev.hidden,true);
  state.completedOffset=20;
  render({view:"completed",batches:[job("fg_two","Older")],has_more:false});
  assert.equal(nodes.factoryBatchCompletedPage.hidden,false);
  assert.equal(nodes.factoryBatchCompletedNext.hidden,true);
  assert.equal(nodes.factoryBatchCompletedPrev.hidden,false);
});
