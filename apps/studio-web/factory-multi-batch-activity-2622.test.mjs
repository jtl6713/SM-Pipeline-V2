import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");

// Evaluate only the pure display helpers, never browser initialization or API calls.
const start = src.indexOf("  function factoryBatchActivityEnvelope(");
const render = src.indexOf("  function renderFactoryBatchActivity(", start);
assert.ok(start > -1 && render > start, "Factory batch projection must be present");
const display = new Function("factoryProfileId", src.slice(start, render) +
  "\nreturn {merge: factoryBatchMergeAcceptedActivity, discovered: factoryBatchMergeDiscoveredActivity, recount: factoryBatchRecountActive, active: factoryBatchActiveRow};")(() => null);

const pollStart = src.indexOf("  function factoryBatchMergeExactActivity(");
const pollEnd = src.indexOf("  function factoryBatchPreferExactProgress(", pollStart);
assert.ok(pollStart > 0 && pollEnd > pollStart);
const poll = new Function("factoryBatchRecountActive", "factoryBatchActiveRow", "factoryProfileId",
  src.slice(pollStart, pollEnd) +
  "\nreturn {exact: factoryBatchMergeExactActivity, window: factoryBatchPollWindow};")(
  display.recount, display.active, () => null);

function group(index, count = 20) {
  const request_id = "factory_large_batch_" + index + "_20261122";
  const items = Array.from({length: count}, (_, n) => ({
    id: "recTest" + index + "_" + n, output_id: 12000 + index * 100 + n,
    profile_id: "recNYCTest", status: "pending",
  }));
  return {ok: true, group: true, job_id: "fg_" + request_id, request_id,
    profile_ids:["recNYCTest"], status:"running", total:count,
    approved_count:0, pending_count:count, failed_count:0, items};
}

test("140 accepted Factory outputs retain all seven 20-output sub-batches", () => {
  let state = null;
  const original = Array.from({length:7},(_,index) => group(index));
  for (const batch of original) state = display.merge(state, batch);
  assert.equal(state.batches.length, 7);
  assert.equal(state.totals.batches, 7);
  assert.equal(state.totals.active, 7);
  assert.equal(state.totals.pending, 140);
  assert.equal(new Set(state.batches.flatMap(batch => batch.items.map(row => row.id))).size, 140);
  // Duplicate acknowledgments are read-only and replace their own entry.
  state = display.merge(state, original[3]);
  assert.equal(state.batches.length, 7);
  assert.equal(state.totals.pending, 140);
  // An incomplete/slow R2 global discovery cannot erase locally accepted IDs.
  const partial = display.discovered(state, {ok:true,view:"active",filter_profile_id:null,
    batches:[original[0]],totals:{active:1,pending:20}});
  assert.equal(partial.batches.length, 7);
  assert.equal(partial.totals.pending, 140);
});

test("read-only exact polling fairly visits every accepted group with at most four GETs per tick", () => {
  const groups = Array.from({length:7},(_,i) => group(i));
  let cursor = 0;
  const seen = new Set();
  for (let tick=0;tick<3;tick++) {
    const next = poll.window(groups,cursor,4);
    assert.ok(next.groups.length <= 4);
    for (const batch of next.groups) seen.add(batch.request_id);
    cursor = next.next;
  }
  assert.equal(seen.size,7, "no starvation of later sub-batches");
  assert.equal(poll.window([],12,4).groups.length,0);
});

test("exact R2 receipts add rehydrated original groups and cleanly remove completed groups", () => {
  const groups = Array.from({length:7},(_,i) => group(i));
  const reloaded = poll.exact(null,[groups[6]]);
  assert.equal(reloaded.batches.length,1, "new device session can hydrate via original request ID");
  assert.equal(reloaded.batches[0].request_id,groups[6].request_id);
  let state = null;
  for (const batch of groups) state = display.merge(state,batch);
  const completed = groups.slice(0,4).map(batch => ({
    ...batch,status:"completed",approved_count:20,pending_count:0,
    items:batch.items.map(item=>({...item,status:"approved"})),
  }));
  const exact = poll.exact(state,completed);
  assert.equal(exact.batches.length,3, "completed groups leave Active status");
  assert.equal(exact.totals.pending,60);
  assert.equal(exact.totals.active,3);
  assert.equal(state.batches.length,7, "no source mutation");
});

test("accepted request IDs persist across reload, bounded and deduplicated", () => {
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key,value) => storage.set(key,value),
  };
  const from = src.indexOf('  const FACTORY_RECENT_GROUPS_KEY = ');
  const to = src.indexOf('  // Reuse the one global missing-asset image;',from);
  assert.ok(from > 0 && to > from);
  const tracker = new Function("localStorage",src.slice(from,to) +
    "\nreturn {read: recentFactoryGroupRequests, remember: rememberFactoryGroupRequest, forget: forgetFactoryGroupRequests};")(localStorage);
  for(let i=0;i<7;i++)tracker.remember(group(i));
  tracker.remember(group(2));
  assert.equal(tracker.read().length,7);
  assert.ok(tracker.read().every(row=>row.profiles.includes("recNYCTest")));
  tracker.forget([group(4).request_id]);
  assert.equal(tracker.read().length,6);
  // Age out stale IDs; no stale request may turn into a POST.
  assert.equal(tracker.read(Date.now()+49*60*60*1000).length,0);
  assert.match(src,/rememberFactoryGroupRequest\(batch\);\s*renderFactoryBatchActivity\(factoryBatchMergeAcceptedActivity\(state\.batch, batch\)\)/);
  assert.match(src,/factoryBatchPollWindow\(\[\.\.\.knownGroups, \.\.\.remembered\]/);
  const pollingCode = src.slice(src.indexOf("async function refreshFactoryBatchActivity("),
    src.indexOf("async function refreshFactoryCompletedBatches("));
  assert.doesNotMatch(pollingCode,/method:\s*["']POST["']/,
    "Status recovery must be GET-only");
});
