import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AUTOVERIFY_RECOVERED_FORMULA, AUTOVERIFY_RECOVERED_MARKER,
  assessAutonomousVerification, recoveredAtFromNote, summarizeAutonomousVerification,
} from "./autonomous-verification-recovery.mjs";
import { facebookStoryRateLimitRearmReason } from "./failed-output-monitor.mjs";
const nowMs = Date.parse("2026-10-27T20:00:00Z");
const record = (id, patch = {}) => ({ id, fields: {
  Output_ID: Number(id.replace(/\D/g, "")) || 4112,
  Platform: "Facebook", Platform_Output_Type: "Facebook Story",
  Review_Status: "Approved", Output_Status: "Approved for Publishing",
  Publish_Status: "Ready to Schedule",
  Publish_Error_Stage: "FACEBOOK_STORY_RATE_LIMIT_368",
  Studio_Publish_Dispatch_Count: 8,
  Publish_Next_Retry_At: "2026-10-25T00:00:00.000Z",
  Scheduled_Post_Date: "2026-10-29T18:00:00.000Z",
  Publish_Asset_URL: "https://media.chicagoshining.com/studio/previews/story.mp4",
  Content_Profile: ["recLA"], ...patch,
} });
test("eight-dispatch Stories are autonomous pending verification, never presumed eligible to repost", () => {
  for (const id of [2036,4064,1133,2116,4058,4004,1151,4022,4034]) {
    const r = record("rec" + id);
    const result = assessAutonomousVerification(r, { nowMs });
    assert.equal(result.outcome, "pending_verification");
    assert.equal(result.safety_blocked, true);
    assert.ok(Date.parse(result.next_check_at) > nowMs);
    assert.equal(facebookStoryRateLimitRearmReason(r, { nowMs }), "retry_limit");
  }
});
test("the low-attempt 4112 cooldown is eligible only for the existing safe rearm, not a direct Graph post", () => {
  const r = record("rec4112", { Studio_Publish_Dispatch_Count: 1 });
  assert.equal(assessAutonomousVerification(r, { nowMs }).outcome, "guarded_rearm");
  assert.equal(facebookStoryRateLimitRearmReason(r, { nowMs }), null);
  assert.equal(assessAutonomousVerification(record("rec4112", {
    Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-29T00:00:00Z",
  }), { nowMs }).outcome, "cooldown_waiting");
});
test("missing Post ID or a Graph 368 error can never stand in for negative publication proof", () => {
  const pending = assessAutonomousVerification(record("rec22"), { nowMs });
  assert.equal(pending.outcome, "pending_verification");
  assert.notEqual(pending.outcome, "verified_not_published");
  const published = assessAutonomousVerification(record("rec23", {
    Platform_Post_URL: "https://www.facebook.com/stories/123",
  }), { nowMs });
  assert.equal(published.outcome, "publication_evidence");
  assert.match(published.reason, /never send a duplicate/);
});
test("explicit Meta security checkpoint alone is genuinely human-required", () => {
  const challenge = assessAutonomousVerification(record("rec24", {
    Publish_Error_Stage: "META_SECURITY_CHALLENGE",
  }), { nowMs });
  assert.equal(challenge.outcome, "human_action_required");
  assert.match(challenge.action_required, /Meta account security checkpoint/);
  const ordinary = assessAutonomousVerification(record("rec25", {
    Studio_Publish_Dispatch_Note: "We limit how often you can post",
  }), { nowMs });
  assert.equal(ordinary.outcome, "pending_verification");
});
test("unique-current-output metrics count pending, cooldown, human and recovery markers without false zeros", () => {
  const rows = [
    record("rec1"),
    record("rec1"),
    record("rec2", { Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-29T00:00:00Z" }),
    record("rec3", { Publish_Error_Stage: "FACEBOOK_CHECKPOINT_REQUIRED" }),
    record("rec4", { Do_Not_Publish: true }),
  ];
  const recovered = [
    record("rec5", { Publish_Error_Stage: "", Studio_Publish_Dispatch_Note: "QA-AUTOVERIFY-RECOVERED:2026-10-26T20:00:00.000Z" }),
    record("rec5", { Publish_Error_Stage: "", Studio_Publish_Dispatch_Note: "QA-AUTOVERIFY-RECOVERED:2026-10-26T20:00:00.000Z" }),
    record("rec6", { Publish_Error_Stage: "", Studio_Publish_Dispatch_Note: "QA-AUTOVERIFY-RECOVERED:2026-09-26T20:00:00.000Z" }),
    record("rec1", { Publish_Error_Stage: "", Studio_Publish_Dispatch_Note: "QA-AUTOVERIFY-RECOVERED:2026-10-26T20:00:00.000Z" }),
  ];
  const result = summarizeAutonomousVerification(rows, recovered, { nowMs });
  assert.deepEqual(result.counts, {
    recovered_automatically: 1, human_action_required: 1,
    pending_verification: 1, cooldown_waiting: 1, safety_blocked: 2,
  });
  assert.equal(result.per_profile.recLA.recovered_automatically, 1);
  assert.equal(result.items.length, 4);
  const degraded = summarizeAutonomousVerification(rows, [], { nowMs, recoveredScanStatus: "unavailable" });
  assert.equal(degraded.status, "partial");
  assert.equal(recoveredAtFromNote("not-recovered"), null);
  assert.match(AUTOVERIFY_RECOVERED_FORMULA, /Studio_Publish_Dispatch_Note/);
  assert.match(AUTOVERIFY_RECOVERED_MARKER, /RECOVERED/);
});
test("Worker integrates census and telemetry without bypassing #1045's attempt ceiling", () => {
  const worker = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const factory = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../studio-web/assets/factory-batch-quality-0710.js", import.meta.url), "utf8");
  assert.match(worker, /QA-AUTOVERIFY-RECOVERED:/);
  assert.match(worker, /facebookStoryRateLimitRearmReason\(authoritative\)/);
  assert.match(factory, /summarizeAutonomousVerification/);
  assert.match(factory, /verification_recovery: snapshot\.verification_recovery/);
  assert.match(ui, /recovered_automatically/);
});
