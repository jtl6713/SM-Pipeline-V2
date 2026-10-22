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
