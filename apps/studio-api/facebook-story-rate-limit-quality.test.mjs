import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { facebookStoryRateLimitRearmReason, FAILED_OUTPUT_FORMULA, describeFailedOutput } from "./failed-output-monitor.mjs";
import { classifyFacebookStoryRateLimit, classifyFacebookPublishRateLimit, CLASSIFIER_KINDS, isFacebookPublishRateLimitError } from "./desk-inventory.mjs";
import { QUALITY_CHECK_BY_KIND, assertQualityCatalog } from "./quality-checks.mjs";
import { qualityRecapCopy } from "./quality-recap.mjs";

const at = Date.parse("2026-10-24T22:00:00Z");
const fields = {
  Output_ID: 4112, Platform: "Facebook", Platform_Output_Type: "Facebook Story",
  Review_Status: "Approved", Output_Status: "Approved for Publishing",
  Publish_Status: "Ready to Schedule", Publish_Error_Stage: "FACEBOOK_STORY_RATE_LIMIT_368",
  Publish_Next_Retry_At: "2026-10-23T21:47:40.627Z",
  Scheduled_Post_Date: "2026-10-24T23:40:00.000Z",
  Publish_Asset_URL: "https://media.chicagoshining.com/studio/previews/recA52Uk9eLyFOEdi/current.mp4",
  Studio_Publish_Dispatch_Note: "reconcile: target=FB-STORY-GRAPH | webhook=FAILED We limit how often you can post",
};
const row = (v = {}) => ({ id: "recA52Uk9eLyFOEdi", fields: { ...fields, ...v } });
const mapped = (v = {}) => ({
  id: "recA52Uk9eLyFOEdi", output_id: 4112,
  platform: "Facebook", platform_output_type: "Facebook Story",
  publish_status: "Ready to Schedule",
  publish_error_stage: "FACEBOOK_STORY_RATE_LIMIT_368",
  publish_next_retry_at: fields.Publish_Next_Retry_At,
  ...v,
});

test("4112 is rearm-eligible only after cooldown, preserving its original future schedule", () => {
  assert.equal(facebookStoryRateLimitRearmReason(row(), { nowMs: at }), null);
  assert.equal(facebookStoryRateLimitRearmReason(row(), {
    nowMs: Date.parse("2026-10-22T22:00:00Z"),
  }), "cooldown");
  const finding = describeFailedOutput(row(), at);
  assert.equal(finding.signature, "QA-FB-STORY-368-RETRY-PENDING");
  assert.equal(finding.recovery, "healer_eligible");
  assert.match(finding.action, /original scheduled time/);
  assert.match(FAILED_OUTPUT_FORMULA, /FACEBOOK_STORY_RATE_LIMIT_368/);
  assert.match(FAILED_OUTPUT_FORMULA, /\{Platform_Post_ID\}=BLANK\(\)/);
});

test("no Story is automatically rearmed without explicit publication, cooldown, media and retry safety", () => {
  for (const [patch, expected] of [
    [{ Platform_Post_ID: "remote-post" }, "publication_evidence"],
    [{ Published_At: "2026-10-23T22:00:00Z" }, "publication_evidence"],
    [{ Platform_Media_ID: "story-media" }, "publication_evidence"],
    [{ Do_Not_Publish: true }, "publication_held"],
    [{ Review_Status: "Review Sent" }, "approval_not_confirmed"],
    [{ Publish_Status: "Published" }, "unexpected_publish_state"],
    [{ Scheduled_Post_Date: null }, "missing_scheduled_date"],
    [{ Publish_Next_Retry_At: null }, "missing_retry_time"],
    [{ Publish_Asset_URL: "https://drive.google.com/unsafe" }, "missing_public_story_asset"],
    [{ Publish_Locked_By: "runner" }, "publish_locked"],
    [{ Studio_Publish_Dispatch_Count: 8 }, "retry_limit"],
    [{ Publish_Attempt_Count: 3 }, "retry_limit"],
    [{ Test_Run_ID: "test-fixture" }, "publication_held"],
  ]) assert.equal(facebookStoryRateLimitRearmReason(row(patch), { nowMs: at }), expected, JSON.stringify(patch));
});

test("Story signature correctly separates 48-hour cooldown from eight dispatches and Reel rearm", () => {
  assert.ok(CLASSIFIER_KINDS.includes("facebook_story_rate_limit"));
  assert.equal(isFacebookPublishRateLimitError("FACEBOOK_STORY_RATE_LIMIT_368"), true);
  let story = classifyFacebookStoryRateLimit(mapped(), Date.parse("2026-10-22T00:00:00Z"));
  assert.equal(story.kind, "facebook_story_rate_limit");
  assert.equal(story.blocker, "cooldown");
  assert.equal(story.actor, "worker_heal");
  story = classifyFacebookStoryRateLimit(mapped({ dispatch_count: 8 }), at);
  assert.equal(story.blocker, "pending_verification");
  assert.equal(story.actor, "worker_heal");
  assert.match(story.diagnosis, /Not permanently unrecoverable/);
  assert.equal(classifyFacebookPublishRateLimit(mapped({ platform_output_type: "Facebook Reel", publish_status: "Failed", publish_error_stage: "FBS3_RATE_LIMIT" }))?.kind, "facebook_publish_rate_limit");
  assert.equal(classifyFacebookStoryRateLimit(mapped({ published_at: "2026-10-24T21:00:00Z" }), at), null);
});

test("Quality and Helpdesk keep the exact signature and restrained action", () => {
  const check = QUALITY_CHECK_BY_KIND.facebook_story_rate_limit;
  assert.equal(check.signature, "QA-FB-STORY-368-RETRY-PENDING");
  assert.equal(check.heal, "return_to_preapproval_after_cooldown");
  assert.equal(assertQualityCatalog().ok, true);
  assert.match(qualityRecapCopy("facebook_story_rate_limit").action, /counters are not reset/);
  const healing = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const service = healing.slice(healing.indexOf("export async function studioHealFacebookRateLimitRearm("),
    healing.indexOf("/*__STUDIO_WORKER_END:studioHealFacebookRateLimitRearm__*/"));
  assert.match(service, /FACEBOOK_STORY_RATE_LIMIT_368/);
  assert.ok(service.includes("facebookPreapprovalRecoveryReason(latest)"));
  assert.ok(service.includes("facebookPreapprovalRecoveryFields(latest)"));
  assert.match(service, /studioScanDeskHealOutputs\(env, "fb_preapproval"/);
  assert.match(healing, /scanOutstandingFailedOutputs/);
  assert.doesNotMatch(service, /studioDispatchApprovedPublishNow/);
  assert.doesNotMatch(service, /Studio_Publish_Dispatch_Count:\\s*0/);
  const worker = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  assert.match(worker, /push\(classifyFacebookStoryRateLimit\(mapped, nowMs\)\)/);
  assert.match(worker, /push\(classifyFacebookStoryRateLimit\(mapOut\(record\), nowMs\)\)/);
});
