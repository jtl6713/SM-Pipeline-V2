import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maeResolveSeedSchedule, maeIsBlackoutLocalTime } from "./mae-schedule.mjs";

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

test("Production Request valid explicit time stays exact, while blackout seed uses MAE", () => {
  const seed = sliceBetween(worker02, "async function studioAtomicApplyPlatformOutputSeedSchedule", "/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/");
  assert.match(seed, /maeResolveSeedSchedule\(\{/);
  assert.match(seed, /requestedIso: desiredSchedule/);
  assert.match(seed, /resolved\.reason === "invalid" \? 400 : 409/);
  assert.match(seed, /Platform Output seed did not produce a safe, unoccupied schedule/);
  const now = new Date("2026-11-08T20:00:00Z");
  const requested = "2026-11-09T17:30:00.000Z";
  const exact = maeResolveSeedSchedule({ requestedIso: requested, timeZone: "America/Chicago", now });
  assert.equal(exact.ok, true);
  assert.equal(exact.iso, requested);
  const blocked = maeResolveSeedSchedule({ requestedIso: "2026-11-09T03:00:00.000Z",
    timeZone: "America/Chicago", now });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.adjusted, true);
  assert.ok(Date.parse(blocked.iso) > Date.parse("2026-11-09T03:00:00.000Z"));
  assert.equal(maeIsBlackoutLocalTime(Date.parse(blocked.iso), "America/Chicago"), false);
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

test("cron independently recovers stale Submitted approvals even when request parent backlink is missing", () => {
  const healer = sliceBetween(worker03, "export async function studioHealPromotedMissingFanout", "/*__STUDIO_WORKER_END:studioHealPromotedMissingFanout__*/");
  assert.match(healer, /\{Request_Status\}="Submitted"/);
  assert.doesNotMatch(healer, /\{Request_Status\}="Submitted",\{Promoted_Content_Item\}!=BLANK\(\)/);
  assert.match(healer, /submittedApprovalAge\(/);
  assert.match(healer, /verifySubmittedPromotionOwnership\(/);
  assert.match(healer, /Promoted_Content_Item: \[latestProof\.parentId\]/);
  assert.match(healer, /Promoted_Content_Item repair failed readback/);
  assert.match(healer, /finalizeProductionRequestPromotion\(env, latest\.id, idea, ctx\)/);
  assert.match(healer, /attemptedSubmitted = true/);
  assert.doesNotMatch(healer, /fetchPromotionHandoff/);
  assert.match(worker, /ctx\.waitUntil\(studioHealPromotedMissingFanout\(env, \{ limit: cadence\.heavy \? 8 : 4, ctx \}\)/);
});

test("Atomic seed respects separate Story lane and rejects collisions after MAE selection", () => {
  const seed = sliceBetween(worker02, "export async function studioAtomicApplyPlatformOutputSeedSchedule", "/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/");
  assert.match(seed, /const seedOccupiedMs = outputType === "Story" \? laneMs : platformMs/);
  assert.match(seed, /platformOccupiedMs: seedOccupiedMs/);
  assert.match(seed, /maeScheduleConflicts\(candidateMs, seedOccupiedMs\)/);
  assert.match(seed, /maeIsBlackoutLocalTime\(candidateMs, timeZone\) \|\| maeScheduleConflicts/);
  assert.match(seed, /if \(vacate\)/);
  const now = new Date("2026-11-08T20:00:00Z");
  const raw = "2026-11-09T03:00:00Z";
  const main = maeResolveSeedSchedule({ requestedIso: raw, timeZone: "America/Chicago", now });
  const story = maeResolveSeedSchedule({ requestedIso: raw, timeZone: "America/Chicago", now, platformOccupiedMs: [] });
  assert.equal(story.ok, true); // independent Story lane may share a companion time with the main.
  assert.equal(story.iso, main.iso);
  const competingStory = maeResolveSeedSchedule({ requestedIso: raw, timeZone: "America/Chicago", now,
    platformOccupiedMs: [Date.parse(story.iso)] });
  assert.equal(competingStory.ok, true);
  assert.notEqual(competingStory.iso, story.iso);
});
