import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALITY_CHECKS } from "./quality-checks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const functions04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
const deploy = fs.readFileSync(path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");

test("all five scheduling Quality Agent signatures are registered", () => {
  const bySignature = new Map(QUALITY_CHECKS.map((row) => [row.signature, row]));
  for (const signature of [
    "QA-SCHEDULE-LOCK-HUNG",
    "QA-SCHEDULE-LOCK-CONTENTION",
    "QA-SCHEDULE-RESERVATION-DRIFT",
    "QA-SCHEDULE-COLLISION",
    "QA-SCHEDULE-QUEUE-STALLED",
  ]) {
    assert.ok(bySignature.has(signature), signature + " must be in the Quality Agent catalog");
  }
});

test("five-minute Worker cadence actually evaluates schedule reservation Quality Agent", () => {
  assert.match(worker, /await studioScheduleReservationQualitySweep\(env,[\s\S]{0,500}recover:\s*true/);
  assert.match(functions04, /export async function studioScheduleReservationQualitySweep/);
  assert.match(functions04, /writeScheduleReservationQualityLatest\(env\.STUDIO_MEDIA, report\)/);
});

test("desk inventory marks scheduling checks scanned and surfaces runtime findings", () => {
  for (const kind of [
    "schedule_lock_hung",
    "schedule_lock_contention",
    "schedule_reservation_drift",
    "schedule_collision",
    "schedule_queue_stalled",
  ]) assert.match(functions04, new RegExp("\\"" + kind + "\\""));
  assert.match(functions04, /studioScheduleReservationQualityLatest\(env\)/);
  assert.match(functions04, /for \(const finding of scheduleQuality\?\.findings \|\| \[\]\) push\(finding\)/);
});

test("production deployment provisions Durable Object but forces authority off", () => {
  assert.match(deploy, /STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED'\]='false'/);
  assert.match(deploy, /'name':'STUDIO_SCHEDULE_RESERVATIONS'/);
  assert.match(deploy, /'class_name':'ScheduleReservationLane'/);
  assert.match(deploy, /'storage':'sqlite'/);
});
