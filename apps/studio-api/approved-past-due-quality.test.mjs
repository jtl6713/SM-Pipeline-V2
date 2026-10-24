import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  QA_APPROVED_PAST_DUE, PAST_DUE_GRACE_MS, approvedPastDueFormula,
  scanApprovedPastDueOutputs, publishedReceiptRepairReason, classifyApprovedPastDue,
} from "./approved-past-due-quality.mjs";

const record = (id, fields = {}) => ({ id, fields: {
  Output_ID: Number(id.replace(/\D/g, "")) || 1,
  Content_Profile: ["recChicago"], Platform: "Facebook",
  Review_Status: "Approved", Output_Status: "Approved for Publishing",
  Publish_Status: "Ready to Schedule",
  Scheduled_Post_Date: "2026-10-21T16:00:00Z",
  Auto_Publish_Enabled: true, ...fields,
} });
const now = Date.parse("2026-10-21T18:00:00Z");

test("QA-PUBLISH-001 uses a UTC deadline with 15-minute grace and excludes published receipts", () => {
  assert.equal(QA_APPROVED_PAST_DUE, "QA-PUBLISH-001");
  assert.equal(PAST_DUE_GRACE_MS, 900000);
  const formula = approvedPastDueFormula(now);
  assert.match(formula, /2026-10-21T17:45:00.000Z/);
  for (const field of ["Review_Status", "Scheduled_Post_Date", "Do_Not_Publish",
    "Published_At", "Platform_Post_URL", "Manual_Published_URL"]) {
    assert.ok(formula.includes(field), "missing filter " + field);
  }
});

test("complete paginated past-due census fails closed when a page is missing", async () => {
  let pages = 0;
  const rows = Array.from({ length: 231 }, (_, i) => record("rec" + i));
  const result = await scanApprovedPastDueOutputs(({ offset }) => {
    const start = offset ? Number(offset) : 0;
    pages++;
    return Promise.resolve({ records: rows.slice(start, start + 100),
      offset: start + 100 < rows.length ? String(start + 100) : null });
  }, { nowMs: now });
  assert.equal(result.length, 231);
  assert.equal(pages, 3);
  await assert.rejects(scanApprovedPastDueOutputs(async () => ({ records: null })), /invalid page/);
});

test("no attempt and eligible approval uses existing idempotent overdue rescue", () => {
  const finding = classifyApprovedPastDue(record("rec1"), now);
  assert.equal(finding.signature, QA_APPROVED_PAST_DUE);
  assert.equal(finding.output_id, "1");
  assert.equal(finding.profile_id, "recChicago");
  assert.equal(finding.minutes_past_due, 120);
  assert.equal(finding.cause, "approved_due_without_dispatch");
  assert.equal(finding.recovery, "existing_overdue_rescue");
});

test("in-flight attempt, platform identity, retry cooldown or lock cannot prompt blind repost", () => {
  const cases = [
    [{ Studio_Publish_Dispatch_Count: 1 }, "remote_publication_unconfirmed"],
    [{ Platform_Post_ID: "abc" }, "remote_identity_not_public_visibility"],
    [{ YouTube_Video_ID: "yt123", Platform: "YouTube" }, "remote_identity_not_public_visibility"],
    [{ Publish_Status: "Publishing" }, "publisher_in_flight"],
    [{ Publish_Locked_By: "runner", Publish_Locked_At: "2026-10-21T17:58:00Z" }, "publisher_in_flight"],
    [{ Publish_Next_Retry_At: "2026-10-21T20:00:00Z" }, "publish_retry_cooldown"],
  ];
  for (const [fields, cause] of cases) {
    const result = classifyApprovedPastDue(record("rec1", fields), now);
    assert.equal(result.cause, cause);
    assert.notEqual(result.recovery, "existing_overdue_rescue");
  }
});

test("exhausted LA Facebook dispatch attempts cannot be re-dispatched by QA", () => {
  const issue = classifyApprovedPastDue(record("rec1133", {
    Platform: "Facebook", Studio_Publish_Dispatch_Count: 8,
    Publish_Status: "Ready to Publish",
  }), now);
  assert.equal(issue.cause, "publish_dispatch_attempt_limit");
  assert.equal(issue.recovery, "escalate_without_redispatch");
  assert.match(issue.action, /Stop new dispatch attempts/);
});

test("TikTok draft delivery and YouTube uploads are not public posting proof", () => {
  assert.equal(classifyApprovedPastDue(record("rec1", {
    Platform: "TikTok", TikTok_Draft_Status: "Draft Delivered",
  }), now).recovery, "manual_action");
  const yt = classifyApprovedPastDue(record("rec2", {
    Platform: "YouTube", YouTube_Upload_Status: "Completed",
  }), now);
  assert.equal(yt.cause, "youtube_upload_not_publication");
  assert.equal(yt.recovery, "verify_remote_before_retry");
});

test("stalled Facebook photo or feed post with saved identity is FB3-only recovery, never repost", () => {
  for (const type of ["Facebook Photo Set", "Facebook Post"]) {
    const issue = classifyApprovedPastDue(record("rec1055", {
      Platform_Output_Type: type,
      Publish_Status: "Publishing",
      FB_Publish_Status: "Published Pending Finalize",
      Platform_Post_ID: "831080826745798_122147173317022170",
      FB_Last_Checked_At: "2026-10-03T12:02:57.000Z",
    }), now);
    assert.equal(issue.cause, "facebook_photo_existing_post_finalize_stalled");
    assert.equal(issue.recovery, "verify_remote_before_retry");
    assert.match(issue.action, /FB3 existing-Page-post Graph GET/);
    assert.match(issue.action, /never call FB0\/FB1\/FB2/);
  }
  // A pending Facebook Reel with a provider video id is not FB3 photo work.
  const reel = classifyApprovedPastDue(record("rec1691", {
    Platform_Output_Type: "Facebook Reel", Publish_Status: "Publishing",
    FB_Publish_Status: "Publishing Slideshow Reel", Platform_Post_ID: "1419429243115702",
  }), now);
  assert.equal(reel.cause, "remote_identity_not_public_visibility");
  assert.notEqual(reel.recovery, "existing_overdue_rescue");
});

test("verified published timestamp is repairable; generic ID, upload and hold are not", () => {
  assert.equal(publishedReceiptRepairReason(record("rec1", {
    Published_At: "2026-10-21T17:00:00Z",
    Platform_Post_URL: "https://www.facebook.com/example/posts/123",
  })), null);
  assert.equal(publishedReceiptRepairReason(record("rec1", {
    Published_At: "2026-10-21T17:00:00Z",
  })), "public_post_url_unverified");
  assert.equal(publishedReceiptRepairReason(record("rec1", { Platform_Post_URL: "https://youtu.be/abc" })),
    "no_authoritative_published_timestamp");
  assert.equal(publishedReceiptRepairReason(record("rec1", { Published_At: "2026-10-21T17:00:00Z",
    Platform_Post_URL: "https://www.facebook.com/example/posts/123",
    Output_Status: "Published", Publish_Status: "Published" })), "already_reconciled");
  assert.equal(publishedReceiptRepairReason(record("rec1", { Published_At: "2026-10-21T17:00:00Z",
    Do_Not_Publish: true })), "publication_held");
  assert.equal(publishedReceiptRepairReason(record("rec1", {
    Published_At: "2026-10-21T17:00:00Z",
    Platform_Post_URL: "https://www.youtube.com/watch?v=abcd",
    Platform: "YouTube", Publish_Status: "Published Privately",
  })), "publication_not_verified_public");
  assert.equal(publishedReceiptRepairReason(record("rec1", {
    Published_At: "2026-10-21T17:00:00Z",
    Platform_Post_URL: "https://www.tiktok.com/@test/video/12",
    Platform: "TikTok", TikTok_Draft_Status: "Draft Delivered",
  })), "draft_not_verified_public");
  const proof = classifyApprovedPastDue(record("rec3", {
    Published_At: "2026-10-21T17:00:00Z",
  }), now);
  assert.equal(proof.recovery, "verify_and_reconcile_status");
});

test("approved review with Ready for Review output is not a publish-ready dispatch", () => {
  const issue = classifyApprovedPastDue(record("rec2717", {
    Output_Status: "Ready for Review", Publish_Status: "Ready to Schedule",
  }), now);
  assert.equal(issue.cause, "approval_output_state_disagreement");
  assert.equal(issue.recovery, "repair_approval_state_not_publish");
});

test("failed publishing defers to cause-specific Quality Agent rather than recreating content", () => {
  const issue = classifyApprovedPastDue(record("rec1", {
    Publish_Status: "Failed", Publish_Attempt_Count: 2,
  }), now);
  assert.equal(issue.recovery, "existing_healer");
});

test("quality reports, cron and Factory UI are wired to one signature", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const worker = fs.readFileSync(path.join(dir, "worker.js"), "utf8");
  const ops = fs.readFileSync(path.join(dir, "worker-functions-04.mjs"), "utf8");
  const factory = fs.readFileSync(path.join(dir, "../studio-web/assets/factory-batch-quality-0710.js"), "utf8");
  assert.match(worker, /studioQualityAuditApprovedPastDue\(env/);
  assert.match(ops, /scanApprovedPastDueOutputs/);
  assert.match(ops, /publishedReceiptRepairReason/);
  assert.match(ops, /approved_past_due: approvedPastDue/);
  assert.match(factory, /approved_past_due/);
  assert.match(factory, /QA-PUBLISH-001/);
});

test("QA-PUBLISH-001 excludes failed statuses rather than double-count them as overdue",()=>{
 const formula=approvedPastDueFormula(now);
 assert.match(formula,/\{Output_Status\}!="Failed"/);
 assert.match(formula,/\{Publish_Status\}!="Failed"/);
});
