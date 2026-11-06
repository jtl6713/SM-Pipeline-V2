import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import {
  buildApproveAllJob, summarizeApproveAllJob, approveAllJobCounts,
  resetFailedApproveAllItems, nextPendingApproveAllItems,
} from "./approve-all-batch.mjs";

const worker = readStudioWorkerSource();
const functions04 = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-functions-04.mjs"),
  "utf8",
);

test("Factory batch tracks all 20 items without a browser-owned job state", () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    id: `recBatch${i + 1000}`, output_id: i + 1000,
    platform: "Instagram", format: i % 2 ? "Story" : "Reel",
  }));
  const job = buildApproveAllJob({
    jobId: "aj_browser_close", requestId: "factory_browser_close_20",
    profileId: "recProfile123", records,
    stamp: "2026-10-16T12:00:00Z", note: "factory",
  });
  assert.equal(job.items.length, 20);
  assert.equal(job.request_id, "factory_browser_close_20");
  assert.equal(approveAllJobCounts(job).pending_count, 20);
  job.items[0].status = "approved";
  job.items[1].status = "failed";
  job.items[1].error = "upstream rejected";
  job.items[2].status = "skipped";
  const status = summarizeApproveAllJob(job);
  assert.equal(status.total, 20);
  assert.equal(status.pending_count, 17);
  assert.equal(status.failed_count, 1);
  assert.equal(status.approved_count + status.failed_count + status.skipped_count + status.pending_count, 20);
  assert.deepEqual(status.items.map(x => x.id), records.map(x => x.id));
  assert.equal(status.items[1].error, "upstream rejected");
  const retried = resetFailedApproveAllItems(job, "2026-10-16T12:01:00Z");
  assert.equal(retried.items[0].status, "approved");
  assert.equal(retried.items[1].status, "pending");
  assert.equal(retried.items[2].status, "skipped");
  assert.equal(nextPendingApproveAllItems(retried, 8).length, 8);
});

test("Factory status source restores last terminal job and rejects unnecessary retries", () => {
  assert.match(worker, /Factory must still show the latest completed batch/);
  assert.match(worker, /requestId.*entry\?\.request_id|entry\?\.request_id === requestId/s);
  assert.match(worker, /existing\.status === "queued" \|\| existing\.status === "running"/);
  assert.match(worker, /result\.approvedThisInvoke > 0/);
  assert.match(worker, /studioResumeApproveAllJobs\(env, ctx\)/);
  assert.match(worker, /approveOutputRecordForPublishing\(env, record/);
});

test("new Factory batch POST is default-off until explicit rollout flag", () => {
  assert.match(worker, /FACTORY_BATCH_APPROVALS_ENABLED/);
  assert.match(worker, /Factory batch approvals are not enabled/);
  const route = worker.indexOf("async function factoryBatchSubmitRoute(");
  const flag = worker.indexOf("FACTORY_BATCH_APPROVALS_ENABLED", route);
  const parse = worker.indexOf("request.json()", route);
  assert.ok(route >= 0 && flag > route && parse > flag,
    "Feature gate must reject writes before request processing");
  const status = worker.indexOf("async function factoryBatchStatusRoute(");
  assert.ok(status >= 0 && status < route,
    "Status endpoint must remain independently readable");
});

test("rollout flag also prevents cron and background drain while disabled", () => {
  const cron = worker.indexOf("async function factoryBatchCronResume(");
  const drain = worker.indexOf("async function factoryBatchProcess(");
  assert.ok(cron >= 0 && drain >= 0);
  assert.match(worker.slice(cron, cron + 350), /FACTORY_BATCH_APPROVALS_ENABLED/);
  assert.match(worker.slice(drain, drain + 550), /factoryBatchRolloutPolicy\(env, profileId\)/);
  assert.match(worker, /approvals_enabled: factoryBatchRolloutPolicy\(env, profile.id\).enabled/);
});

test("Phase 2A method gate admits Factory batch POST before scoped approval handler", () => {
  assert.match(worker, /const isFactoryBatchWrite = isFactoryBatchRoute && request\.method === "POST";/);
  const gateStart = worker.indexOf("const allowedMethod =");
  const gateEnd = worker.indexOf("if (!allowedMethod)", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart, "Phase 2A global gate exists");
  assert.match(worker.slice(gateStart, gateEnd), /isFactoryBatchWrite\s*\|\|/,
    "POST /api/factory/approval-batches must pass the method allowlist");
  assert.match(worker, /if \(isFactoryBatchRoute\) \{\s*requirePermission\(authorization, "outputs_review"\)/,
    "The route retains its authenticated outputs_review permission check");
  assert.match(worker, /if \(isFactoryBatchRoute\)[\s\S]*?assertWriteRequest\(request, env\);[\s\S]*?factoryBatchSubmitRoute\(request, env, authorization, ctx\)/,
    "The route retains write security and existing safe rollout enforcement");
});

test("Factory skips one redundant GET but still rereads authoritative output under lock", () => {
  const start = worker.indexOf("async function factoryApproveOutput(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:factoryApproveOutput__*/", start);
  const factory = worker.slice(start,end);
  assert.match(factory, /prefetchedFactoryRecord\?\.id === id/);
  assert.match(factory, /await airtableFetch\(env, env\.AIRTABLE_OUTPUT_TABLE_ID, id\)/);
  const canonicalStart = worker.indexOf("async function approveOutputRecordForPublishing(");
  const canonicalEnd = worker.indexOf("/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/",canonicalStart);
  const canonical = worker.slice(canonicalStart,canonicalEnd);
  assert.match(canonical, /return withOutputApprovalLock/);
  assert.match(canonical, /const current = await airtableFetch\(env, env\.AIRTABLE_OUTPUT_TABLE_ID, id\)/);
  assert.ok(canonical.indexOf("return withOutputApprovalLock") < canonical.indexOf("const current = await airtableFetch"),
    "authoritative re-read must remain inside the shared lease");
  assert.match(factory, /writeThroughQueue/);
  assert.match(factory, /ctx\.waitUntil\(syncing\)/);
  assert.match(factory, /else await syncing/);
  assert.match(factory, /scheduled_ms: studioScheduleMs/);
});

test("Factory batch drain reuses one occupancy map like Approve All", () => {
  const start = worker.indexOf("async function factoryBatchProcess(");
  const end = worker.indexOf("async function factoryBatchSubmitRoute(", start);
  assert.ok(start >= 0 && end > start, "factoryBatchProcess extract present");
  const drain = worker.slice(start, end);
  assert.match(drain, /studioOccupiedSchedulesOrEmpty/);
  assert.match(drain, /skipOccupancyRefresh: true/);
  assert.match(drain, /occupiedMs: studioOccupiedForLane\(occupiedByLane/);
  assert.match(drain, /studioInvalidateOccupiedScheduleCache\(\)/);
  assert.match(drain, /filter\(\(item\) => !\["approved", "already_satisfied", "failed"\]/);
  assert.match(drain, /result\?\.scheduled_ms/);
  assert.match(drain, /\(laneOccupancy\[lane\] \|\|= \[\]\)\.push\(Number\(result\.scheduled_ms\)\)/);
  assert.match(drain, /Factory batch continue/);
  assert.match(drain, /continueSlice/);
  assert.match(drain, /result\?\.claimed && processed > 0 && continueSlice < 8/);
  assert.match(drain, /factoryBatchCronSelectJobs/);
  assert.match(drain, /factoryBatchList\(env\.STUDIO_MEDIA, profileId/);
});

test("Factory cron never burns Airtable occupancy scans before claiming profile lease", () => {
  const start = functions04.indexOf("export async function factoryBatchProcess(");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:factoryBatchProcess__*/", start);
  const source = functions04.slice(start, end);
  const claim = source.indexOf("const result = await factoryBatchDrain(");
  const approval = source.indexOf("approve: async (id, currentJob, checkpoint");
  const occupancy = source.indexOf("const occupied = await studioOccupiedSchedulesOrEmpty(");
  assert.ok(claim >= 0 && approval > claim && occupancy > approval,
    "only the R2-lease winner can fetch expensive scheduling occupancy");
  const beforeClaim = source.slice(0, claim);
  assert.doesNotMatch(beforeClaim, /studioOccupiedSchedulesOrEmpty|await airtableFetch\(env, STUDIO_IDEA_PROFILE_TABLE_ID/);
  assert.match(source, /const occupancyByPlatform = new Map\(\)/);
  assert.match(source, /if \(!occupancyByPlatform\.has\(platform\)\)/);
  assert.match(source, /requireComplete: true/);
  assert.match(source, /filter\(\(item\) => !\["approved", "already_satisfied", "failed"\]/);
  assert.match(source, /skipOccupancyRefresh: true/);
});


test("one-minute Factory recovery discovers global children even when the rotating child scan fails", () => {
  const cronStart = functions04.indexOf("export async function factoryBatchCronResume(");
  const cronEnd = functions04.indexOf("/*__STUDIO_WORKER_END:factoryBatchCronResume__*/", cronStart);
  const cron = functions04.slice(cronStart, cronEnd);
  assert.ok(cronStart >= 0 && cronEnd > cronStart);
  assert.match(cron, /factoryApprovalGroupCronScan/);
  assert.match(cron, /parent\.children\.slice\(0, 5\)/);
  assert.match(cron, /factoryBatchRead\(env\.STUDIO_MEDIA, profileId, requestId\)/);
  assert.match(cron, /Factory parent recovery scan unavailable/);
  assert.match(cron, /Factory child recovery scan unavailable/);
  assert.match(cron, /new Map\(candidates\.map/);
  assert.match(cron, /factoryBatchCronSelectJobs\(distinct/);
  assert.match(cron, /factoryBatchProcess\(env, candidate\.profileId, candidate\.requestId, ctx\)/);
});

test("Factory strict occupancy is per profile and platform, once per platform in the claimed drain", () => {
  const start = functions04.indexOf("export async function factoryBatchProcess(");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:factoryBatchProcess__*/", start);
  const source = functions04.slice(start, end);
  assert.match(source, /const occupancyByPlatform = new Map\(\)/);
  assert.match(source, /if \(!occupancyByPlatform\.has\(platform\)\)/);
  assert.match(source, /const occupied = await studioOccupiedSchedulesOrEmpty\(env, \{[\s\S]*?profile, platform, requireComplete: true/);
  assert.match(source, /const occupiedByLane = occupancyByPlatform\.get\(platform\)/);
  assert.match(source, /occupiedMs: studioOccupiedForLane\(occupiedByLane, platform, outputType\)/);
  assert.match(source, /occupancyByPlatform\.set\(platform, occupied\)/);
  assert.match(source, /const laneOccupancy = occupancyByPlatform\.get\(lanePlatform\)/);
  assert.doesNotMatch(source, /profile, requireComplete: true/);
  // Existing canonical approval/DO locking remains responsible for the final
  // authoritative claim, and already-approved slots are never excluded.
  assert.match(source, /scheduleOperationId: `factory-batch:/);
  assert.match(source, /skipOccupancyRefresh: true/);
  assert.match(source, /filter\(\(item\) => !\["approved", "already_satisfied", "failed"\]/);
});

test("Global Factory group submit authorizes Airtable before claiming output IDs", () => {
  const start = functions04.indexOf("async function factoryBatchGroupSubmitRoute(");
  assert.ok(start >= 0);
  const end = functions04.indexOf("export async function factoryBatchCronResume(", start);
  const group = functions04.slice(start, end > start ? end : start + 12000);
  const preflightIdx = group.indexOf("factoryGroupRecordsFromAirtablePreflight(");
  const claimsIdx = group.indexOf("factoryOutputClaimReserve(");
  const enqueueIdx = group.indexOf("factoryApprovalGroupEnqueue(");
  assert.ok(preflightIdx >= 0 && claimsIdx > preflightIdx && enqueueIdx > claimsIdx,
    "authoritative preflight then CAS output claims then durable enqueue");
  assert.doesNotMatch(group.slice(0, claimsIdx), /factoryGroupRecordsFromClientHints\(ids, payload, policy\)/);
  assert.match(group, /factoryOutputClaimInspect/);
  assert.match(group, /factoryOutputClaimReclaimIfSafe/);
  assert.match(group, /duplicate_prevented: true/);
  assert.match(group, /accept_mode: "authoritative_preflight"/);
  assert.match(functions04, /async function factoryGroupRecordsFromAirtablePreflight/);
  assert.match(functions04, /SUBMIT_BUDGET_MS/);
  assert.match(functions04, /SUBMIT_BUDGET_MS = 25000/);
  assert.match(functions04, /studioFetchApproveAllRecordsByIds\(env, ids, \{\s*allowIndividualFallback: false/);
  assert.match(functions04, /factoryResolveGroupOwnershipIds\(env, byId, ids, \{\s*allowIndividualFallback: false/);
  assert.match(functions04, /Factory submit timed out verifying outputs before accept/);
});
