import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  tiktokNeedsDraftResend,
  tiktokResendEligibility,
  tiktokResendRearmFields,
} from "./tiktok-resend.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("tiktokResendEligibility gates published and non-TikTok rows", () => {
  assert.equal(tiktokResendEligibility({ platform: "Instagram" }), "not_tiktok");
  assert.equal(tiktokResendEligibility({
    platform: "TikTok",
    do_not_publish: true,
    output_status: "Approved for Publishing",
  }), "do_not_publish");
  assert.equal(tiktokResendEligibility({
    platform: "TikTok",
    output_status: "Published",
    publish_status: "Published",
    tiktok_draft_status: "Published",
  }), "already_published");
  assert.equal(tiktokResendEligibility({
    platform: "TikTok",
    output_status: "Ready for Review",
  }), "not_approved");
  assert.equal(tiktokResendEligibility({
    platform: "TikTok",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    tiktok_draft_status: "Manual Fallback",
  }), null);
  assert.equal(tiktokNeedsDraftResend({
    platform: "TikTok",
    output_status: "Approved for Publishing",
    tiktok_draft_status: "Manual Fallback",
  }), true);
});

test("tiktokResendRearmFields clear auth park and arm Ready for Delivery", () => {
  const fields = tiktokResendRearmFields({
    now: "2026-09-28T15:30:00.000Z",
    existingNotes: "prior note",
  });
  assert.equal(fields.TikTok_Draft_Status, "Ready for Delivery");
  assert.equal(fields.Publish_Status, "Ready to Publish");
  assert.equal(fields.Output_Status, "Approved for Publishing");
  assert.equal(fields.Manual_Fallback_Required, false);
  assert.equal(fields.Publish_Retry_Eligible, true);
  assert.equal(fields.Publish_Attempt_Count, 0);
  assert.equal(fields.Studio_Publish_Dispatch_Count, 0);
  assert.equal(fields.TikTok_Draft_Publish_ID, "");
  assert.equal(fields.Publish_Error_Message, "");
  assert.match(fields.Output_Notes, /prior note/);
  assert.match(fields.Output_Notes, /draft resend requested/);
});

test("Worker and Pipeline UI advertise TikTok draft resend", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  assert.match(worker, /studio_tiktok_draft_resend_v1: true/);
  assert.match(worker, /version: "0.10.593-autonomous-revision-fifo"/);
  assert.match(worker, /function resendStudioTiktokDraft/);
  assert.match(worker, /\/tiktok-resend\$/);
  assert.match(app, /BUILD_ID = "item4-0.6.681-factory-open-targets"/);
  assert.match(app, /Resend draft to TikTok/);
  assert.match(app, /\/tiktok-resend/);
  assert.match(app, /function tiktokNeedsDraftResend/);
});
