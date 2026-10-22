import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildVerificationRecoveryReport, verificationRecoveryStatus,
  VERIFICATION_RECOVERED_FORMULA, VERIFICATION_REARM_MARKER } from "./quality-verification-recovery.mjs";

const nowMs = Date.parse("2026-10-26T12:00:00Z");
const base = { Output_ID: 4004, Platform: "Facebook", Platform_Output_Type: "Facebook Story",
  Publish_Error_Stage: "FACEBOOK_STORY_RATE_LIMIT_368", Review_Status: "Approved",
  Output_Status: "Approved for Publishing", Publish_Status: "Ready to Schedule",
  Publish_Next_Retry_At: "2026-10-23T12:00:00Z",
  Scheduled_Post_Date: "2026-10-26T13:00:00Z",
  Studio_Publish_Dispatch_Count: 8, Publish_Asset_URL: "https://media.chicagoshining.com/published/story.mp4" };
const row = (id, patch = {}) => ({ id: "rec" + id, fields: { ...base, Output_ID: id, ...patch } });

test("exhausted Story attempts stay under autonomous investigation, not falsely Needs You", () => {
  assert.deepEqual(verificationRecoveryStatus(row(4004), nowMs).status, "investigating");
  assert.deepEqual(verificationRecoveryStatus(row(4112, {
    Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-28T12:00:00Z",
  }), nowMs).status, "awaiting_cooldown");
  assert.equal(verificationRecoveryStatus(row(9001, {
    Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-23T12:00:00Z",
  }), nowMs).reason, "guarded_rearm_eligible");
});

test("only a confirmed interactive security challenge counts as human action", () => {
  assert.equal(verificationRecoveryStatus(row(4004, {
    Publish_Error_Message: "Meta Security checkpoint: verify your identity",
  }), nowMs).status, "investigating");
  assert.equal(verificationRecoveryStatus(row(4004, {
    Manual_Fallback_Required: true, Publish_Error_Message: "Meta Security checkpoint: verify your identity",
  }), nowMs).status, "human_action_required");
  assert.equal(verificationRecoveryStatus(row(4004, {
    Manual_Fallback_Required: true, Publish_Error_Message: "We limit how often you can post",
  }), nowMs).status, "investigating");
});

test("only confirmed published, timestamped, audited outcomes count as recovered", () => {
  const published = row(4004, {
    Published_At: "2026-10-26T09:00:00Z", Platform_Post_ID: "123",
    Studio_Publish_Dispatch_Note: "reconcile successful | " + VERIFICATION_REARM_MARKER,
  });
  const sample = [published, published, row(4064, {
    Published_At: "2026-10-26T09:00:00Z", Platform_Post_ID: "",
    Studio_Publish_Dispatch_Note: VERIFICATION_REARM_MARKER,
  }), row(4022, {
    Published_At: "2026-10-01T09:00:00Z", Platform_Post_ID: "older",
    Studio_Publish_Dispatch_Note: VERIFICATION_REARM_MARKER,
  })];
  const report = buildVerificationRecoveryReport({
    outstanding: [row(4004), row(4112, {
      Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-28T12:00:00Z",
    }), row(2050, { Manual_Fallback_Required: true, Publish_Error_Message: "two-factor authentication required" })],
    publishedRecoveryEvidence: sample, nowMs,
  });
  assert.equal(report.counts.recovered_automatically, 1);
  assert.equal(report.counts.investigating, 1);
  assert.equal(report.counts.awaiting_cooldown, 1);
  assert.equal(report.counts.human_action_required, 1);
  assert.equal(report.outstanding_count, 3);
  assert.match(VERIFICATION_RECOVERED_FORMULA, /Published_At/);
  assert.match(VERIFICATION_RECOVERED_FORMULA, /Studio_Publish_Dispatch_Note/);
});

test("the Worker report preserves the audited marker across dispatch note updates", () => {
  const worker = fs.readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  assert.match(worker.slice(worker.indexOf("export async function studioStampPublishDispatch"), worker.indexOf("/*__STUDIO_WORKER_END:studioStampPublishDispatch__*/")),
    /VERIFICATION_REARM_MARKER/);
  const desk = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  assert.match(desk, /VERIFICATION_RECOVERED_FORMULA/);
  assert.match(desk, /buildVerificationRecoveryReport/);
  assert.match(desk, /verification_recovery/);
});
