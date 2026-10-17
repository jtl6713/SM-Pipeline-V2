import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker02 = fs.readFileSync(path.join(here, "worker-functions-02.mjs"), "utf8");
const worker04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");

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
