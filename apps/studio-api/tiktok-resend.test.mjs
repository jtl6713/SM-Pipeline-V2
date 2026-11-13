import { readStudioWorkerSource } from "./worker-source-reader.mjs";
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


test("Supabase SoR null Output_Status + Music Manual can resend (Vizcaya 4988)", () => {
  assert.equal(tiktokResendEligibility({
    platform: "TikTok",
    output_status: null,
    publish_status: "Ready to Publish",
    tiktok_draft_status: "Ready for Delivery",
    music_status: "Manual Action Required",
    studio_state: "Manual Action Required",
  }), null);
  assert.equal(tiktokNeedsDraftResend({
    platform: "TikTok",
    output_status: "",
    publish_status: "Ready to Publish",
    music_status: "Manual Action Required",
  }), true);
});

test("tiktokResendRearmFields clear auth park and arm Ready for Delivery", () => {
  const fields = tiktokResendRearmFields({
    now: "2026-09-28T15:30:00.000Z",
    existingNotes: "prior note",
    scheduledPostDate: "2026-09-28T15:40:00.000Z",
    nowMs: Date.parse("2026-09-28T15:30:00.000Z"),
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

test("tiktokResendRearmFields holds a future schedule out of the TikTok inbox", () => {
  const fields = tiktokResendRearmFields({
    now: "2026-10-15T23:31:11.230Z",
    existingNotes: "prior note",
    scheduledPostDate: "2026-11-14T00:00:00.000Z",
    nowMs: Date.parse("2026-10-15T23:31:11.230Z"),
  });
  assert.equal(fields.TikTok_Draft_Status, "Waiting for Schedule");
  assert.equal(fields.Publish_Status, "Ready to Schedule");
  assert.equal(fields.Output_Status, "Approved for Publishing");
  assert.equal(fields.Publish_Retry_Eligible, false);
  assert.equal(fields.TikTok_Draft_Publish_ID, "");
});

test("Worker and Pipeline UI advertise TikTok draft resend", async () => {
  const worker = readStudioWorkerSource();
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  assert.match(worker, /studio_tiktok_draft_resend_v1: true/);
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);
  assert.match(worker, /function resendStudioTiktokDraft/);
  assert.match(worker, /\/tiktok-resend\$/);
  assert.match(app, /BUILD_ID = "item4-0[.]6[.][0-9]+[-a-zA-Z0-9.]*"/);
  assert.match(app, /Resend draft to TikTok/);
  assert.match(app, /\/tiktok-resend/);
  assert.match(app, /function tiktokNeedsDraftResend/);
  assert.match(app, /Held until the scheduled time/);
  assert.match(app, /if \(creativeIsPublished\(record\)\) return "Published"/);
  const reconcileStart = worker.indexOf("async function studioReconcileTiktokDrafts");
  const reconcileEnd = worker.indexOf("async function studioReconcileFacebookPhotos", reconcileStart);
  const reconcile = worker.slice(reconcileStart, reconcileEnd);
  const ttd1 = reconcile.indexOf('stage: "ttd1"');
  const ttd2 = reconcile.indexOf('stage: "ttd2"');
  const ttd3 = reconcile.indexOf('stage: "ttd3"');
  assert.match(reconcile.slice(ttd1, ttd2), /STUDIO_TIKTOK_INBOX_DUE_FORMULA/);
  assert.match(reconcile.slice(ttd2, ttd3), /STUDIO_TIKTOK_INBOX_DUE_FORMULA/);
  assert.match(worker, /function overlayLiveTikTokPublishRows/);
  assert.match(worker, /decorate: \(records\) => overlayLiveTikTokPublishRows/);
});

test("TTD reconcile wakes future TikTok drafts only inside the inbox lead window and checks retry backoff", () => {
  const worker = readStudioWorkerSource();
  const begin = worker.indexOf("async function studioReconcileTiktokDrafts");
  assert.ok(begin >= 0, "Expected real reconciliation function");
  // Restored Worker source omits END markers; bound the body by the next function.
  const next = worker.indexOf("\nasync function ", begin + 1);
  const end = next > begin ? next : begin + 5000;
  const reconcile = worker.slice(begin, end);
  assert.match(reconcile, /TikTok_Draft_Status}="Waiting for Schedule"/);
  assert.match(reconcile, /TikTok_Draft_Status}="Ready for Assets"/);
  assert.match(reconcile, /Publish_Next_Retry_At}=BLANK/);
  assert.match(reconcile, /STUDIO_TIKTOK_INBOX_DUE_FORMULA/);
  assert.match(reconcile, /listSupabaseDeskHealOutputs\(env, \{/);
  assert.match(reconcile, /kind: "ttd0_ready"/);
  assert.match(reconcile, /kind: "ttd1_ready"/);
  assert.match(reconcile, /kind: "ttd2_processing"/);
  assert.match(reconcile, /kind: "ttd3_email"/);
  assert.match(reconcile, /studioWriteSource\(env\) === "supabase"/);
  const ttd0Start = reconcile.indexOf('stage: "ttd0"');
  const ttd1Start = reconcile.indexOf('stage: "ttd1"');
  assert.ok(ttd0Start >= 0 && ttd1Start > ttd0Start);
  assert.match(reconcile.slice(ttd0Start, ttd1Start), /Waiting for Schedule/);
  assert.doesNotMatch(reconcile.slice(ttd1Start), /Waiting for Schedule/);
});

test("TTD2 processing confirmation reread uses Supabase when write source is supabase", async () => {
  const worker = readStudioWorkerSource();
  const begin = worker.indexOf("async function studioReconcileTiktokProcessing");
  assert.ok(begin >= 0);
  const next = worker.indexOf("\nasync function ", begin + 1);
  const end = next > begin ? next : begin + 4000;
  const stage = worker.slice(begin, end);
  assert.match(stage, /studioListTiktokReconcileOutputs\(env, "ttd2_processing"/);
  assert.match(stage, /studioReadTiktokReconcileOutput\(env, candidate\.id\)/);
  assert.match(stage, /sortField: "TikTok_Draft_Last_Checked_At", sortDirection: "asc"/);
  const moduleSource = await readFile(path.join(here, "worker-functions-04.mjs"), "utf8");
  assert.match(moduleSource, /async function studioReadTiktokReconcileOutput/);
  assert.match(moduleSource, /readSupabaseShapedOutput\(env, recordId\)/);
  assert.match(moduleSource, /listSupabaseDeskHealOutputs\(env, \{\s*kind,/);
});
