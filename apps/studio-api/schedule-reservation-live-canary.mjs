/**
 * Live, nonpublishing Durable Object canary.
 * Invoke ONLY from an authenticated, operator-controlled Worker entrypoint with
 * the existing production STUDIO_SCHEDULE_RESERVATIONS binding.
 * This module intentionally has no Airtable, publishing, or Studio imports.
 * The authority flag is overridden in an EPHEMERAL adapter env, never changed
 * in production Worker configuration.
 */
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";
import { acquireScheduleReservation, failScheduleReservation } from "./schedule-reservation-authority.mjs";

const PREFIX = "__synthetic_schedule_canary__";
function assert(ok, message) { if (!ok) throw new Error(message); }
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
export async function runLiveScheduleReservationCanary(env, { nonce } = {}) {
  assert(env?.STUDIO_SCHEDULE_RESERVATIONS?.get, "Live Durable Object namespace required");
  assert(!/^(true|1|yes|on|enabled)$/i.test(String(env.STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED || "")),
    "Production scheduling authority must remain disabled");
  assert(/^[a-zA-Z0-9-]{8,64}$/.test(String(nonce || "")), "Unique operator nonce required");
  // Only the direct DO client sees this local override. No Worker env mutation.
  const isolated = {
    STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true",
    STUDIO_SCHEDULE_RESERVATIONS: env.STUDIO_SCHEDULE_RESERVATIONS,
  };
  const lane = PREFIX + nonce;
  const shadow = new Map();
  const results = [];
  const held = deferred();
  const entered = deferred();
  const schedule = (id, hooks = {}) => runAtomicScheduleTransaction(isolated, {
    content_profile_id: lane,
    platform: "synthetic",
    output_type: "Synthetic",
    platform_output_record_id: PREFIX + id,
    owner_operation_id: PREFIX + nonce + "-" + id,
  }, {
    plan: async ({ occupied_reservations }) => ({
      action: "reserve",
      selectedIso: new Date(Date.UTC(2035, 0, 1, 0, occupied_reservations.length * 10)).toISOString(),
      previousIso: "",
    }),
    write: async (plan) => {
      hooks.entered?.resolve();
      if (hooks.held) await hooks.held.promise;
      shadow.set(id, plan.selectedIso);
      return { synthetic: true };
    },
    verify: async () => shadow.get(id) || "",
  }, { maxWaitMs: 0, jitter: false });
  const first = schedule("a", { entered, held });
  try {
    await entered.promise;
    let blocked = false;
    try { await schedule("b"); } catch (e) { blocked = /busy|waiting|lane/i.test(String(e.code || e.message)); }
    assert(blocked, "Concurrent contender was not blocked");
    results.push({ check: "same_lane_contention", pass: true });
  } finally { held.resolve(); }
  await first;
  await schedule("b");
  assert(shadow.get("a") !== shadow.get("b"), "Duplicate committed slots");
  results.push({ check: "unique_committed_occupancy", pass: true });
  const crash = await acquireScheduleReservation(isolated, {
    content_profile_id: lane, platform: "synthetic",
    platform_output_record_id: PREFIX + "abandoned",
    owner_operation_id: PREFIX + nonce + "-abandoned",
    reservation_id: PREFIX + nonce + "-abandoned",
  }, { maxWaitMs: 0 });
  assert(crash.ok, "Synthetic crash acquisition failed");
  const failed = await failScheduleReservation(isolated, {
    content_profile_id: lane, platform: "synthetic",
    platform_output_record_id: PREFIX + "abandoned",
    owner_operation_id: PREFIX + nonce + "-abandoned",
    reservation_id: crash.reservation_id,
    fencing_generation: crash.fencing_generation,
    error: "synthetic prewrite failure",
  });
  assert(failed.recovery_required === false, "Prewrite failure unexpectedly quarantined");
  results.push({ check: "prewrite_failure", pass: true });
  return {
    schema: "studio.synthetic-live-reservation-canary.1",
    live_namespace: true,
    production_flag_unchanged: true,
    external_write: "in_memory_stub_only",
    airtable_writes: 0,
    publishing_calls: 0,
    results,
    // No real profile IDs, output IDs, tokens, or schedule records are emitted.
  };
}
