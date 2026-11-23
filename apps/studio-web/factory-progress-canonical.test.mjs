import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const path = new URL("./assets/factory-desk.js", import.meta.url);
const source = readFileSync(path, "utf8");
const start = source.indexOf("  function factoryBatchDisplayCounts(items) {");
const end = source.indexOf("  function renderFactoryBatchActivity(batch) {", start);
assert.ok(start >= 0 && end > start, "Factory display projection exists");
// Evaluate only the pure presentation helpers, not browser code or network.
const project = new Function(source.slice(start, end) + "\nreturn factoryBatchDisplayRow;")();

test("14 submitted outputs show 9/14 and 64% despite R2's 0/14 bookkeeping", () => {
  const profiles = ["chi", "mia", "nyc"];
  const items = Array.from({ length: 14 }, (_, i) => ({
    id: "rec" + i, output_id: 11031 + i,
    profile_id: i < 3 ? profiles[0] : i < 11 ? profiles[1] : profiles[2],
    status: "pending", phase: "queued",
  }));
  const approved = [0,1,2,3,4,5,11,12,13].map(i => items[i].id);
  const row = {
    group: true, request_id: "same", total: 14,
    status: "running", approved_count: 0, pending_count: 14, done_count: 0,
    items,
    children: profiles.map(profile_id => ({
      profile_id, total: items.filter(x => x.profile_id === profile_id).length,
      approved_count: 0, pending_count: items.filter(x => x.profile_id === profile_id).length,
    })),
    progress_verification: { status: "verified", approved_item_ids: approved },
  };
  const display = project(row);
  assert.equal(display.approved_count, 9);
  assert.equal(display.pending_count, 5);
  assert.equal(display.done_count, 9);
  assert.equal(Math.round(100 * display.done_count / display.total), 64);
  assert.deepEqual(display.children.map(child => child.approved_count), [3, 3, 3]);
  assert.deepEqual(display.children.map(child => child.pending_count), [0, 5, 0]);
  assert.equal(display.progress_lag, 9);
  assert.equal(row.approved_count, 0, "immutable R2 source");
  assert.equal(row.items[0].status, "pending", "no canonical write from presentation");
});
test("wrong or unavailable canonical status cannot inflate R2 progress", () => {
  const item = { id: "rec1", status: "pending" };
  const basic = { group:true, total:1, items:[item], approved_count:0,
    pending_count:1, progress_verification:{status:"unavailable",approved_item_ids:["rec1"]} };
  assert.equal(project(basic), basic);
  assert.equal(project({...basic,progress_verification:{status:"verified",approved_item_ids:["different"]}}).approved_count, 0);
});
test("visible active batch count does not use stale state.batch.totals.batches", () => {
  assert.match(source, /if \(count\) count\.textContent = String\(state\.completedOpen/);
  assert.doesNotMatch(source, /if \(count\) count\.textContent = String\(state\.batch\?\.totals\?\.batches/);
});

function extractFactoryHelpers(from, to, returnExpression, args = []) {
  const fromIndex = source.indexOf(from);
  const toIndex = source.indexOf(to, fromIndex);
  assert.ok(fromIndex >= 0 && toIndex > fromIndex, "Factory polling helper must remain extractable");
  return new Function(...args, source.slice(fromIndex, toIndex)
    + "\nreturn " + returnExpression + ";");
}

const normalizeActivity = extractFactoryHelpers(
  "  function factoryBatchActivityEnvelope(", "  function renderFactoryBatchActivity(",
  "factoryBatchActivityEnvelope", ["factoryProfileId"])(() => null);
const pollingHelpers = extractFactoryHelpers(
  "  function factoryBatchPreferExactProgress(", "  async function refreshFactoryBatchActivity(",
  "({ prefer: factoryBatchPreferExactProgress, read: factoryBatchPollWithFallback })")();

test("new group POST is immediately normalized to one visible, exactly pollable active batch", () => {
  const items = [10992, 10993].map((number, index) => ({
    id: "rec" + number, output_id: number, profile_id: "recNYC", status: "pending",
  }));
  const response = {
    ok: true, group: true, job_id: "fg_original_request", request_id: "original_request",
    status: "running", total: 2, approved_count: 0, pending_count: 2, failed_count: 0,
    items, children: [{profile_id: "recNYC", total: 2, pending_count: 2}],
  };
  const envelope = normalizeActivity(response);
  assert.equal(envelope.filter_profile_id, null);
  assert.equal(envelope.batches.length, 1);
  assert.equal(envelope.batches[0].request_id, "original_request");
  assert.equal(envelope.totals.active, 1);
  assert.equal(envelope.totals.pending, 2);
  assert.equal(envelope.batches[0].items[0].status, "pending", "normalization is read-only");
  assert.equal(pollingHelpers.prefer(1, 0, Date.now(), false), true,
    "no full discovery required to start exact-ID polling");
  assert.equal(pollingHelpers.prefer(1, Date.now() - 30000, Date.now(), true), true,
    "forced Refresh Activity still prioritizes the known request");
  assert.equal(pollingHelpers.prefer(0, 0, Date.now(), true), false);
  assert.equal(normalizeActivity(envelope), envelope, "no second normalization");
});

test("global history timeout falls back to exact original-ID read and paints 2/2", async () => {
  const items = [10992, 10993].map(n => ({
    id: "rec" + n, output_id: n, profile_id: "recNYC", status: "pending", phase: "queued",
  }));
  const original = normalizeActivity({
    group: true, job_id: "fg_original_request", request_id: "original_request",
    status: "running", total: 2, approved_count: 0, pending_count: 2,
    failed_count: 0, items,
    children: [{profile_id: "recNYC", total: 2, approved_count: 0, pending_count: 2}],
  });
  let fullCalls = 0, exactCalls = 0;
  const exact = {
    ...original.batches[0],
    progress_verification: {
      status: "verified", approved_item_ids: items.map(item => item.id),
    },
  };
  const received = await pollingHelpers.read({
    preferExact: false, hasKnownGroups: original.batches.length > 0,
    readFull: async () => { fullCalls++; throw Error("Global history timed out"); },
    readExact: async () => { exactCalls++; return { batches: [exact] }; },
  });
  const shown = project(received.batches[0]);
  assert.equal(fullCalls, 1);
  assert.equal(exactCalls, 1, "no fallback to POST or global history retry");
  assert.equal(shown.approved_count, 2);
  assert.equal(shown.pending_count, 0);
  assert.equal(shown.done_count, 2);
  assert.equal(shown.progress_lag, 2);
  assert.equal(original.batches[0].pending_count, 2, "R2 ledger preserved untouched");
  await assert.rejects(pollingHelpers.read({
    preferExact: false, hasKnownGroups: false,
    readFull: async () => { throw Error("Unknown activity"); },
    readExact: async () => { throw Error("Must not request unknown ID"); },
  }), /Unknown activity/);
});

test("production Factory rendering and refresh are actually wired to exact-first functions", () => {
  assert.match(source, /const snapshot = factoryBatchActivityEnvelope\(batch\)/);
  assert.match(source, /const preferExact = factoryBatchPreferExactProgress\(fastGroups\.length,/);
  assert.match(source, /const fetched = await factoryBatchPollWithFallback\(/);
  assert.match(source, /request_id: row\.request_id, fresh: String\(now\)/);
  assert.match(source, /verifiedRow\?\.request_id !== row\.request_id/);
});

test("ordinary active and completed snapshots do not require a Factory profile filter", () => {
  // Completed/history rendering may be invoked in isolated contexts without
  // Factory profile controls. Never evaluate the profile filter for envelopes.
  const normalizeWithoutProfile = extractFactoryHelpers(
    "  function factoryBatchActivityEnvelope(", "  function renderFactoryBatchActivity(",
    "factoryBatchActivityEnvelope")();
  for (const view of ["active", "completed"]) {
    const snapshot = { view, batches: [], totals: { batches: 0 } };
    assert.equal(normalizeWithoutProfile(snapshot), snapshot);
  }
});
