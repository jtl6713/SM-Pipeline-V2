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
  assert.match(html, /factory-desk\.js\?v=0\.6\.\d+(?:-[a-z0-9-]+)?/i);
});

test("Finished durable batches reconcile the live Needs Eyes desk and clear selected row checkboxes", () => {
  const start = js.indexOf("async function reconcileFinishedBatchDesk(batch)");
  const end = js.indexOf("async function refreshFactoryBatchActivity(", start);
  assert.ok(start > 0 && end > start, "Terminal-state Desk reconciliation must be implemented");
  const reconcile = js.slice(start, end);
  assert.match(reconcile, /\["completed", "failed"\]\.includes\(batch\.status\)/);
  assert.match(reconcile, /item\.status === "approved" \|\| item\.status === "already_satisfied"/);
  assert.match(reconcile, /fetchJson\("\/api\/factory\/desk", \{ cache: "no-store" \}\)/);
  assert.match(reconcile, /renderDesk\(desk\)/);
  assert.match(reconcile, /confirmed\.every\(\(id\) => !stillReviewing\.has\(id\)\)/,
    "Stale read copies must be retried, not considered successfully reconciled");
  assert.match(js, /renderFactoryBatchActivity\(batch\);[\s\S]{0,180}reconcileFinishedBatchDesk\(batch\)\.catch/);
  assert.match(js, /ready\.forEach\(\(card\) => state\.selectedOutputs\.delete\(card\.id\)\);\s*saveFactorySelection\(\);[\s\S]{0,220}if \(state\.desk\) renderDesk\(state\.desk\);/,
    "Submitting must repaint DOM selection once the accepted IDs leave selectedOutputs");
});

test("Story v3 UI remains dormant while Reel v2 restricts selection", () => {
  const fn = js.slice(js.indexOf("function canSelectBatchOutput("),
    js.indexOf("function factoryProfileId(", js.indexOf("function canSelectBatchOutput(")));
  assert.match(fn, /chicago_ig_reel_story_v3/);
  assert.match(fn, /rollout.mode === "chicago_ig_reel_story_v3" && type === "Story"/);
  assert.match(fn, /String\(card\?\.profile_id \|\| ""\) === String\(rollout.profile_id \|\| ""\)/);
  assert.match(fn, /String\(card\?\.platform \|\| ""\) === "Instagram"/);
  assert.match(js, /Chicago Instagram pilot: select up to five Reels or Stories per batch/);
});
