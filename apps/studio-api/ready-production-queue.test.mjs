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
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);
  assert.match(worker, /studio_ready_production_flow_v1: true/);
  const minuteCron = worker.slice(
    worker.indexOf('if (String(event?.cron || "").trim() === "* * * * *")'),
    worker.indexOf("// 2026-10-11 burn-kill"),
  );
  assert.match(minuteCron, /studioReadyProductionCronResume\(env, ctx\)/);
  // Regression for incident #907: Factory recovery must never block the
  // first planning attempt of another profile's already-asset-ready draft.
  assert.ok((minuteCron.match(/ctx\.waitUntil\(/g) || []).length >= 3,
    "cron must register Ready, Factory, and low-cost legacy backlog promises");
  assert.match(minuteCron, /autoListenOpenPhotoIdeas\(env, \{ limit: 2, initializeOnly: true \}\)/);
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

test("P0 #907 discovery requests only fields present on Airtable Idea Candidates", async () => {
  const source = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const discovery = source.slice(source.indexOf("async function discoverReadyProductionIdeas("),
    source.indexOf("async function readyProductionRequestForIdea("));
  assert.ok(discovery.startsWith("async function discoverReadyProductionIdeas("));
  const queried = discovery.match(/fields:\s*\[([\s\S]*?)\]/);
  assert.ok(queried, "discovery must use a bounded explicit field projection");
  const fields = [...queried[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  // Verified against the authoritative Idea Candidates table on 2026-10-19.
  // Production_Notes is a field on Production Requests, NOT Idea Candidates.
  const allowed = new Set([
    "Candidate_Title", "Candidate_Status", "Content_Profile", "Content Items",
    "Promoted_Content_Record_ID", "Production Requests", "Studio_Photo_Wait_Status",
    "Studio_Matched_Media_Assets", "Production_Config_Notes",
    "Production_Content_Type", "Production_Target_Platforms", "Suggested_Platforms",
    "Production_Include_Voiceover", "Production_Include_Background_Music",
    "Production_Include_Thumbnail", "Production_Video_Duration", "Test_Run_ID", "Create_Date",
  ]);
  assert.ok(fields.length >= 12, "cannot silently disable essential discovery fields");
  assert.deepEqual(fields.filter(name => !allowed.has(name)), [],
    "unknown projected fields cause a 422 that blocks the entire one-minute queue");
  assert.ok(!fields.includes("Production_Notes"));
  assert.ok(fields.includes("Production_Config_Notes"));
});

test("P0 #907 platform filtering imports PR_PLATFORMS across the Worker split", async () => {
  const worker = await readFile(new URL("./worker.js", import.meta.url), "utf8");
  const functions = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  assert.match(worker, /const PR_PLATFORMS = new Set\(/);
  assert.match(worker, /\r?\n\s*PR_PLATFORMS,\r?\n/, "worker.js must export canonical PR_PLATFORMS");
  const workerImport = functions.match(/import\s*\{([\s\S]*?)\}\s*from "\.\/worker\.js";/);
  assert.ok(workerImport, "extracted module must import from worker.js");
  assert.match(workerImport[1], /\bPR_PLATFORMS\b/,
    "without this import, every eligible Ready idea fails with ReferenceError");
  const planner = functions.slice(functions.indexOf("function readyProductionIdeaPlan("),
    functions.indexOf("async function monitorReadyProductionRequest("));
  assert.match(planner, /PR_PLATFORMS\.has\(platform\)/);
});

test("P0 #907 immediately reclaims only the corrected platform-registry ReferenceError", async () => {
  const bucket = new FakeR2();
  const ideaId = "recReadyIdea907Fix1";
  const profileId = "recReadyProfile907";
  await readyProductionEnqueue(bucket, { ideaId, profileId });
  const lease = await readyProductionClaim(bucket, ideaId, "owner-a", 1_000, 5_000);
  const parked = await readyProductionFinishClaim(bucket, lease, {
    status: "retry_wait",
    stage: "retry",
    last_error: "PR_PLATFORMS is not defined",
    retry_delay_ms: 30 * 60 * 1000,
  }, 2_000);
  assert.equal(parked.next_attempt_ms, 1_802_000);
  const recovered = await readyProductionEnqueue(bucket, { ideaId, profileId });
  assert.equal(recovered.created, false);
  assert.equal(recovered.revived, true);
  assert.equal(recovered.job.status, "queued");
  assert.equal(recovered.job.next_attempt_ms, 0);
  assert.equal(recovered.job.last_error, null);
  const claimed = await readyProductionClaim(bucket, ideaId, "owner-b", Date.now());
  assert.equal(claimed.job.attempts, 2, "recovery must not erase attempt history");
  assert.equal((await readyProductionList(bucket)).length, 1, "must not duplicate existing R2 job");
  assert.notEqual((await readyProductionEnqueue(bucket, { ideaId, profileId })).revived, true,
    "leased running job must not be reset");
  const other = "recReadyIdea907Fix2";
  await readyProductionEnqueue(bucket, { ideaId: other, profileId });
  const otherLease = await readyProductionClaim(bucket, other, "owner-c", 1_000, 5_000);
  await readyProductionFinishClaim(bucket, otherLease, {
    status: "retry_wait", stage: "retry", last_error: "Waiting for variant renderer",
    retry_delay_ms: 30 * 60 * 1000,
  }, 2_000);
  const unchanged = await readyProductionEnqueue(bucket, { ideaId: other, profileId });
  assert.notEqual(unchanged.revived, true);
  assert.equal(unchanged.job.status, "retry_wait");
  assert.equal(unchanged.job.next_attempt_ms, 1_802_000);
});

test("Ready dispatcher separately schedules new planning and due render monitors", () => {
  const jobs = [
    { idea_id: "old-monitor", profile_id: "miami", status: "awaiting_review", created_at: "2026-10-18T01:00:00Z" },
    { idea_id: "new-planner", profile_id: "chicago", status: "queued", created_at: "2026-10-18T02:00:00Z" },
    { idea_id: "other-planner", profile_id: "nyc", status: "queued", created_at: "2026-10-18T03:00:00Z" },
  ];
  assert.deepEqual(readyProductionSelectJobs(jobs, { nowMs: 10000 }).map((job) => job.idea_id),
    ["new-planner", "old-monitor"], "old render monitoring must not occupy both continuation slots");
  assert.deepEqual(readyProductionSelectJobs(jobs.slice(1), { nowMs: 10000 }).map((job) => job.idea_id),
    ["new-planner", "other-planner"], "when no monitor is due both slots can plan");
  jobs[0].next_attempt_ms = 10001;
  assert.deepEqual(readyProductionSelectJobs(jobs, { nowMs: 10000 }).map((job) => job.idea_id),
    ["new-planner", "other-planner"], "not-yet-due monitors cannot block ready drafts");
});

test("Awaiting-review jobs release the lease and defer monitoring while renders run", async () => {
  const bucket = new FakeR2();
  const ideaId = "recAwaitReview907";
  await readyProductionEnqueue(bucket, { ideaId, profileId: "recReadyProfile907" });
  const lease = await readyProductionClaim(bucket, ideaId, "first", 1_000, 5_000);
  const waiting = await readyProductionFinishClaim(bucket, lease, {
    status: "awaiting_review", stage: "production_render_qa",
  }, 2_000);
  assert.equal(waiting.status, "awaiting_review");
  assert.equal(waiting.next_attempt_ms, 182_000);
  assert.equal(waiting.owner, null);
  assert.equal(await readyProductionClaim(bucket, ideaId, "too-soon", 61_999), null);
  const retry = await readyProductionClaim(bucket, ideaId, "due", 183_000);
  assert.equal(retry.owner, "due");
});

test("Ready production backfills existing linked asset-ready autonomous drafts with blank photo status", async () => {
  const functions = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const eligibility = functions.slice(functions.indexOf("function readyProductionExistingDraftEligible("),
    functions.indexOf("async function readyProductionRequestForIdea("));
  assert.match(eligibility, /Studio_Master_Asset_Status/);
  assert.match(eligibility, /Studio_Master_Asset_Count/);
  assert.match(eligibility, /linkedRecordIds\(f\(requestRecord, "Idea_Candidate"\)\)/);
  assert.match(eligibility, /origin=\(\?:autonomous\|prepare-to-review\)/);
  assert.match(eligibility, /return readyProductionExistingDraftEligible\(idea, requestRecord\)/);
  const draftQuery = eligibility.slice(eligibility.indexOf("async function discoverAssetReadyProductionDrafts("));
  assert.match(draftQuery, /sortField: "Created_At"/);
  assert.match(draftQuery, /Studio_Master_Asset_Status}='Ready'/);
  assert.match(draftQuery, /Studio_Master_Asset_Count}>0/);
  assert.doesNotMatch(draftQuery, /FIND\('origin=autonomous'/,
    "Ready-master discovery must not exclude older approved manual-origin drafts");
  const dispatcher = functions.slice(functions.indexOf("async function studioReadyProductionCronResume("),
    functions.indexOf("export { studioReadyProductionCronResume };"));
  assert.match(dispatcher, /discoverAssetReadyProductionDrafts\(env/);
  assert.match(dispatcher, /const known = new Map\(jobs\.map/);
  assert.match(dispatcher, /maxBackfillPerTick/);
  assert.match(dispatcher, /readyProductionEnqueue\(env.STUDIO_MEDIA/);
  assert.match(dispatcher, /draft_backfilled: backfilled/);
  assert.match(eligibility, /productionNotesRevisionOpen/,
    "human revision stays an explicit dispatch hold");
  assert.match(eligibility, /Candidate_Status/,
    "non-autonomous drafts need explicit Idea approval");
  const processor = functions.slice(functions.indexOf("async function processReadyProductionClaim("),
    functions.indexOf("async function studioReadyProductionCronResume("));
  assert.match(processor, /readyProductionIdeaEligible\(idea, requestRecord\)/);
  assert.match(processor, /autonomousMasterMediaIds\(item4ParseJson/);
  assert.match(processor, /if \(!requestRecord\) \{/); // Only absent link may create a draft.
});

test("P0 #907 never treats an empty Ready plan as complete", async () => {
  const worker01 = await readFile(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const worker04 = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const item4 = worker01.slice(worker01.indexOf("export async function buildItem4OutputPlan("),
    worker01.indexOf("/*__STUDIO_WORKER_END:buildItem4OutputPlan__*/"));
  assert.match(item4, /if \(!plannedItems\.length\)/);
  assert.match(item4, /No supported platform output destinations in plan/);
  assert.ok(item4.indexOf("if (!plannedItems.length)") <
    item4.indexOf("await item4SyncPlanOutputs"),
    "must reject empty plan before writing any output or Ready state");

  const plan = worker04.slice(worker04.indexOf("function readyProductionIdeaPlan("),
    worker04.indexOf("async function monitorReadyProductionRequest("));
  assert.match(plan, /autonomousItem4Platforms\(canonicalProductionPlatforms/);
  assert.match(plan, /PR_PLATFORMS\.has\(platform\)/);
  assert.match(plan, /plan\.items\.length > 0/);
  const check = worker04.slice(worker04.indexOf("function autonomousHasUsableItem4Plan("),
    worker04.indexOf("async function monitorReadyProductionRequest("));
  assert.match(check, /Studio_Output_Plan_JSON/);
  assert.match(check, /Studio_Output_Plan_Status/);
  assert.match(check, /plan\.items\.length > 0/);

  const queued = worker04.slice(worker04.indexOf("async function processReadyProductionClaim("),
    worker04.indexOf("async function studioReadyProductionCronResume("));
  assert.match(queued, /if \(!autonomousHasUsableItem4Plan\(requestRecord\)\)/,
    "linked Draft with an empty Ready plan must be rebuilt before preparing variants");
  const finish = worker04.slice(worker04.indexOf("export async function finishAutonomousProductionRequest("),
    worker04.indexOf("/*__STUDIO_WORKER_END:finishAutonomousProductionRequest__*/"));
  assert.match(finish, /if \(!autonomousHasUsableItem4Plan\(current\)\)/,
    "automatic continuation must not skip invalid Ready plans");
  const manual = worker04.slice(worker04.indexOf("export async function prepareIdeaToReview("),
    worker04.indexOf("/*__STUDIO_WORKER_END:prepareIdeaToReview__*/"));
  assert.match(manual, /autonomousItem4Platforms\(canonicalProductionPlatforms/);
  assert.match(manual, /fallback: !explicitlySelectedPlatforms/);
  assert.match(manual, /if \(!autonomousHasUsableItem4Plan\(requestRecord\)\)/);
});

test("P0 #907 releases invalid empty-plan retry once without losing lease or retry protection", async () => {
  const bucket = new FakeR2();
  const ideaId = "recEmptyPlan907NYC";
  const profileId = "recReadyProfile907";
  const obsolete = "Build a complete platform output plan before preparing platform media";
  await readyProductionEnqueue(bucket, { ideaId, profileId });
  const lease = await readyProductionClaim(bucket, ideaId, "original", 1_000, 5_000);
  const parked = await readyProductionFinishClaim(bucket, lease, {
    status: "retry_wait", stage: "retry", last_error: obsolete,
    retry_delay_ms: 30 * 60 * 1000,
  }, 2_000);
  assert.equal(parked.next_attempt_ms, 1_802_000);
  const resumed = await readyProductionEnqueue(bucket, { ideaId, profileId });
  assert.equal(resumed.created, false);
  assert.equal(resumed.revived, true);
  assert.equal(resumed.job.status, "queued");
  assert.equal(resumed.job.next_attempt_ms, 0);
  assert.equal(resumed.job.stage, "recovered_empty_item4_plan");
  assert.ok(resumed.job.empty_plan_recovered_at);
  assert.equal((await readyProductionList(bucket)).length, 1);
  const newLease = await readyProductionClaim(bucket, ideaId, "new-owner", Date.now());
  assert.equal(newLease.job.attempts, 2);
  assert.notEqual((await readyProductionEnqueue(bucket, { ideaId, profileId })).revived, true);

  // A real error persisting after the repair must NOT be retried instantly
  // on every one-minute tick. Keep the ordinary backoff and marker.
  const now = Date.now();
  const stillBroken = await readyProductionFinishClaim(bucket, newLease, {
    status: "retry_wait", stage: "retry", last_error: obsolete,
    retry_delay_ms: 30 * 60 * 1000,
  }, now);
  assert.ok(stillBroken.empty_plan_recovered_at);
  const next = await readyProductionEnqueue(bucket, { ideaId, profileId });
  assert.notEqual(next.revived, true);
  assert.equal(next.job.status, "retry_wait");
  assert.equal(next.job.next_attempt_ms, now + 30 * 60 * 1000);

  const otherId = "recOtherRetry907";
  await readyProductionEnqueue(bucket, { ideaId: otherId, profileId });
  const otherLease = await readyProductionClaim(bucket, otherId, "other", 1_000, 5_000);
  await readyProductionFinishClaim(bucket, otherLease, {
    status: "retry_wait", stage: "retry",
    last_error: "Production media still rendering", retry_delay_ms: 30 * 60 * 1000,
  }, 2_000);
  const untouched = await readyProductionEnqueue(bucket, { ideaId: otherId, profileId });
  assert.notEqual(untouched.revived, true);
  assert.equal(untouched.job.next_attempt_ms, 1_802_000);
});
