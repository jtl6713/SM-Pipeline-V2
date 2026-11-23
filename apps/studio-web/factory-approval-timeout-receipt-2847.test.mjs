import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const start = script.indexOf("  function factoryPendingExactCandidates(");
const finish = script.indexOf("  function archiveFactoryPending()", start);
assert.ok(start > 0 && finish > start, "pending exact-ID helper exists");
const pendingCandidates = new Function(
  script.slice(start, finish) + "\nreturn factoryPendingExactCandidates;"
)();

const id = n => "recOutput" + n;
const rid = n => "factory_saved_request_" + n + "_20261123";
const plan = (n, output, profile = "recNYC") => ({
  request_id: rid(n), ids: [id(output)],
  payload: { items: [{ id: id(output), profile_id: profile }] },
});

test("global submission pending before POST acknowledgment is recoverable by original IDs", () => {
  const saved = {
    profile_id: "global", ids: [id(1), id(2)],
    batches: [plan(1, 1), plan(2, 2, "recChicago")],
  };
  assert.deepEqual(pendingCandidates(saved, []), [
    { request_id: rid(1), group: true, profile_id: null,
      profiles: ["recNYC"], expected_ids: [id(1)], unconfirmed: true },
    { request_id: rid(2), group: true, profile_id: null,
      profiles: ["recChicago"], expected_ids: [id(2)], unconfirmed: true },
  ]);
});

test("archived local approval includes exact original identity without claiming accepted", () => {
  const local = { profile_id: "recNYC", request_id: rid(3), ids: [id(3)] };
  const rows = pendingCandidates(null, [{key: "studio.factory.recovery.v2.1",saved: local}]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].request_id, rid(3));
  assert.equal(rows[0].group, false);
  assert.equal(rows[0].profile_id, "recNYC");
  assert.equal(rows[0].unconfirmed, true);
  assert.deepEqual(rows[0].expected_ids, [id(3)]);
});

test("malformed saved identities are never polled or accepted", () => {
  const invalid = {profile_id:"global",ids:[id(1)],batches:[
    {request_id:"bad",ids:[id(1)]},
    {request_id:rid(4),ids:["../bad"]},
  ]};
  assert.deepEqual(pendingCandidates(invalid, []), []);
  assert.deepEqual(pendingCandidates({profile_id:"somethingelse",request_id:rid(5),ids:[id(5)]}, []), []);
});

test("original pending IDs are deduplicated without inventing server acceptance", () => {
  const p = plan(6, 6);
  const saved = {profile_id:"global",ids:[id(6)],batches:[p]};
  assert.equal(pendingCandidates(saved,[{saved}]).length, 1);
  assert.match(script, /const pendingExact = factoryPendingExactCandidates\(\s*pendingFactoryApproval\(\), factoryRecoveryEntries\(\)\)/);
  assert.match(script, /row\.unconfirmed[\s\S]*?actual\.some\(\(id, index\) => id !== expected\[index\]\)/);
  assert.match(script, /Saved Factory request identity mismatch; no approval was repeated/);
});

test("failed activity read cannot report an authoritative all-clear", () => {
  assert.match(script, /Boolean\(state\.batchActivityError\) && batches\.length === 0/);
  assert.match(script, /This is not an all-clear/);
  assert.match(script, /Checking approval activity/);
  assert.match(script, /No active approval batches\. All clear/);
});

test("conclusively absent saved request is not a failed Activity GET or fabricated global all-clear", () => {
  assert.match(script, /row\.unconfirmed && row\.group && value\?\.ok === true/);
  assert.match(script, /value\.exact_request_id === row\.request_id/);
  assert.match(script, /verified_absent: true, request_id: row\.request_id/);
  assert.match(script, /if \(failed\.length\) throw failed\[0\]\.reason/);
  assert.match(script, /activity_confidence: "saved-requests-only"/);
  assert.match(script, /Saved submission not accepted; global activity discovery is still unverified/);
  assert.match(script, /No accepted batch found for saved request IDs/);
});

test("Factory global discovery uses bounded read-only R2 cursors, never historical scan in foreground", () => {
  assert.match(script, /scanParams\.set\("bounded_discovery", "1"\)/);
  assert.match(script, /scanParams\.set\("child_cursor", state\.batchDiscoveryChildCursor\)/);
  assert.match(script, /scanParams\.set\("group_cursor", state\.batchDiscoveryGroupCursor\)/);
  assert.match(script, /value\.discovery\?\.mode !== "bounded-r2-cursor"/);
  assert.match(script, /activity_confidence = value\.discovery\.complete \? "verified" : "bounded-partial"/);
  assert.match(script, /Scanning Factory history in safe pages\. No all-clear until the sweep completes/);
});
