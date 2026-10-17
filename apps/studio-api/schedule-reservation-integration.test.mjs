import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker01 = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");
const worker02 = fs.readFileSync(path.join(here, "worker-functions-02.mjs"), "utf8");
const worker04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
const authority = fs.readFileSync(path.join(here, "schedule-reservation-authority.mjs"), "utf8");
const transaction = fs.readFileSync(path.join(here, "schedule-reservation-transaction.mjs"), "utf8");

function block(startNeedle, endNeedle) {
  const start = worker04.indexOf(startNeedle);
  assert.ok(start >= 0, `missing start marker: ${startNeedle}`);
  const end = worker04.indexOf(endNeedle, start);
  assert.ok(end > start, `missing end marker: ${endNeedle}`);
  return worker04.slice(start, end);
}

test("canonical approval has one atomic feature branch and preserves the legacy branch when disabled", () => {
  const canonical = block(
    "export async function approveOutputRecordForPublishing",
    "/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/",
  );
  assert.equal(
    (canonical.match(/scheduleReservationAuthorityEnabled\(env\)/g) || []).length,
    1,
    "canonical approval must have exactly one reservation-authority branch",
  );
  assert.match(canonical, /scheduleReservationLaneEnabled\(env, reservationProfile\?\.id, f\(record, "Platform"\)\)/);
  assert.match(canonical, /return studioApproveOutputRecordAtomic\(env, record, note, stamp, payload, \{/);
  assert.match(canonical, /let occupiedMs = Array\.isArray\(options\.occupiedMs\)/);
  assert.match(canonical, /skipOccupancyRefresh/);
});

test("atomic approval refreshes authoritative occupancy inside the lane and enforces platform-wide blocking", () => {
  const atomic = block(
    "async function studioApproveOutputRecordAtomic",
    "export async function approveOutputRecordForPublishing",
  );
  assert.match(atomic, /studioInvalidateOccupiedScheduleCache\(\)/);
  assert.match(atomic, /studioOccupiedSchedulesOrEmpty\(env, \{[\s\S]*excludeIds: \[id\],[\s\S]*profile/);
  assert.match(atomic, /studioOccupiedForLane\(occupied, platform, outputType\)/);
  assert.match(atomic, /studioOccupiedForPlatform\(occupied, platform\)/);
  assert.match(atomic, /durable\?\.output_type/);
  assert.match(atomic, /maeScheduleNextSlot\(\{[\s\S]*laneOccupiedMs: lane,[\s\S]*platformOccupiedMs: platformLane/);
  assert.match(atomic, /maeScheduleConflicts\(requestedMs, platformLane\)/);
});

test("atomic approval persists, re-reads Airtable, verifies exact schedule, then commits through the adapter", () => {
  const atomic = block(
    "async function studioApproveOutputRecordAtomic",
    "export async function approveOutputRecordForPublishing",
  );
  assert.match(atomic, /runAtomicScheduleTransaction\(env/);
  assert.match(atomic, /write: async \\(plan, \\{ signal \\}\\) => \\{/);
  assert.match(atomic, /checkpoint\\("schedule_write_started"\\)[\\s\\S]*await airtableFetch/);
  assert.match(atomic, /checkpoint\\("schedule_write_finished"\\)/);
  assert.match(atomic, /method: "PATCH",[\s\S]{0,100}signal,/);
  assert.match(atomic, /verify: async \(_updated, plan\) => \{[\s\S]*await airtableFetch/);
  assert.match(atomic, /Airtable stored schedule does not match the reserved MAE slot/);
  assert.match(transaction, /phase = "begin_verify"/);
  assert.match(transaction, /phase = "write"/);
  assert.match(transaction, /SCHEDULE_RESERVATION_EXTERNAL_WRITE_TIMEOUT_MS/);
  assert.match(transaction, /signal: controller\.signal/);
  assert.match(transaction, /heartbeatScheduleReservation\(env, token\)/);
  assert.match(transaction, /phase = "verify"/);
  assert.match(transaction, /phase = "commit"/);
  assert.match(transaction, /phase = "release"/);
  assert.ok(
    transaction.indexOf('phase = "commit"') < transaction.indexOf('phase = "release"'),
    "commit must precede release",
  );
});

test("Factory batch and Approve All use job-scoped reservation operation IDs", () => {
  assert.match(worker04, /scheduleOperationId: `approve-all:\$\{job\.id\}:\$\{record\.id\}`/);
  assert.match(worker04, /scheduleOperationId: `factory-batch:\$\{requestId\}:\$\{id\}`/);
  assert.match(worker04, /factoryBatchId: requestId/);
});

test("manual schedule route joins the same authority and carries output type", () => {
  const manual = block(
    "export async function scheduleStudioPublishOutput",
    "/*__STUDIO_WORKER_END:scheduleStudioPublishOutput__*/",
  );
  assert.match(manual, /scheduleReservationAuthorityEnabled\(env\)/);
  assert.match(manual, /runAtomicScheduleTransaction\(env/);
  assert.match(manual, /output_type: outputType/);
  assert.match(manual, /studioInvalidateOccupiedScheduleCache\(\)/);
  assert.match(manual, /studioOccupiedForPlatform\(fresh, platform\)/);
  assert.match(manual, /Requested manual schedule conflicts with another output/);
  assert.match(manual, /verify: async \(written, plan\) => \{[\s\S]*await airtableFetch/);
});

test("authority lane excludes output type from lock key while retaining output type in reservation ledger", () => {
  assert.match(authority, /return `\$\{profile\}::\$\{p\}`/);
  assert.doesNotMatch(authority, /scheduleReservationLaneKey\([^)]*output_type/);
  assert.match(authority, /output_type: op\.output_type/);
  assert.match(authority, /output_type: row\.output_type \|\| null/);
});

test("expired Verifying ownership is quarantined rather than silently cleared", () => {
  assert.match(authority, /EXTERNAL_WRITE_POSSIBLE_STATES\.has\(lock\.state\)/);
  assert.match(authority, /state: SCHEDULE_RESERVATION_STATES\.RECOVERY_REQUIRED/);
  assert.match(authority, /Expired scheduling owner may have written Airtable; reconciliation is required/);
});


test("schedule regeneration, cron heals, Factory vacate, and production seed all join the authority", () => {
  assert.match(worker04, /async function studioAtomicApplyScheduleRegenEntry[\s\S]*runAtomicScheduleTransaction\(env/);
  assert.match(worker04, /async function studioHealApprovedMissingScheduleAtomic[\s\S]*runAtomicScheduleTransaction\(env/);
  assert.match(worker04, /async function studioHealStoryCompanionDriftAtomic[\s\S]*runAtomicScheduleTransaction\(env/);
  assert.match(worker04, /async function studioAtomicVacateSkippedOutput[\s\S]*runAtomicScheduleTransaction\(env/);
  assert.match(worker02, /async function studioAtomicApplyPlatformOutputSeedSchedule[\s\S]*runAtomicScheduleTransaction\(env/);
});

test("all atomic Airtable schedule mutations consume the bounded write AbortSignal", () => {
  const combined = worker02 + "\n" + worker04;
  const mutatingCallbacks = [...combined.matchAll(/write: async \(plan, \{ signal \}\) =>[\s\S]{0,450}?method: "PATCH",[\s\S]{0,100}?signal,/g)];
  assert.ok(mutatingCallbacks.length >= 7, "every atomic schedule mutation must pass the transaction AbortSignal to airtableFetch");
});

test("Quality Agent reservation recovery never dispatches or republishes content", () => {
  const qualityStart = worker04.indexOf("async function studioReconcileReservationDriftAtomic");
  const qualityEnd = worker04.indexOf("export async function studioHealApprovedMissingSchedule", qualityStart);
  assert.ok(qualityStart >= 0 && qualityEnd > qualityStart);
  const qualityRuntime = worker04.slice(qualityStart, qualityEnd);
  assert.doesNotMatch(qualityRuntime, /studioDispatchApprovedPublishNow|studioDispatchApprovedPublishAndSchedule|publish-kick/i);
});

test("published scheduled rows remain occupancy inputs instead of being freed after workflow completion", () => {
  const start = worker01.indexOf("export function studioOccupiedFilterFormula");
  const end = worker01.indexOf("export function studioOccupiedCacheSlot", start);
  assert.ok(start >= 0 && end > start);
  const occupancy = worker01.slice(start, end);
  assert.match(occupancy, /Published rows stay in the window/);
  assert.doesNotMatch(occupancy, /Publish_Status.*!=.*Published|Output_Status.*!=.*Published/);
});
