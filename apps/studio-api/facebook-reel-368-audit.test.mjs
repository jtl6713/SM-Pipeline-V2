import assert from "node:assert/strict";
import test from "node:test";
import { auditReel368Holds, reel368Decision } from "./facebook-reel-368-audit.mjs";

const row = (id, patch = {}) => ({
  id: "rec" + String(id).padStart(14, "0"),
  fields: { Output_ID: id, Platform: "Facebook", Platform_Output_Type: "Facebook Reel",
    Publish_Error_Stage: "FBS3_RATE_LIMIT", Publish_Attempt_Count: 1,
    Studio_Publish_Dispatch_Count: 1, Do_Not_Publish: true,
    Publish_Retry_Eligible: false, Publish_Next_Retry_At: "2026-10-23T23:37:01Z",
    ...patch },
});
test("all three Reels remain blocked after cooldown with no implied negative proof", () => {
  for (const id of [2457, 2762, 4018]) {
    const before = reel368Decision(row(id), Date.parse("2026-10-23T22:00:00Z"));
    const after = reel368Decision(row(id), Date.parse("2026-10-24T12:00:00Z"));
    assert.equal(before.outcome, "cooldown_waiting");
    assert.equal(after.outcome, "pending_verification");
    assert.equal(after.graph_create_authorized, false);
    assert.equal(before.safety_blocked, true);
    assert.equal(after.safety_blocked, true);
  }
});
test("audit writes at most once per output/half-hour bucket and does not publish", async () => {
  const saved = new Map(), written = [];
  const fetcher = async (_env, table, path, opts = {}) => {
    if (table === "Platform Outputs") {
      const id = Number(decodeURIComponent(path).match(/Output_ID}=([0-9]+)/)?.[1]);
      return { records: [row(id)] };
    }
    if (opts.method === "PATCH") {
      const body = JSON.parse(opts.body);
      assert.deepEqual(body.performUpsert.fieldsToMergeOn, ["Event_Key"]);
      const fields = body.records[0].fields;
      written.push(fields);
      saved.set(fields.Event_Key, fields);
      return { id: "rec12345678901234" };
    }
    const key = decodeURIComponent(path).match(/Event_Key}="([^"]+)"/)?.[1];
    return { records: key && saved.has(key) ? [{ fields: saved.get(key) }] : [] };
  };
  const nowMs = Date.parse("2026-10-24T13:00:00Z");
  const first = await auditReel368Holds({}, { airtableFetch: fetcher, nowMs });
  const second = await auditReel368Holds({}, { airtableFetch: fetcher, nowMs });
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.equal(written.length, 3);
  assert.ok(written.every(item => item.Outcome === "pending_verification"));
  assert.ok(written.every(item => JSON.parse(item.Details_JSON).no_meta_graph_create));
});

test("a known video identity must be checked by exact provider GET; unknown stays blocked", () => {
  const now = Date.parse("2026-10-24T13:00:00Z");
  const known = reel368Decision(row(2457, { FB_Slideshow_Meta_Video_ID: "123456789012345" }), now);
  assert.equal(known.outcome, "pending_exact_provider_verification");
  assert.equal(known.graph_create_authorized, false);
  assert.equal(known.safety_blocked, true);
  assert.match(known.action_required, /Graph GET/);
  const unknown = reel368Decision(row(2762), now);
  assert.equal(unknown.outcome, "pending_verification");
  assert.match(unknown.action_required, /Escalate/);
  assert.equal(unknown.graph_create_authorized, false);
});

test("missing or invalid safety hold remains blocked and is flagged", () => {
  const now = Date.parse("2026-10-24T13:00:00Z");
  const missingHold = reel368Decision(row(2457, { Do_Not_Publish: false, Publish_Retry_Eligible: true }), now);
  assert.equal(missingHold.hold_integrity, "missing_or_invalid");
  assert.equal(missingHold.safety_blocked, true);
  assert.equal(missingHold.graph_create_authorized, false);
});

test("Airtable read failure causes fail-closed rejection before audit write", async () => {
  let writes = 0;
  const fetcher = async (_env, table, _path, options = {}) => {
    if (options.method === "PATCH") writes++;
    if (table === "Platform Outputs") throw new Error("airtable 429");
    return { records: [] };
  };
  await assert.rejects(auditReel368Holds({}, { airtableFetch: fetcher }), /airtable 429/);
  assert.equal(writes, 0);
});

test("incomplete ledger read fails closed without recording a fake recovery", async () => {
  const fetcher = async (_env, table, path) => {
    if (table === "Platform Outputs") {
      const id = Number(decodeURIComponent(path).match(/Output_ID}=([0-9]+)/)?.[1]);
      return { records: [row(id)] };
    }
    return { error: "ledger unavailable" };
  };
  await assert.rejects(auditReel368Holds({}, { airtableFetch: fetcher }), /ledger lookup incomplete/);
});

test("duplicate or missing output records never authorize a publish or audit a false identity", async () => {
  const writes = [];
  const fetcher = async (_env, table, path, options = {}) => {
    if (options.method === "PATCH") writes.push(path);
    if (table === "Platform Outputs") return { records: [] };
    return { records: [] };
  };
  const outcomes = await auditReel368Holds({}, { airtableFetch: fetcher });
  assert.equal(outcomes.length, 3);
  assert.ok(outcomes.every(x => x.outcome === "record_unavailable" && x.graph_create_authorized === false));
  assert.equal(writes.length, 0);
});

test("authorized exact-ID provider read verifies identity but never reconciles without separate publication receipt", async () => {
  const writes = [];
  const fetcher = async (_env, table, path, opts = {}) => {
    if (table === "Platform Outputs") {
      const id = Number(decodeURIComponent(path).match(/Output_ID}=([0-9]+)/)?.[1]);
      return { records: [row(id, id === 2457 ? { FB_Slideshow_Meta_Video_ID:"123456789012345" } : {})] };
    }
    if (opts.method === "PATCH") {
      writes.push(JSON.parse(opts.body).records[0].fields);
      return { records: [{ id: "rec12345678901234" }] };
    }
    return { records: [] };
  };
  const requests = [];
  const results = await auditReel368Holds({}, {
    airtableFetch: fetcher,
    nowMs: Date.parse("2026-10-24T13:00:00Z"),
    metaCredentialsForRow: async () => ({token:"read-only-token",version:"v25.0"}),
    metaFetch: async (url, options) => {
      requests.push({url, method:options.method});
      return {ok:true,json:async()=>({id:"123456789012345",status:"PUBLISHED",
        permalink_url:"https://www.facebook.com/reel/123456789012345/",created_time:"2026-10-21T12:00:00Z"})};
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(results[0].outcome, "remote_identity_confirmed_pending_reconciliation");
  assert.equal(results[0].graph_create_authorized,false);
  assert.equal(writes.length,3);
  assert.equal(writes[0].Outcome,"remote_identity_confirmed_pending_reconciliation");
  assert.ok(writes.every(x=>!x.Published_At&&!x.Platform_Post_ID&&!x.Publish_Status));
});
