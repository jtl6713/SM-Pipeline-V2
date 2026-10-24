import test from "node:test";
import assert from "node:assert/strict";
import { buildExceptionRecoveryCenter } from "./exception-recovery-center.mjs";

const failed = (id, extra = {}) => ({
  record_id: id, output_id: "3374", title: "Chicago skyline",
  platform: "YouTube", recovery: "verify_remote_before_retry",
  action: "Verify the existing remote ID", signature: "QA-PUBLISH-001", ...extra,
});
const pastDue = (id, extra = {}) => ({
  record_id: id, output_id: "3374", platform: "YouTube", cause: "remote_identity_not_public_visibility",
  recovery: "verify_remote_before_retry", scheduled_at: "2026-10-23T15:00:00Z",
  minutes_past_due: 75, action: "Check visibility before reposting", ...extra,
});
const snap = (extra = {}) => ({
  status: "ok", scanned_at: "2026-10-23T20:00:00Z",
  items: [failed("recAAAAAAAAAAAAAA")],
  rows: [{ id: "recAAAAAAAAAAAAAA", fields: {Do_Not_Publish: true}}],
  approved_past_due: {status: "ok", items: [pastDue("recAAAAAAAAAAAAAA")]},
  verification_recovery: {status: "ok", counts: {recovered_automatically: 2}, items: [
    {record_id: "recBBBBBBBBBBBBBB", outcome: "pending_verification"},
  ]}, ...extra,
});

test("overlapping QA detections produce one actionable identity, never a duplicate", () => {
  const result = buildExceptionRecoveryCenter(snap());
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].categories, ["failed","approved_past_due","held_deferred"]);
  assert.equal(result.items[0].held, true);
  assert.equal(result.items[0].actions_enabled, false);
  assert.match(result.items[0].recommendation, /Do not automatically/);
  assert.equal(result.items[0].title, "Chicago skyline");
  assert.equal(result.items[0].minutes_past_due, 75);
});

test("provisional numbers never claim exact Home parity", () => {
  const result = buildExceptionRecoveryCenter(snap());
  assert.equal(result.metrics.failed.count, null);
  assert.equal(result.metrics.failed.observed, 1);
  assert.equal(result.metrics.approved_past_due.observed, 1);
  assert.equal(result.metrics.awaiting_verification.observed, 1);
  assert.equal(result.metrics.held_deferred.observed, 1);
  assert.equal(result.metrics.resolved_last_7_days.observed, 2);
  assert.equal(result.metrics.suspected_duplicates.observed, null);
  assert.equal(result.completeness.home_pipeline_parity, "unverified");
});

test("Airtable scan failures remain unknown rather than false zeros", () => {
  const result = buildExceptionRecoveryCenter(snap({
    approved_past_due: { status: "unavailable", error: "timeout" },
    verification_recovery: { status: "partial", counts: {recovered_automatically: null}},
  }));
  assert.equal(result.status, "partial");
  assert.equal(result.metrics.approved_past_due.observed, null);
  assert.equal(result.metrics.resolved_last_7_days.observed, null);
  assert.equal(result.metrics.awaiting_verification.observed, null);
  assert.equal(result.items.length, 1);
});

test("entire Quality Agent outage fails closed", () => {
  const result = buildExceptionRecoveryCenter({status:"unavailable"});
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.metrics, {});
  assert.equal(result.items.length, 0);
  assert.equal(result.read_only, true);
});

test("unknown rows never inherit commands or internal provider evidence", () => {
  const result = buildExceptionRecoveryCenter(snap({items: [failed("recAAAAAAAAAAAAAA", {
    api_key: "secret", command: "post", tokens: ["secret"],
  })]}));
  assert.equal(result.items[0].api_key, undefined);
  assert.equal(result.items[0].command, undefined);
  assert.equal(result.items[0].tokens, undefined);
  assert.equal(result.items[0].actions_enabled, false);
});
