import test from "node:test";
import assert from "node:assert/strict";
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
