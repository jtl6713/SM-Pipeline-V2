import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAE_SCHEDULE_HORIZON_MAX, MAE_SUGGEST_HORIZON_DAYS } from "./mae-schedule.mjs";

const home = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(home, "worker.js"), "utf8");
const f01 = fs.readFileSync(path.join(home, "worker-functions-01.mjs"), "utf8");
const f02 = fs.readFileSync(path.join(home, "worker-functions-02.mjs"), "utf8");
const f04 = fs.readFileSync(path.join(home, "worker-functions-04.mjs"), "utf8");
const between = (text, start, end) => {
  const i = text.indexOf(start), j = text.indexOf(end, i);
  assert.ok(i >= 0 && j > i, "missing source section: " + start);
  return text.slice(i, j);
};

test("MAE occupancy scans up to the configured maximum, not the 30-day suggestion default", () => {
  assert.equal(MAE_SUGGEST_HORIZON_DAYS, 30);
  assert.equal(MAE_SCHEDULE_HORIZON_MAX, 90);
  assert.match(worker, /MAE_SCHEDULE_HORIZON_MAX/);
  assert.match(worker, /STUDIO_OCCUPIED_HORIZON_MS = \(MAE_SCHEDULE_HORIZON_MAX \+ 2\) \* 24/);
  assert.match(f01, /studioOccupiedFilterFormula\(now, profile, platform\)/);
  assert.match(f01, /STUDIO_OCCUPIED_HORIZON_MS/);
});

test("authoritative occupancy paginates all pages and fails closed on read errors or incomplete cursors", () => {
  const scan = between(f01, "export async function studioLoadOccupiedScheduleRows", "/*__STUDIO_WORKER_END:studioLoadOccupiedScheduleRows__*/");
  assert.match(scan, /if \(requireComplete\)/);
  assert.match(scan, /if \(!profile\?\.id\) throw new HttpError\(503/);
  assert.match(scan, /await listRecordsPage\(/);
  assert.match(scan, /rows\.push\(\.\.\.page\.records\)/);
  assert.match(scan, /offset = page\.offset \|\| null/);
  assert.match(scan, /Repeated MAE occupancy cursor/);
  assert.match(scan, /Cannot verify complete MAE occupancy; approval or reschedule was not committed/);
  assert.doesNotMatch(scan, /rows\.length >= STUDIO_OCCUPIED_LIST_LIMIT/);
  assert.match(scan, /rows\.length > 6000/);
  assert.match(scan, /Invalid or empty MAE occupancy page with continuation/);
  assert.match(scan, /studioWriteSource\(env\) === "supabase"/);
  assert.ok(scan.indexOf("listSupabaseOccupiedScheduleRows") < scan.indexOf("await listRecordsPage"),
    "Supabase occupancy must be decided before the Airtable page walk");
  assert.doesNotMatch(scan, /mergeMaeOccupancyRows/);
  const reads = between(f02, "export async function studioOccupiedSchedulesOrEmpty", "/*__STUDIO_WORKER_END:studioOccupiedSchedulesOrEmpty__*/");
  assert.match(reads, /if \(options\.requireComplete === true\) \{/);
  assert.match(reads, /return studioLoadOccupiedSchedules\(env, options\)/);
});

test("Factory, Approve All, atomic approval, regeneration and Calendar save require a verified calendar", () => {
  const factory = between(f04, "export async function factoryBatchProcess", "/*__STUDIO_WORKER_END:factoryBatchProcess__*/");
  assert.match(factory, /const occupied = await studioOccupiedSchedulesOrEmpty\(env, \{[\s\S]*?profile, platform, requireComplete: true/);
  assert.ok(factory.indexOf("factoryBatchDrain(") < factory.indexOf("const occupied = await studioOccupiedSchedulesOrEmpty"),
    "complete per-platform occupancy must be fetched after the exclusive Factory profile claim");
  const approveAll = between(f04, "export async function studioProcessApproveAllJobSlice", "/*__STUDIO_WORKER_END:studioProcessApproveAllJobSlice__*/");
  assert.match(approveAll, /const occupiedByLane = await studioOccupiedSchedulesOrEmpty\(env, \{[\s\S]*?requireComplete: true/);
  const approve = between(f04, "export async function approveOutputRecordForPublishing", "/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/");
  assert.match(approve, /requireComplete: true/);
  const seed = between(f02, "async function studioAtomicApplyPlatformOutputSeedSchedule", "/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/");
  assert.match(seed, /requireComplete: true/);
  const regeneration = between(f04, "export async function studioAtomicApplyScheduleRegenEntry", "/*__STUDIO_WORKER_END:studioAtomicApplyScheduleRegenEntry__*/");
  assert.match(regeneration, /requireComplete: true/);
  const calendar = between(f04, "export async function scheduleStudioPublishOutput", "/*__STUDIO_WORKER_END:scheduleStudioPublishOutput__*/");
  assert.match(calendar, /requireComplete: true/);
});

test("strict occupancy reads do not rely on the best-effort UI cache", () => {
  const scan = between(f01, "export async function studioLoadOccupiedScheduleRows", "/*__STUDIO_WORKER_END:studioLoadOccupiedScheduleRows__*/");
  assert.ok(scan.indexOf("if (requireComplete)") < scan.indexOf("const cache = studioOccupiedCacheSlot"));
});


test("atomic Factory strict occupancy is platform-scoped without weakening its complete-read check", () => {
  const formula = between(f01, "export function studioOccupiedFilterFormula", "/*__STUDIO_WORKER_END:studioOccupiedFilterFormula__*/");
  assert.match(formula, /platformClause/);
  assert.match(formula, /Platform/);
  const loader = between(f01, "export async function studioLoadOccupiedScheduleRows", "/*__STUDIO_WORKER_END:studioLoadOccupiedScheduleRows__*/");
  assert.match(loader, /studioOccupiedFilterFormula\(now, profile, platform\)/);
  assert.match(loader, /requireComplete/);
  const approve = between(f04, "async function studioApproveOutputRecordAtomic", "/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/");
  assert.match(approve, /excludeIds: \[id\],[\s\S]*?profile, platform, requireComplete: true/);
  assert.match(approve, /durableReservations/);
  assert.match(approve, /runAtomicScheduleTransaction/);
});
