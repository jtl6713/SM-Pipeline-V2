import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  notifyStudioProfileSummary,
  validVerifiedStudioSummary,
} from "./profile-summary-controller.mjs";

const raw = (name) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), name), "utf8");
const ids = ["rec00000000000001","rec00000000000002","rec00000000000003","rec00000000000004"];
const snapshot = () => ({
  ok: true, version: 4, last_reconciled_at: Date.now(), degraded: false,
  records: ids.map((id, i) => ({
    id, city_label: ["Chicago", "New York", "Los Angeles", "Miami"][i],
    scheduled: { Facebook: 2, Instagram: 3, TikTok: 0, YouTube: 1 },
    manual: 0, failed: 0, approval: 2, ideas: 1, approved_unpublished: 0, overdue_unpublished: 0,
    approved_future: 0, approved_past_due: 0, approved_missing_date: 0, pipeline_total: 2,
    approved_future_by_platform: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    awaiting_final_by_platform: { Facebook: 0, Instagram: 2, TikTok: 0, YouTube: 0 },
    pipeline_by_platform: { Facebook: 0, Instagram: 2, TikTok: 0, YouTube: 0 },
    approved_calendar_slots: { Facebook: [], Instagram: [], TikTok: [], YouTube: [] },
  })),
});

test("only complete, recent, nondegraded, four-city snapshots can cut Home/refill over", () => {
  assert.equal(validVerifiedStudioSummary(snapshot(), ids), true);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), degraded: true }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), records: snapshot().records.slice(0, 3) }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), last_reconciled_at: Date.now() - 2 * 3600000 }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), records: snapshot().records.map((r) => ({ ...r, approval: NaN })) }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), records: snapshot().records.map((r) => ({ ...r, approved_calendar_slots: undefined })) }, ids), false);
});

test("POST/PATCH notifications are scoped to confirmed authoritative output/idea records", async () => {
  const calls = [];
  const env = {
    STUDIO_PROFILE_SUMMARY_CAPTURE_ENABLED: "true",
    AIRTABLE_OUTPUT_TABLE_ID: "tblOutput",
    AIRTABLE_IDEA_TABLE_ID: "tblIdea",
    STUDIO_PROFILE_SUMMARIES: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (url, opts) => {
          calls.push({ id, url, body: JSON.parse(opts.body) });
          return Response.json({ ok: true, queued: 1 });
        },
      }),
    },
  };
  const body = { records: [
    { id: ids[0] }, { id: ids[0] }, { id: "invalid" },
  ] };
  await notifyStudioProfileSummary(env, "tblOutput", "PATCH", body);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.kind, "output");
  assert.deepEqual(calls[0].body.ids, [ids[0]]);
  await notifyStudioProfileSummary(env, "tblIdea", "POST", { id: ids[1] });
  assert.equal(calls[1].body.kind, "idea");
  assert.deepEqual(calls[1].body.ids, [ids[1]]);
  await notifyStudioProfileSummary(env, "tblOutput", "GET", body);
  await notifyStudioProfileSummary(env, "tblContent", "PATCH", body);
  assert.equal(calls.length, 2);
});

test("Airtable response handling enqueues summary after success and before optional mirror", () => {
  const worker = raw("worker.js");
  const successful = worker.indexOf("if (!response.ok) {");
  const notify = worker.indexOf("await notifyStudioProfileSummary(env, tableId, options.method, body)");
  const mirror = worker.indexOf("await studioSupabaseWriteThroughAirtableMutation(env, tableId, options?.method, body)");
  assert.ok(successful >= 0 && notify > successful && mirror > notify);
});

test("reconciliation fences updates and never publishes staged partial totals", () => {
  const controller = raw("profile-summary-controller.mjs");
  const durable = raw("profile-summary-do.mjs");
  assert.match(controller, /await summaryRequest\(env, "\/begin", \{ generation, profiles: info \}\)/);
  assert.ok(controller.indexOf('await summaryRequest(env, "/begin"') < controller.indexOf('const outputs = (await listRecords'));
  assert.match(durable, /if \(this\.getMeta\("building_generation"\)\) return;/);
  assert.match(durable, /if \(staged\.length !== Number\(body\.expected_count\)/);
  assert.match(durable, /reconciliation_mismatch/);
  assert.match(durable, /last_reconciled_at/);
  assert.match(durable, /url.pathname === "\/status"/);
  assert.match(durable, /url.pathname === "\/fail"/);
  assert.match(controller, /listRecordsWithCoolingRetry/);
  assert.match(controller, /studioOverviewRowMatchesProfile\(row, profile\)/);
});

test("Supabase Phase 5 read wall and feature gates remain intact", () => {
  const home = raw("worker-functions-04.mjs");
  const worker = raw("worker.js");
  assert.match(home, /studioHomeReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(home, /if \(false && \(studioReadSource\(env\) === "supabase"/);
  assert.match(home, /STUDIO_HOME_PROFILE_SUMMARY_READS === "true"/);
  assert.match(worker, /STUDIO_PROFILE_SUMMARY_RECONCILE_ENABLED === "true"/);
  assert.match(home, /STUDIO_REFILL_PROFILE_SUMMARY_READS === "true"/);
});

test("operator summary reconcile is admitted through the Phase 2A write gate", () => {
  const worker = raw("worker.js");
  const gate = worker.slice(worker.indexOf("const allowedMethod ="), worker.indexOf("if (!allowedMethod)"));
  assert.match(gate, /isProfilesOverviewSummaryReconcileWrite/);
  assert.match(worker, /url\.pathname === "\/api\/profiles\/overview\/summary\/reconcile"/);
  assert.match(worker, /const result = await reconcileStudioProfileSummary\(env\)/);
  assert.match(worker, /studio_profile_summary_reconcile_await_v1: true/);
  assert.match(worker, /studio_profile_summary_home_membership_v1: true/);
});

test("shadow canary waits for awaited four-city reconcile instead of a 4-minute curl cut", () => {
  const canary = raw("../../.github/workflows/shadow-profile-summary-canary.yml");
  assert.match(canary, /--max-time 900/);
  assert.match(canary, /timeout-minutes: 45/);
  assert.match(canary, /summary-status/);
  assert.match(canary, /overview-refresh/);
  assert.match(canary, /cannot claim Home\/shadow parity against a stale cache/);
  assert.match(canary, /parity_retry=/);
  assert.match(canary, /shadow summary timing samples failed/);
  assert.doesNotMatch(canary, /ENABLE_HOME_PROFILE_SUMMARY_READS/);
});

test("production rollback treats both SQLite namespaces as lifecycle boundaries", () => {
  const workflow = raw("../../.github/workflows/deploy-cloudflare-worker-production.yml");
  assert.match(workflow, /from studio_api_rollback_lifecycle import decide_rollback/);
  assert.match(workflow, /STUDIO_SCHEDULE_RESERVATIONS/);
  assert.match(workflow, /STUDIO_PROFILE_SUMMARIES/);
  assert.match(workflow, /automatic_rollback_skipped=durable_object_lifecycle_boundary/);
  assert.match(workflow, /STUDIO_HOME_PROFILE_SUMMARY_READS']='false'/);
  assert.match(workflow, /STUDIO_REFILL_PROFILE_SUMMARY_READS']='false'/);
  assert.match(workflow, /SHADOW-PROFILE-SUMMARY/);
  assert.doesNotMatch(workflow, /ENABLE_HOME_PROFILE_SUMMARY_READS/);
});

test("SQLite overdue queue uses indexed due_at instead of a stale snapshot-time count", () => {
  const source = raw("profile-summary-do.mjs");
  assert.match(source, /idx_summary_ledger_due/);
  assert.match(source, /overdue_due_at<=\?/);
  assert.match(source, /row\.overdue_unpublished = overdue/);
});
