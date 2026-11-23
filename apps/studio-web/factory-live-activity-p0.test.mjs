import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const start = source.indexOf("  function factoryBatchActivityEnvelope(");
const finish = source.indexOf("  function renderFactoryBatchActivity(", start);
assert.ok(start > 0 && finish > start);

function fixture() {
  const state = { submissionPreview: null, batch: null, completedOpen: false };
  const renders = [];
  const helpers = new Function(
    "factoryProfileId", "newFactoryRequestId", "state", "renderFactoryBatchActivity",
    source.slice(start, finish) +
      "\nreturn {show: factoryShowSubmissionPreview, dismiss: factoryDismissSubmissionPreview," +
      "preview: factorySubmissionPreview, reconcile: factoryReconcileSubmissionPreview," +
      "unconfirmed: factoryMarkSubmissionUnconfirmed, merge: factoryBatchMergeAcceptedActivity," +
      "discovered: factoryBatchMergeDiscoveredActivity};"
  )(() => null, () => "local_20261123_123456", state, batch => renders.push(batch));
  return { state, renders, ...helpers };
}
const card = (n, city = "recNYC") => ({
  id: "recOutput" + n, output_id: 11000 + n, profile_id: city,
  title: "Selected output " + n, platform: "Instagram", studio_output_type: "Carousel",
});
const accepted = (request, items) => ({
  group: true, job_id: "fg_" + request, request_id: request, status: "running",
  total: items.length, done_count: 0, approved_count: 0,
  pending_count: items.length, failed_count: 0, profile_ids: ["recNYC"],
  items: items.map(item => ({ ...item, status: "pending", phase: "queued" })),
});

test("selected outputs paint immediately at zero without claiming server acceptance", () => {
  const f = fixture();
  f.show([card(1), card(2, "recChicago")]);
  const row = f.state.submissionPreview;
  assert.equal(f.renders.length, 1, "first paint happens synchronously on click");
  assert.equal(row.request_id, null, "never invent a server receipt");
  assert.equal(row.status, "submitting");
  assert.equal(row.total, 2);
  assert.equal(row.pending_count, 2);
  assert.equal(row.done_count, 0);
  assert.equal(row.children.length, 2);
  assert.ok(row.items.every(item => item.local_preview && item.phase === "submitting"));
  assert.equal(f.state.batch, null, "local preview never becomes canonical activity");
});

test("acknowledged chunks remove only their matching local preview items", () => {
  const f = fixture();
  f.show([card(1), card(2), card(3)]);
  let activity = f.merge(null, accepted("factory_original_20261123_a", [card(1),card(2)]));
  const waiting = f.reconcile(activity.batches);
  assert.equal(waiting.total, 1);
  assert.equal(waiting.items[0].id, card(3).id);
  assert.equal(activity.totals.pending + waiting.pending_count, 3);
  activity = f.merge(activity, accepted("factory_original_20261123_b", [card(3)]));
  assert.equal(f.reconcile(activity.batches), null);
  assert.equal(f.state.submissionPreview, null);
  assert.equal(activity.totals.pending, 3);
});

test("uncertain network receipt remains visibly unconfirmed, preflight failure clears it", () => {
  const f = fixture();
  f.show([card(1)]);
  f.unconfirmed();
  assert.equal(f.state.submissionPreview.status, "awaiting_acceptance");
  assert.equal(f.state.submissionPreview.items[0].phase, "checking_acceptance");
  f.dismiss();
  assert.equal(f.state.submissionPreview, null);
  assert.equal(f.renders.length, 3);
});

test("slow discovery never rolls back newer exact progress", () => {
  const f = fixture();
  const previous = f.merge(null, {
    ...accepted("factory_progress_20261123", [card(1)]),
    status: "completed", pending_count: 0, done_count: 1, approved_count: 1,
    items: [{ ...card(1), status: "approved" }],
  });
  const stale = accepted("factory_progress_20261123", [card(1)]);
  const result = f.discovered(previous, {
    view:"active", filter_profile_id:null, batches:[stale], totals:{},
  });
  assert.equal(result.batches[0].done_count,1);
  assert.equal(result.batches[0].approved_count,1);
});

test("status path isolates partial failures and never submits again", () => {
  const polling = source.slice(source.indexOf("async function refreshFactoryBatchActivity("),
    source.indexOf("async function refreshFactoryCompletedBatches("));
  assert.match(polling, /Promise\.allSettled\(fastGroups/);
  assert.match(polling, /outcomes\.filter\(row => row\.status === "fulfilled"\)/);
  assert.match(polling, /batchActivityPartialError/);
  assert.match(polling, /if \(state\.batchRefreshRequested\)/);
  assert.match(polling, /discoveryAge >= 60000/);
  assert.doesNotMatch(polling, /method:\s*["']POST["']/);
  assert.match(source, /factoryShowSubmissionPreview\(clickedCards\);/);
  assert.match(source, /renderFactoryBatchActivity\(state\.batch\);\s*syncFactoryFilterOptions\(\)/);
});
