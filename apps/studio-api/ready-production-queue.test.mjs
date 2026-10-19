import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  READY_PRODUCTION_MAX_CONCURRENCY,
  readyProductionClaim,
  readyProductionEnqueue,
  readyProductionFinishClaim,
  readyProductionList,
  readyProductionOutputsAwaitingFinalApproval,
  readyProductionRetryDelayMs,
  readyProductionSelectJobs,
} from "./ready-production-queue.mjs";

class FakeR2 {
  constructor() {
    this.rows = new Map();
    this.version = 0;
  }
  async get(key) {
    const row = this.rows.get(key);
    if (!row) return null;
    return {
      etag: row.etag,
      text: async () => row.body,
    };
  }
  async put(key, body, options = {}) {
    const current = this.rows.get(key);
    const onlyIf = options.onlyIf;
    const absent = onlyIf instanceof Headers && onlyIf.get("If-None-Match") === "*";
    if (absent && current) return null;
    if (onlyIf?.etagMatches && current?.etag !== onlyIf.etagMatches) return null;
    if (onlyIf?.etagMatches && !current) return null;
    const etag = `etag-${++this.version}`;
    this.rows.set(key, {
      body: String(body),
      etag,
      uploaded: new Date().toISOString(),
      customMetadata: options.customMetadata || {},
    });
    return { etag };
  }
  async list({ prefix }) {
    const objects = [...this.rows.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, row]) => ({ key, uploaded: row.uploaded, customMetadata: row.customMetadata }));
    return { objects, truncated: false };
  }
}

test("Ready-to-produce queue provides durable idempotent claims and stale-lease recovery", async () => {
  const bucket = new FakeR2();
  const first = await readyProductionEnqueue(bucket, {
    ideaId: "recReadyIdea000001",
    profileId: "recReadyProfile001",
    createdAt: "2026-10-19T12:00:00.000Z",
  });
  const duplicate = await readyProductionEnqueue(bucket, {
    ideaId: "recReadyIdea000001",
    profileId: "recReadyProfile001",
  });
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal((await readyProductionList(bucket)).length, 1);

  const claimed = await readyProductionClaim(bucket, "recReadyIdea000001", "owner-a", 1_000, 5_000);
  assert.equal(claimed.job.status, "running");
  assert.equal(await readyProductionClaim(bucket, "recReadyIdea000001", "owner-b", 2_000, 5_000), null);
  const reclaimed = await readyProductionClaim(bucket, "recReadyIdea000001", "owner-b", 7_000, 5_000);
  assert.equal(reclaimed.owner, "owner-b");
  assert.equal(reclaimed.job.attempts, 2);
});

test("Ready-to-produce selection is globally bounded and fair across profiles", () => {
  const jobs = [
    { idea_id: "a", profile_id: "p1", status: "queued", created_at: "2026-10-19T12:00:00Z" },
    { idea_id: "b", profile_id: "p1", status: "queued", created_at: "2026-10-19T12:01:00Z" },
    { idea_id: "c", profile_id: "p2", status: "retry_wait", next_attempt_ms: 0, created_at: "2026-10-19T12:02:00Z" },
    { idea_id: "d", profile_id: "p3", status: "queued", created_at: "2026-10-19T12:03:00Z" },
  ];
  const selected = readyProductionSelectJobs(jobs, { nowMs: 10_000 });
  assert.equal(READY_PRODUCTION_MAX_CONCURRENCY, 2);
  assert.deepEqual(selected.map((job) => job.idea_id), ["a", "c"]);
});

test("Ready-to-produce failures back off and a completed claim releases its lease", async () => {
  const bucket = new FakeR2();
  await readyProductionEnqueue(bucket, { ideaId: "recReadyIdea000002", profileId: "recReadyProfile002" });
  const lease = await readyProductionClaim(bucket, "recReadyIdea000002", "owner-a", 1_000, 5_000);
  const retry = await readyProductionFinishClaim(bucket, lease, {
    status: "retry_wait",
    stage: "waiting_variants",
    last_error: "variants still preparing",
  }, 2_000);
  assert.equal(retry.owner, null);
  assert.equal(retry.next_attempt_ms, 2_000 + readyProductionRetryDelayMs(1));
  assert.equal(await readyProductionClaim(bucket, "recReadyIdea000002", "owner-b", 3_000), null);
});

test("Awaiting final approval requires every output to be review-ready and unapproved", () => {
  assert.equal(readyProductionOutputsAwaitingFinalApproval([
    { fields: { Output_Status: "Ready for Review", Review_Status: "Review Sent", Render_Status: "Rendered" } },
    { fields: { Output_Status: "Ready for Review", Review_Status: "", Render_Status: "Native Photo Route" } },
  ]), true);
  assert.equal(readyProductionOutputsAwaitingFinalApproval([
    { fields: { Output_Status: "Ready for Review", Review_Status: "Approved", Render_Status: "Rendered" } },
  ]), false);
  assert.equal(readyProductionOutputsAwaitingFinalApproval([
    { fields: { Output_Status: "In Production", Review_Status: "", Render_Status: "Rendering" } },
  ]), false);
});

test("Worker continuously dispatches every Airtable-ready profile but never performs final approval", async () => {
  const worker = await readFile(new URL("./worker.js", import.meta.url), "utf8");
  const functions = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  assert.match(worker, /version: "0\.10\.667-ready-production-flow"/);
  assert.match(worker, /studio_ready_production_flow_v1: true/);
  const minuteCron = worker.slice(
    worker.indexOf('if (String(event?.cron || "").trim() === "* * * * *")'),
    worker.indexOf("// 2026-10-11 burn-kill"),
  );
  assert.match(minuteCron, /studioReadyProductionCronResume\(env, ctx\)/);
  // Regression for incident #907: Factory recovery must never block the
  // first planning attempt of another profile's already-asset-ready draft.
  assert.equal((minuteCron.match(/ctx\.waitUntil\(/g) || []).length, 2,
    "cron must register two independent lifetime promises");
  assert.ok(minuteCron.indexOf("await studioReadyProductionCronResume(env, ctx)") <
    minuteCron.indexOf("await factoryBatchCronResume(env, ctx)"),
    "the ready dispatcher must start before potentially slow Factory recovery");
  assert.match(minuteCron, /console\.info\("Ready-to-produce one-minute dispatch"/);

  assert.match(functions, /Studio_Photo_Wait_Status}='Ready'/);
  const plan = functions.slice(functions.indexOf("function readyProductionIdeaPlan("),
    functions.indexOf("async function monitorReadyProductionRequest("));
  assert.match(plan, /PR_PLATFORMS\.has\(platform\)/,
    "retired suggestions must never break an existing photo-ready draft");
  const dispatcher = functions.slice(
    functions.indexOf("async function studioReadyProductionCronResume"),
    functions.indexOf("export async function getStudioOperations(request"),
  );
  assert.match(dispatcher, /maxPerProfile: 1/);
  assert.match(dispatcher, /final_approval: "human_only"/);
  assert.doesNotMatch(dispatcher, /factoryApproveOutput|approveOutputRecordForPublishing|Review_Status:\s*"Approved"/);
  assert.doesNotMatch(dispatcher, /Autonomous_Produce_Enabled/);
});


test("P0 #907 exposes cron-stage diagnostics only through tenant-admin GET; no queue mutations", async () => {
  const worker = await readFile(new URL("./worker.js", import.meta.url), "utf8");
  const functions = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  assert.match(worker, /const isReadyProductionDiagnosticRoute = url\.pathname === "\/api\/admin\/ready-production-diagnostic"/);
  assert.match(worker, /if \(isReadyProductionDiagnosticRoute\) \{\s*requirePermission\(authorization, "tenant_admin"\);\s*if \(request\.method !== "GET"\)/);
  assert.match(functions, /async function getStudioReadyProductionDiagnostic\(/);
  const diagnostic = functions.slice(functions.indexOf("export async function getStudioReadyProductionDiagnostic("), functions.indexOf("export async function getStudioOperations("));
  assert.match(diagnostic, /readyProductionRead\(env\.STUDIO_MEDIA, id\)/);
  assert.doesNotMatch(diagnostic, /readyProductionClaim|readyProductionEnqueue|studioReadyProductionCronResume\(/);
  const dispatcher = functions.slice(functions.indexOf("async function studioReadyProductionCronResume("), functions.indexOf("export \{ studioReadyProductionCronResume \}"));
  assert.match(dispatcher, /recordRun\("running"\)/);
  assert.match(dispatcher, /recordRun\("failed"/);
  assert.match(dispatcher, /recordRun\("completed"/);
  for (const stage of ["authorization", "discovery", "enqueue", "list", "claim", "process"]) {
    assert.match(dispatcher, new RegExp(stage));
  }
});


test("P0 #907 Airtable discovery never selects nonexistent Production_Notes on Idea Candidates", async () => {
  const functions = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const discovery = functions.slice(
    functions.indexOf("async function discoverReadyProductionIdeas("),
    functions.indexOf("async function readyProductionRequestForIdea("),
  );
  assert.match(discovery, /Production_Config_Notes/);
  assert.doesNotMatch(discovery, /"Production_Notes"\s*,/);
  assert.match(discovery, /READY_PRODUCTION_IDEA_FORMULA/);
});
