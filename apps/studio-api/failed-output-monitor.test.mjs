import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scanOutstandingFailedOutputs, describeFailedOutput, failedOutputRetryGate, facebookRateLimitResetReason } from "./failed-output-monitor.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
const healing = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");
const factory = fs.readFileSync(path.join(here, "../studio-web/assets/factory-batch-quality-0710.js"), "utf8");
const deployWorkflow = fs.readFileSync(path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");
const record = (id, fields = {}) => ({ id, fields });

test("paginated failed-output scan returns every outstanding record, without the newest-12 cap", async () => {
  const rows = Array.from({ length: 235 }, (_, i) => record("rec" + i, {
    Output_ID: i + 1, Content_Profile: ["recCity" + (i % 4)],
  }));
  let calls = 0;
  const found = await scanOutstandingFailedOutputs(async ({ limit, offset }) => {
    calls += 1;
    assert.equal(limit, 100);
    const start = offset ? Number(offset) : 0;
    return { records: rows.slice(start, start + limit),
      offset: start + limit < rows.length ? String(start + limit) : null };
  });
  assert.equal(calls, 3);
  assert.equal(found.length, 235);
  assert.equal(new Set(found.map(row => row.fields.Content_Profile[0])).size, 4);
  assert.equal(found[0].id, "rec0");
  assert.equal(found[234].id, "rec234");
});

test("failed-output scan never transforms a partial/error response into a false zero", async () => {
  await assert.rejects(scanOutstandingFailedOutputs(async () => {
    throw new Error("Airtable unavailable");
  }), /Airtable unavailable/);
  await assert.rejects(scanOutstandingFailedOutputs(async () => ({ records: null })), /invalid page/);
  await assert.rejects(scanOutstandingFailedOutputs(async () => ({ records: [], offset: "repeat" })), /repeated/);
});

test("safe retries respect publication evidence, holds, retry limits, cooldowns and live locks", () => {
  const now = Date.parse("2026-10-20T18:00:00Z");
  assert.equal(failedOutputRetryGate(record("rec1", { Platform_Post_ID: "platform_123" }), { nowMs: now }), "publication_evidence");
  assert.equal(failedOutputRetryGate(record("rec1", { Published_At: "2026-10-19T12:00:00Z" }), { nowMs: now }), "publication_evidence");
  assert.equal(failedOutputRetryGate(record("rec1", { Do_Not_Publish: true }), { nowMs: now }), "publication_held");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Attempt_Count: 3 }), { nowMs: now }), "retry_limit");
  assert.equal(failedOutputRetryGate(record("rec1", { Studio_Publish_Dispatch_Count: 3 }), { nowMs: now }), "retry_limit");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Next_Retry_At: "2026-10-20T19:00:00Z" }), { nowMs: now }), "cooldown");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Locked_By: "runner", Publish_Locked_At: "2026-10-20T17:58:00Z" }), { nowMs: now }), "publish_locked");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Status: "Failed" }), { nowMs: now }), null);
});

test("every raw failure has a visible identity, diagnostic and recommended action", () => {
  const item = describeFailedOutput(record("recLA", {
    Output_ID: 1703, Platform: "Instagram", Output_Status: "Failed",
    Remotion_Error_Message: "Download failed", Content_Profile: ["recLA"],
  }));
  assert.equal(item.output_id, "1703");
  assert.equal(item.profile_id, "recLA");
  assert.match(item.error, /Download failed/);
  assert.match(item.action, /inspect/i);
  assert.equal(item.recovery, "needs_attention");
});

test("known live failure signatures get safe root-cause actions instead of blind retries", () => {
  const cases = [
    ["AP1C slide-set mismatch", "needs_attention", /actual carousel slides/i],
    ["Only photo or video can be accepted as media type", "needs_attention", /unsupported carousel slide media/i],
    ["AP3P parent container terminal state", "healer_eligible", /parent-container recreation/i],
    ["Facebook rate limit 1390008", "cooldown", /publishing cooldown/i],
  ];
  for (const [error, recovery, action] of cases) {
    const item = describeFailedOutput(record("recKnown", {
      Output_ID: 99, Platform: "Instagram", Publish_Status: "Failed",
      Publish_Error_Message: error,
    }));
    assert.equal(item.recovery, recovery, error);
    assert.match(item.action, action, error);
  }
});

test("Desk and Factory use the complete census and show scan failures as unavailable", () => {
  assert.match(worker, /loadStudioFailedOutputSnapshot/);
  assert.match(worker, /scanOutstandingFailedOutputs/);
  assert.match(worker, /status: "unavailable"/);
  assert.match(worker, /output_failures: outputFailures/);
  assert.match(worker, /output_failed_unclassified/);
  assert.match(factory, /Unresolved output failures across all profiles/);
  assert.match(factory, /profile_name \|\| item\.profile_id/);
  assert.match(factory, /output_failures\?\.status !== "ok"/);
  assert.match(factory, /Unresolved output count is unknown/);
  assert.match(healing, /failedOutputRetryGate\(row\)/);
  assert.match(healing, /scanOutstandingFailedOutputs/);
  assert.match(deployWorkflow, /failed-output-census/);
  assert.match(deployWorkflow, /\.output_failures\.status=="ok"/);
});

test("render recovery counts only eligible failed-render attempts and remains bounded", () => {
  const declaration = healing.indexOf("let failedRenderRetries = 0;");
  const loopEnd = healing.indexOf('console.log("Studio stuck-render heal"', declaration);
  assert.ok(declaration > 0 && loopEnd > declaration, "failed-render recovery loop must exist");
  assert.doesNotMatch(healing.slice(0, declaration), /failedRenderRetries\s*\+=\s*1/);
  const loop = healing.slice(declaration, loopEnd);
  assert.match(loop, /if \(failedRenderRetries >= 6\) break/);
  assert.match(loop, /if \(failedOutputRetryGate\(row\)\) continue/);
  assert.match(loop, /failedRenderRetries\s*\+=\s*1;[\s\S]*?airtableFetch/);
});

test("Facebook rate-limit failures can return to Approved only with safe publication and media evidence", () => {
  const safe = record("recFacebook", {
    Platform: "Facebook", Review_Status: "Approved", Publish_Status: "Failed",
    Publish_Error_Message: "Facebook rate limit (368/1390008): Try later",
    Final_File_ID: "fileReady", Render_Status: "Completed", Publish_Attempt_Count: 1,
  });
  assert.equal(facebookRateLimitResetReason(safe), null);
  assert.equal(describeFailedOutput(safe).can_return_to_approved, true);
  const blocked = (changes, reason) =>
    assert.equal(facebookRateLimitResetReason(record("recFacebook", { ...safe.fields, ...changes })), reason);
  blocked({ Platform: "Instagram" }, "not_facebook");
  blocked({ Publish_Error_Message: "OAuth token expired" }, "not_rate_limited");
  blocked({ Review_Status: "Needs Review" }, "approval_not_confirmed");
  blocked({ Platform_Post_ID: "remote_post" }, "publication_evidence");
  blocked({ FB_Post_ID: "remote_post" }, "publication_evidence");
  blocked({ Do_Not_Publish: true }, "publication_held");
  blocked({ Publish_Attempt_Count: 3 }, "retry_limit");
  blocked({ Studio_Publish_Dispatch_Count: 3 }, "retry_limit");
  blocked({ Render_Status: "Failed" }, "render_failed");
  blocked({ Final_File_ID: "", Final_File_URL: "" }, "finished_media_missing");
  blocked({ Publish_Locked_By: "runner", Publish_Locked_At: new Date().toISOString() }, "publish_locked");
});

test("Facebook QA reapproval uses original protected scheduling route and cooldown-aware MAE", () => {
  assert.match(worker, /quality_rate_limit_recovery === true/);
  assert.match(worker, /facebookRateLimitResetReason\(authoritative\)/);
  assert.match(worker, /qualityFacebookRecoverySlot\(/);
  assert.match(worker, /48 \* 60 \* 60 \* 1000/);
  assert.match(worker, /gapMs: 12 \* 60 \* 60 \* 1000/);
  assert.match(worker, /Output_Status: "Approved for Publishing"/);
  assert.match(worker, /Publish_Status: "Ready to Schedule"/);
  assert.match(worker, /runAtomicScheduleTransaction/);
  assert.match(worker, /fresh_output_failures/);
  assert.match(factory, /data-qa-open/);
  assert.match(factory, /data-qa-reapprove-all/);
  assert.match(factory, /window\.confirm/);
  assert.match(factory, /for \(const item of allowed\)/);
});
