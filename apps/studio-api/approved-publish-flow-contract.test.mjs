import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deskHealOutputFilter } from "./supabase-pipeline-reads.mjs";

test("fresh publish selector gets only due approved never-dispatched Supabase outputs", () => {
  const query = deskHealOutputFilter("fresh_publish_ready", { nowMs: Date.parse("2026-11-20T19:00:00Z") });
  for (const fragment of [
    "do_not_publish=eq.false", "auto_publish_enabled=eq.true",
    "review_status=eq.Approved", "output_status=eq.", "publish_status=eq.",
    "published_at=is.null", "Studio_Publish_Dispatch_Count",
    "publish_retry_eligible.is.null", "publish_next_retry_at.lte.",
    "scheduled_post_date.lte.", "platform.eq.TikTok",
  ]) assert.ok(query.includes(fragment), fragment);
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
