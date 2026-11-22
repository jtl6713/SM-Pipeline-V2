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
