import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker02 = fs.readFileSync(path.join(here, "worker-functions-02.mjs"), "utf8");
const worker04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
const worker03 = fs.readFileSync(path.join(here, "worker-functions-03.mjs"), "utf8");
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, "missing " + startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.ok(end > start, "missing " + endNeedle);
  return source.slice(start, end);
}

test("approval reservation identity changes after send-back but remains stable for one retry cycle", () => {
  const atomic = sliceBetween(worker04, "async function studioApproveOutputRecordAtomic", "export async function approveOutputRecordForPublishing");
  assert.match(atomic, /const approvalArtifact = String\(/);
  assert.match(atomic, /const approvalDecisionCycle = String\(f\(record, "Review_Decision_At"\) \|\| "initial"\)/);
  assert.ok(atomic.includes("const approvalCycle ="));
  assert.ok(atomic.includes("approvalArtifact"));
  assert.ok(atomic.includes("approvalDecisionCycle"));
  assert.ok(atomic.includes("approve:${id}:${approvalCycle}"));
});

test("already-committed approval retry revalidates current approval state and ledger schedule", () => {
  const atomic = sliceBetween(worker04, "async function studioApproveOutputRecordAtomic", "export async function approveOutputRecordForPublishing");
  assert.match(atomic, /if \(result\?\.already_committed\)/);
  assert.match(atomic, /await airtableFetch\(env, env\.AIRTABLE_OUTPUT_TABLE_ID, prepared\.id \|\| id\)/);
  assert.match(atomic, /Committed scheduling reservation no longer matches the current approval cycle/);
  assert.match(atomic, /__already_approved: true/);
});

test("Production Request Scheduled_At is preserved as explicit intent rather than silently re-picked", () => {
  const seed = sliceBetween(worker02, "async function studioAtomicApplyPlatformOutputSeedSchedule", "/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/");
  assert.match(seed, /const requestedSchedule = String\(desiredSchedule \|\| ""\)\.trim\(\)/);
  assert.match(seed, /Production Request Output Scheduled_At is explicit scheduling intent/);
  assert.match(seed, /Requested Platform Output seed schedule is invalid/);
  assert.match(seed, /Requested Platform Output seed schedule is inside the profile-local blackout/);
  assert.match(seed, /Requested Platform Output seed schedule conflicts with another output on this profile\/platform/);
  assert.match(seed, /maeScheduleNextSlot\(/);
});

test("atomic seed schedule mutation is abortable and authoritatively verified", () => {
  const seed = sliceBetween(worker02, "async function studioAtomicApplyPlatformOutputSeedSchedule", "/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/");
  assert.match(seed, /write: async \(plan, \{ signal \}\) => airtableFetch/);
  assert.match(seed, /method: "PATCH",[\s\S]{0,100}signal,/);
  assert.match(seed, /const authoritative = await airtableFetch/);
  assert.match(seed, /Platform Output seed schedule could not be verified/);
});

test("production fanout gates atomic seed writes by exact profile/platform lane", () => {
  const fanout = sliceBetween(
    worker02,
    "export async function fanoutProductionRequestOutputsToContentItems",
    "/*__STUDIO_WORKER_END:fanoutProductionRequestOutputsToContentItems__*/",
  );
  assert.match(worker02, /import \{ scheduleReservationAuthorityEnabled, scheduleReservationLaneEnabled \} from/);
  assert.match(fanout, /const seedProfileId = studioFirstLinkedId\(f\(parent, "Content_Profile"\)\)/);
  assert.match(fanout, /if \(scheduleReservationLaneEnabled\(env, seedProfileId, effective\.platform\)/);
  assert.doesNotMatch(fanout, /if \(scheduleReservationAuthorityEnabled\(env\)/);
});

test("Submitted replay fans out only missing rows and preserves existing Remotion evidence", () => {
  const finalizer = sliceBetween(
    worker02,
    "export async function completeProductionRequestPromotionSideEffects",
    "/*__STUDIO_WORKER_END:completeProductionRequestPromotionSideEffects__*/",
  );
  assert.match(finalizer, /onlyMissing: !productionRequestRevisionOpen\(current\)/);
  assert.match(finalizer, /String\(existingJob\?\.step \|\| ""\) === "escalated"/);
  assert.match(finalizer, /Studio produce remains escalated pending guarded resume/);
});

test("cron reconciles stale Submitted approvals from confirmed I4 parent without I3 replay", () => {
  const healer = sliceBetween(worker03, "export async function studioHealPromotedMissingFanout", "/*__STUDIO_WORKER_END:studioHealPromotedMissingFanout__*/");
  assert.match(healer, /\{Request_Status\}="Submitted"/);
  assert.match(healer, /Date\.now\(\) - submittedMs < 10 \* 60 \* 1000/);
  assert.match(healer, /ideaParent !== parentId \|\| owners\.length !== 1 \|\| owners\[0\] !== pendingRequest\.id/);
  assert.match(healer, /finalizeProductionRequestPromotion\(env, pendingRequest\.id, idea, ctx\)/);
  assert.match(healer, /recoveredSubmitted >= 1/);
  assert.doesNotMatch(healer, /fetchPromotionHandoff/);
  assert.match(worker, /studioHealPromotedMissingFanout\(env, \{ limit: 4, ctx \}\)/);
});
