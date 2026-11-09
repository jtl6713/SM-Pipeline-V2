import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maeResolveSeedSchedule, maeIsBlackoutLocalTime, maeScheduleConflicts } from "./mae-schedule.mjs";
const worker = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const app = readFileSync(new URL("../studio-web/assets/app-item4-1008.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../studio-web/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../studio-web/assets/production-approval-clarity.css", import.meta.url), "utf8");

test("Chicago blackout seed moves forward to non-blackout slot", () => {
 const requested = "2026-11-09T03:00:00.000Z"; // Nov 8, 9 PM CST
 const result = maeResolveSeedSchedule({ requestedIso: requested, timeZone: "America/Chicago",
   now: new Date("2026-11-08T20:00:00.000Z"), horizonDays: 30 });
 assert.equal(result.ok, true);
 assert.equal(result.adjusted, true);
 assert.equal(result.reason, "blackout");
 assert.ok(Date.parse(result.iso) > Date.parse(requested));
 assert.equal(maeIsBlackoutLocalTime(Date.parse(result.iso), "America/Chicago"), false);
});

test("blackout recovery keeps 90-minute platform occupancy gap", () => {
 const args = { requestedIso: "2026-11-09T03:00:00Z", timeZone: "America/Chicago",
   now: new Date("2026-11-08T20:00:00Z"), horizonDays: 30 };
 const first = maeResolveSeedSchedule(args);
 const second = maeResolveSeedSchedule({ ...args, platformOccupiedMs: [Date.parse(first.iso)] });
 assert.equal(second.ok, true);
 assert.equal(maeScheduleConflicts(Date.parse(second.iso), [Date.parse(first.iso)]), false);
});

test("valid exact time survives; conflicts and invalid requests remain blocked", () => {
 const requested = "2026-11-09T17:30:00.000Z";
 const args = { requestedIso: requested, timeZone: "America/Chicago",
   now: new Date("2026-11-08T20:00:00Z") };
 assert.equal(maeResolveSeedSchedule(args).iso, requested);
 assert.equal(maeResolveSeedSchedule(args).adjusted, false);
 const conflict = maeResolveSeedSchedule({ ...args, platformOccupiedMs: [Date.parse(requested)] });
 assert.equal(conflict.ok, false);
 assert.equal(conflict.reason, "conflict");
 const invalid = maeResolveSeedSchedule({ ...args, requestedIso: "invalid" });
 assert.equal(invalid.ok, false);
 assert.equal(invalid.iso, "");
});

test("Worker retains atomic verification, capacity guard, and no-publish recovery", () => {
 assert.match(worker, /maeResolveSeedSchedule\(\{/);
 assert.match(worker, /maeIsBlackoutLocalTime\(candidateMs, timeZone\) \|\| maeScheduleConflicts/);
 assert.match(worker, /Platform Output seed schedule could not be verified/);
 assert.match(worker, /Blackout requested time .*automatically moved to verified MAE reservation/);
 assert.match(worker, /scheduleReservationLaneEnabled\(env, profile\.id, platform\)/);
 assert.match(worker, /normal approval-stage scheduler allocates an allowed MAE slot/);
});

test("approval, scheduling, and Story have distinct compact UI summaries", () => {
 assert.match(html, /id="productionScheduleSummary"/);
 assert.match(html, /id="productionStorySummary"/);
 assert.match(app, /Story: Photo 1/);
 assert.match(app, /notes\.filter\(note => !\/\^\(Scheduling:/);
 assert.match(css, /production-studio-form \{ row-gap: 16px/);
 assert.match(css, /production-story-summary\[hidden\]/);
});
