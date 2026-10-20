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
  records: ids.map((id) => ({
    id, scheduled: { Facebook: 2, Instagram: 3, TikTok: 0, YouTube: 1 },
    manual: 0, failed: 0, approval: 2, ideas: 1, overdue_unpublished: 0,
  })),
});

test("only complete, recent, nondegraded, four-city snapshots can cut Home/refill over", () => {
  assert.equal(validVerifiedStudioSummary(snapshot(), ids), true);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), degraded: true }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), records: snapshot().records.slice(0, 3) }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), last_reconciled_at: Date.now() - 2 * 3600000 }, ids), false);
  assert.equal(validVerifiedStudioSummary({ ...snapshot(), records: snapshot().records.map((r) => ({ ...r, approval: NaN })) }, ids), false);
});

test("POST/PATCH notifications are scoped to confirmed authoritative output/idea records", async () => {
  const calls = [];
  const env = {
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
  assert.ok(controller.indexOf('await summaryRequest(env, "/begin"') < controller.indexOf('const outputs = await listRecords'));
  assert.match(durable, /if \(this\.getMeta\("building_generation"\)\) return;/);
  assert.match(durable, /if \(staged\.length !== Number\(body\.expected_count\)/);
  assert.match(durable, /reconciliation_mismatch/);
  assert.match(durable, /last_reconciled_at/);
});

test("Supabase Phase 5 read wall and feature gates remain intact", () => {
  const home = raw("worker-functions-04.mjs");
  const worker = raw("worker.js");
  assert.match(home, /if \(false && \(studioReadSource\(env\) === "supabase"/);
  assert.match(home, /STUDIO_HOME_PROFILE_SUMMARY_READS === "true"/);
  assert.match(worker, /STUDIO_PROFILE_SUMMARY_RECONCILE_ENABLED === "true"/);
});

test("SQLite overdue queue uses indexed due_at instead of a stale snapshot-time count", () => {
  const source = raw("profile-summary-do.mjs");
  assert.match(source, /idx_summary_ledger_due/);
  assert.match(source, /overdue_due_at<=\?/);
  assert.match(source, /overdue_unpublished: overdue/);
});
