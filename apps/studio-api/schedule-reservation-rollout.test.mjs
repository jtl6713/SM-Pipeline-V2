import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scheduleReservationLaneEnabled } from "./schedule-reservation-authority.mjs";
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";

const profile = "recSyntheticScope123";
const platform = "facebook";
const lane = profile + "::" + platform;
const callbacks = { legacy: async () => "legacy", plan: async () => { throw Error("unexpected atomic path"); }, write: async () => {}, verify: async () => "" };

test("global kill switch overrides allowlist", async () => {
  const env = { STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "false", STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST: lane };
  assert.equal(scheduleReservationLaneEnabled(env, profile, platform), false);
  assert.equal(await runAtomicScheduleTransaction(env, {content_profile_id:profile,platform}, callbacks), "legacy");
});
test("no allowlist means all transactions remain legacy even with global flag enabled", async () => {
  const env = { STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true" };
  assert.equal(scheduleReservationLaneEnabled(env, profile, platform), false);
  assert.equal(await runAtomicScheduleTransaction(env, {content_profile_id:profile,platform}, callbacks), "legacy");
});
test("only exact profile and platform lane is eligible", async () => {
  const env = { STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true", STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST: lane };
  assert.equal(scheduleReservationLaneEnabled(env, profile, platform), true);
  assert.equal(scheduleReservationLaneEnabled(env, profile, "instagram"), false);
  assert.equal(scheduleReservationLaneEnabled(env, "anotherProfile", platform), false);
  assert.equal(scheduleReservationLaneEnabled({...env,STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST:"*"},profile,platform), false);
  assert.equal(await runAtomicScheduleTransaction(env, {content_profile_id:profile,platform:"instagram"}, callbacks), "legacy");
});

const runtimeSource = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const sourceOf = (name) => runtimeSource.split(`export async function ${name}(`)[1]?.split(`/*__STUDIO_WORKER_END:${name}__*/`)[0] || "";

test("scope predicate fails closed for missing profile and platform", async () => {
  const env = { STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true", STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST: lane };
  assert.equal(scheduleReservationLaneEnabled(env, null, platform), false);
  assert.equal(scheduleReservationLaneEnabled(env, profile, null), false);
  assert.equal(await runAtomicScheduleTransaction(env, {content_profile_id: "anotherProfile",platform}, callbacks), "legacy");
});

test("canonical approvals explicitly route every non-allowlisted lane to legacy", () => {
  const source = sourceOf("approveOutputRecordForPublishing");
  assert.match(source, /scheduleReservationLaneEnabled\(env, reservationProfile\?\.id, f\(record, "Platform"\)\)/);
  assert.match(source, /return studioApproveOutputRecordAtomic/);
  assert.match(workerSource, /scheduleReservationLaneEnabled,/);
  assert.doesNotMatch(source, /if \(scheduleReservationAuthorityEnabled\(env\)\) \{\s*return studioApproveOutputRecordAtomic/);
});

test("non-allowlisted scheduling writers remain on their legacy paths", () => {
  for (const name of ["studioHealApprovedMissingSchedule", "studioHealStoryCompanionDrift"]) {
    const source = sourceOf(name);
    assert.match(source, /scheduleReservationLaneEnabled\(env, profile\?\.id, f\(row, "Platform"\)\)/, name);
    assert.match(source, /rows = legacyRows/, name);
  }
  assert.match(sourceOf("studioProcessScheduleRegenJobSlice"), /scheduleReservationLaneEnabled\(env, job\.profile_id \|\| combo\.profile_id, combo\.platform\)/);
  assert.match(sourceOf("factoryDeleteDeskItem"), /if \(scheduleReservationLaneEnabled\(env, profile\?\.id, f\(source, "Platform"\)\)\)/);
  assert.match(runtimeSource, /if \(scheduleReservationLaneEnabled\(env, reservationProfile\?\.id, platform\)\)/);
});
