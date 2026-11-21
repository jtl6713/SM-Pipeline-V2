import test from "node:test";
import assert from "node:assert/strict";
import { overdueSkipReceiptFields, publishDispatchAttemptStampFields } from "./overdue-retry-receipt.mjs";

const nowMs = Date.parse("2026-11-20T07:00:00Z");

test("skip receipt must not lift an explicit retry prohibition", () => {
  const patch = overdueSkipReceiptFields({note:"overdue-rescue: skipped: graph_create_failed",retryEligible:false,nowMs});
  assert.equal(Object.hasOwn(patch,"Publish_Retry_Eligible"),false);
  assert.equal(Object.hasOwn(patch,"Publish_Next_Retry_At"),false);
  assert.equal(patch.Publish_Error_Stage,"RESCUE_SKIP");
});
test("rate-limited status is not overwritten by ordinary skip receipt", () => {
  assert.deepEqual(overdueSkipReceiptFields({note:"skipped: container_in_progress",errorStage:"FACEBOOK_STORY_RATE_LIMIT_368",nowMs}),{});
});
test("preserve longer platform cooldown", () => {
  const retryAt="2026-11-21T07:00:00Z";
  const patch=overdueSkipReceiptFields({note:"skipped: graph_failed",retryEligible:true,retryAt,nowMs});
  assert.equal(Object.hasOwn(patch,"Publish_Next_Retry_At"),false);
});
test("eligible skip sets bounded delay without changing eligibility", () => {
  const patch=overdueSkipReceiptFields({note:"skipped: graph_failed",retryEligible:true,nowMs});
  assert.equal(patch.Publish_Next_Retry_At,"2026-11-20T07:30:00.000Z");
  assert.equal(Object.hasOwn(patch,"Publish_Retry_Eligible"),false);
});
test("successful dispatch must not create a retry/skip patch", () => {
  assert.deepEqual(overdueSkipReceiptFields({note:"webhook=ok",retryEligible:true,nowMs}),{});
});

test("skipped scheduled hold never consumes a real publish attempt", () => {
  for (const note of [
    "skipped: scheduled-hold",
    "overdue-rescue: skipped: no-dispatch",
    "reconcile: skipped: missing-ai-caption",
    "held until 2026-11-20T14:00:00Z",
  ]) {
    assert.deepEqual(publishDispatchAttemptStampFields({ note, priorCount: 8, nowIso: "2026-11-20T14:00:00Z" }), {}, note);
  }
});
test("accepted or ambiguous dispatch retains the real attempt counter", () => {
  const nowIso = "2026-11-20T14:00:00Z";
  for (const note of ["accepted: AP1-IGS", "target=AP1-IGS | webhook=ok", "dispatch failed: upstream timeout", "overdue-rescue: skipped: graph_create_failed"]) {
    assert.deepEqual(publishDispatchAttemptStampFields({ note, priorCount: 3, nowIso }), {
      Studio_Publish_Dispatch_At: nowIso,
      Studio_Publish_Dispatch_Count: 4,
    }, note);
  }
});
test("do not erase existing eight skipped counts when logging another skip", () => {
  assert.equal(Object.keys(publishDispatchAttemptStampFields({
    note: "overdue-rescue: skipped: scheduled-hold", priorCount: 8,
  })).length, 0);
});
