import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  facebookPreapprovalRecoveryReason,
  facebookPreapprovalRecoveryFields,
  FACEBOOK_PREAPPROVAL_FORMULA,
} from "./facebook-preapproval-recovery.mjs";

const nowMs = Date.parse("2026-10-26T12:00:00.000Z");
const normal = {
  Platform: "Facebook", Platform_Output_Type: "Facebook Story",
  Output_Status: "Approved for Publishing", Review_Status: "Approved",
  Publish_Status: "Failed", Render_Status: "Rendered",
  Publish_Error_Stage: "FACEBOOK_STORY_RATE_LIMIT_368",
  Publish_Error_Message: "We limit how often you can post. Error code 368.",
  Publish_Asset_URL: "https://media.chicagoshining.com/studio/previews/story.mp4",
  Publish_Next_Retry_At: "2026-10-24T00:00:00.000Z",
  Last_Publish_Attempt_At: "2026-10-23T00:00:00.000Z",
  Publish_Attempt_Count: 1, Studio_Publish_Dispatch_Count: 1,
};
const row = (fields = {}) => ({ id: "recQAExample", fields: { ...normal, ...fields } });
const reason = (fields = {}) => facebookPreapprovalRecoveryReason(row(fields), { nowMs });

test("all three temporary Facebook anti-spam stages return to review after 48-hour cooldown", () => {
  for (const stage of ["FACEBOOK_STORY_RATE_LIMIT_368", "FBS3_RATE_LIMIT", "FB_GRAPH_RATE_LIMIT"]) {
    assert.equal(reason({ Publish_Error_Stage: stage }), null);
  }
  assert.match(FACEBOOK_PREAPPROVAL_FORMULA, /FACEBOOK_STORY_RATE_LIMIT_368/);
  assert.match(FACEBOOK_PREAPPROVAL_FORMULA, /FB_GRAPH_RATE_LIMIT/);
  assert.equal(reason({ Platform: "Instagram" }), "not_facebook");
  assert.equal(reason({ Publish_Error_Stage: "META_SECURITY_CHALLENGE" }), "not_transient_rate_limit");
});

test("fail closed on publication ambiguity, exhausted sends, account issues and active locks", () => {
  for (const [patch, expected] of [
    [{ Platform_Post_ID: "123" }, "remote_publication_verification_required"],
    [{ Platform_Media_ID: "456" }, "remote_publication_verification_required"],
    [{ Published_At: "2026-10-24T00:00:00Z" }, "remote_publication_verification_required"],
    [{ FB_Publish_Status: "Published" }, "remote_publication_verification_required"],
    [{ Studio_Publish_Dispatch_Count: 8 }, "remote_publication_verification_required"],
    [{ Publish_Attempt_Count: 3 }, "remote_publication_verification_required"],
    [{ Publish_Error_Message: "Policy violation: community standards" }, "policy_or_account_restriction"],
    [{ Publish_Error_Message: "Page checkpoint required" }, "policy_or_account_restriction"],
    [{ Publish_Locked_By: "runner" }, "publish_locked"],
    [{ Publish_Locked_At: "2026-10-26T11:59:00Z" }, "publish_locked"],
    [{ Do_Not_Publish: true }, "publication_held"],
    [{ Review_Status: "Review Sent" }, "not_approved"],
    [{ Final_File_URL: null, Publish_Asset_URL: null }, "finished_media_missing"],
    [{ Render_Status: "Failed" }, "render_failed"],
    [{ Publish_Next_Retry_At: null, Last_Publish_Attempt_At: null }, "cooldown_unverified"],
    [{ Publish_Next_Retry_At: "2026-10-30T00:00:00Z" }, "cooldown"],
    [{ Last_Publish_Attempt_At: "2026-10-26T00:00:00Z" }, "cooldown"],
  ]) assert.equal(reason(patch), expected, JSON.stringify(patch));
});

test("FBS3 never automatically recreates a Reel after Graph 368", () => {
  const ops = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const start = ops.indexOf("export async function studioReconcileFacebookReels(");
  const end = ops.indexOf("/*__STUDIO_WORKER_END:studioReconcileFacebookReels__*/", start);
  const block = ops.slice(start, end);
  assert.match(block, /rate_limit_requires_operator_review/);
  assert.match(block, /\{Publish_Error_Stage\}!="FBS3_RATE_LIMIT"/);
  assert.match(block, /\{Publish_Error_Stage\}!="FB_GRAPH_RATE_LIMIT"/);
  const runner = fs.readFileSync(new URL("../../services/pipeline-runner/fbs3/eligibility.py", import.meta.url), "utf8");
  assert.match(runner, /rate_limit_requires_operator_review/);
  assert.match(runner, /"fbs3_rate_limit"/);
  assert.match(runner, /"fb_graph_rate_limit"/);
});

test("preapproval patch preserves durable slot until next atomic MAE approval", () => {
  const fields = facebookPreapprovalRecoveryFields(row({
    Scheduled_Post_Date: "2026-10-24T01:00:00Z", Final_File_URL: "https://media/video.mp4",
    Studio_Publish_Dispatch_Note: "Graph 368 rejection at dispatch",
  }), new Date(nowMs));
  assert.equal(fields.Review_Status, "Review Sent");
  assert.equal(fields.Output_Status, "Ready for Review");
  assert.equal(fields.Publish_Status, "Not Ready");
  assert.equal(fields.Auto_Publish_Enabled, false);
  assert.equal(fields.Publish_Retry_Eligible, false);
  assert.equal(Object.hasOwn(fields, "Scheduled_Post_Date"), false);
  assert.equal(fields.Studio_Scheduled_At, null);
  assert.match(fields.Studio_Publish_Dispatch_Note, /QA-FB-RATE-LIMIT-TO-REVIEW/);
  for (const key of ["Final_File_URL", "Publish_Asset_URL", "Publish_Attempt_Count",
    "Studio_Publish_Dispatch_Count", "Published_At", "Platform_Post_ID",
    "Publish_Next_Retry_At", "Render_Status", "Scheduled_Post_Date"]) {
    assert.equal(Object.hasOwn(fields, key), false, key + " must remain unchanged");
  }
});

test("the cron recovery performs no direct Meta Graph send or counter reset", () => {
  const worker = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const start = worker.indexOf("export async function studioHealFacebookRateLimitRearm(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:studioHealFacebookRateLimitRearm__*/", start);
  const block = worker.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /facebookPreapprovalRecoveryReason\(latest\)/);
  assert.match(block, /facebookPreapprovalRecoveryFields\(latest\)/);
  assert.match(block, /studioScanDeskHealOutputs/);
  assert.match(worker, /scanOutstandingFailedOutputs/);
  assert.doesNotMatch(block, /studioDispatchApprovedPublishNow/);
  assert.doesNotMatch(block, /Studio_Publish_Dispatch_Count:\s*0/);
  assert.match(block, /studioScanDeskHealOutputs\(env, "fb_preapproval"/);
  assert.ok(block.indexOf("const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID") <
    block.indexOf("studioScanDeskHealOutputs"), "no TDZ table access");
});
