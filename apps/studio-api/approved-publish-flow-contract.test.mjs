import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deskHealOutputFilter } from "./supabase-pipeline-reads.mjs";

test("fresh publish selector gets only due approved never-dispatched Supabase outputs", () => {
  const query = deskHealOutputFilter("fresh_publish_ready", { nowMs: Date.parse("2026-11-20T19:00:00Z") });
  for (const fragment of [
    "do_not_publish=eq.false", "auto_publish_enabled=eq.true",
    "review_status=eq.Approved", "output_status=eq.", "publish_status=in.",
    "published_at=is.null", "Studio_Publish_Dispatch_Count",
    "publish_next_retry_at.lte.",
    "scheduled_post_date.lte.", "platform.eq.TikTok",
  ]) assert.ok(query.includes(fragment), fragment);
  assert.match(query, /Studio_Early_Hold_Recovery_Proof\.eq\.issue-2340-scheduled-hold-v1/,
    "only the per-record audited single historical scheduled-hold may bypass the old dispatch stamp");
  assert.match(query, /Studio_Publish_Dispatch_Count\.eq\.1/,
    "multi-dispatch rows remain in provider-reconciliation, never the fresh lane");
  assert.ok(!query.includes("publish_retry_eligible="), "fresh first posts may prohibit retry");
  assert.ok(query.includes("2026-11-20T19%3A15%3A00"), "TikTok lead cannot be widened");
});
test("Supabase publisher does not fall back to Airtable and is fenced before provider call", () => {
  const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const impl = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const start = impl.indexOf("export async function studioReconcileApprovedPublishes(env, options = {})");
  const end = impl.indexOf("/*__STUDIO_WORKER_END:studioReconcileApprovedPublishes__*/", start);
  assert.ok(start > 0 && end > start);
  const flow = impl.slice(start, end);
  assert.match(flow, /studioWriteSource\(env\) === "supabase"/);
  assert.match(flow, /listSupabaseDeskHealOutputs\(env,/);
  assert.match(flow, /kind: "fresh_publish_ready"/);
  assert.match(flow, /readSupabaseShapedOutput\(env, row.id\)/);
  assert.match(flow, /assessFreshSupabasePublish\(current/);
  assert.match(flow, /withOutputApprovalLock\(env.STUDIO_MEDIA/);
  const fence = flow.indexOf("env.STUDIO_MEDIA.put(key");
  const publish = flow.indexOf("studioDispatchApprovedPublishNow(env, current)");
  assert.ok(fence > 0 && publish > fence, "commit durable fence before any provider call");
  assert.match(flow, /prior_fenced_dispatch_requires_provider_reconciliation/);
  assert.match(worker, /const supabaseFreshPublishing = studioWriteSource\(env\) === "supabase"/);
  assert.match(worker, /ctx\.waitUntil\(studioReconcileApprovedPublishes\(env, \{ limit: 8 \}\)/);
  const anchored = worker.indexOf("Supabase fresh-publish flow failed closed");
  const cooling = worker.indexOf("cron skipped: Airtable cooling down");
  assert.ok(anchored > 0 && cooling > anchored, "Supabase flow must run before Airtable cooldown exit");
  assert.match(worker, /if \(!supabaseFreshPublishing\) \{\s*try \{\s*await studioReconcileApprovedPublishes/);
});

test("Supabase has only one initial publish cron owner, including scheduled due", () => {
  const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const marker = worker.indexOf("legacy overdue scheduled rescue cron failed");
  assert.ok(marker > 0);
  const guard = worker.lastIndexOf("if (!supabaseFreshPublishing)", marker);
  assert.ok(guard > 0 && marker - guard < 700, "legacy overdue rescue must be disabled when Supabase flow runs");
  const filter = deskHealOutputFilter("fresh_publish_ready", { nowMs: Date.parse("2026-11-20T19:00:00Z") });
  assert.match(filter, /publish_status=in\.\(/);
  assert.match(filter, /Ready%20to%20Schedule/);
  assert.match(filter, /Ready%20to%20Publish/);
});


test("approval future-hold never stamps a publishing attempt", () => {
  const source = fs.readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const begin = source.indexOf("export async function studioDispatchApprovedPublishAndSchedule(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:studioDispatchApprovedPublishAndSchedule__*/", begin);
  assert.ok(begin > 0 && end > begin);
  const body = source.slice(begin, end);
  const hold = body.slice(0, body.indexOf("const plan = studioPublishDispatchTarget"));
  assert.match(hold, /return \{ ok: true, skipped: "scheduled-hold"/);
  assert.doesNotMatch(hold, /studioStampPublishDispatch\(/,
    "no attempt counter write is allowed before the scheduled due time");
  const stamp = source.slice(
    source.indexOf("export async function studioStampPublishDispatch("),
    source.indexOf("/*__STUDIO_WORKER_END:studioStampPublishDispatch__*/")
  );
  assert.match(stamp, /scheduled-hold/);
  assert.ok(stamp.indexOf("scheduled-hold") < stamp.indexOf("publishDispatchAttemptStampFields"),
    "held-only receipts must be filtered BEFORE attempt counting");
});

test("Supabase fresh publisher processes oldest due first and paginates blocked media candidates", () => {
  const reader = fs.readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const begin = reader.indexOf("export async function listSupabaseDeskHealOutputs(");
  const section = reader.slice(begin, reader.indexOf("export function deskRequestFilter(", begin));
  assert.match(section, /order=scheduled_post_date\.asc\.nullslast,output_number\.asc/);
  assert.match(section, /offset=\$\{Math\.max\(0, Math\.min\(480/);
  const impl = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const start = impl.indexOf("export async function studioReconcileApprovedPublishes(env, options = {})");
  const end = impl.indexOf("/*__STUDIO_WORKER_END:studioReconcileApprovedPublishes__*/", start);
  const flow = impl.slice(start, end);
  assert.match(flow, /offset < 480/);
  assert.match(flow, /offset \+= pageSize/);
  assert.match(flow, /assessFreshSupabasePublish\(candidate,/);
  assert.match(flow, /readSupabaseShapedOutput\(env, row\.id\)/,
    "the second preflight after locking must remain authoritative");
  assert.ok(flow.indexOf("env.STUDIO_MEDIA.put(key") < flow.indexOf("studioDispatchApprovedPublishNow(env, current)"),
    "durable one-shot fence must remain ahead of every provider action");
});
