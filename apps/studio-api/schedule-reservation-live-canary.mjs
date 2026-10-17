/**
 * Live, nonpublishing Durable Object canary.
 * Invoke ONLY from an authenticated, operator-controlled Worker entrypoint with
 * the existing production STUDIO_SCHEDULE_RESERVATIONS binding.
 * This module intentionally has no Airtable, publishing, or Studio imports.
 * The authority flag is overridden in an EPHEMERAL adapter env, never changed
 * in production Worker configuration.
 */
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";
import { acquireScheduleReservation, failScheduleReservation, releaseScheduleReservation, stageScheduleReservation, beginScheduleReservationVerification, reconcileScheduleReservation } from "./schedule-reservation-authority.mjs";

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
    let contenderOutcome = "resolved";
    try { const contender = await schedule("b"); contenderOutcome = contender?.already_committed ? "already_committed" : "acquired"; } catch (e) { contenderOutcome = String(e?.code || "unknown_error").slice(0,80); blocked = /busy|wait|lane/i.test(contenderOutcome); }
    assert(blocked, `Concurrent contender was not blocked: ${contenderOutcome}`);
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

  await releaseScheduleReservation(isolated, {
    content_profile_id: lane, platform: "synthetic",
    platform_output_record_id: PREFIX + "abandoned",
    owner_operation_id: PREFIX + nonce + "-abandoned",
    reservation_id: crash.reservation_id,
    fencing_generation: crash.fencing_generation,
  });
  await schedule("after-abandoned");
  results.push({ check: "prewrite_recovery_queue_progress", pass: true });

  const ambiguityLane = lane + "-ambiguity";
  const identity = {
    content_profile_id: ambiguityLane, platform: "synthetic",
    platform_output_record_id: PREFIX + "ambiguous",
    owner_operation_id: PREFIX + nonce + "-ambiguous",
    reservation_id: PREFIX + nonce + "-ambiguous",
  };
  const a = await acquireScheduleReservation(isolated, identity, { maxWaitMs: 0 });
  const token = { ...identity, fencing_generation: a.fencing_generation };
  const iso = "2035-02-01T12:00:00.000Z";
  await stageScheduleReservation(isolated, { ...token, action: "reserve", selected_iso: iso, previous_iso: "" });
  await beginScheduleReservationVerification(isolated, token);
  const pending = await failScheduleReservation(isolated, { ...token, error: "synthetic ambiguous response" });
  assert(pending.recovery_required === true, "Ambiguous write was not quarantined");
  let quarantined = false;
  try {
    await acquireScheduleReservation(isolated, {
      ...identity, owner_operation_id: PREFIX + nonce + "-contender",
      reservation_id: PREFIX + nonce + "-contender",
      platform_output_record_id: PREFIX + "contender",
    }, { maxWaitMs: 0 });
  } catch (e) { quarantined = /quarantined|recovery_required/i.test(String(e.code || e.message)); }
  assert(quarantined, "Ambiguous lane allowed a new writer");
  let ambiguityRetained = false;
  try {
    await reconcileScheduleReservation(isolated, {
      ...token, recovery_operation_id: PREFIX + nonce + "-recovery",
      observation: "ambiguous", authoritative_iso: "",
    });
  } catch (e) { ambiguityRetained = e.code === "recovery_still_ambiguous"; }
  assert(ambiguityRetained, "Ambiguous observation incorrectly cleared quarantine");
  const reconciled = await reconcileScheduleReservation(isolated, {
    ...token, recovery_operation_id: PREFIX + nonce + "-recovery",
    observation: "committed", authoritative_iso: iso,
  });
  assert(reconciled.reconciled === true && reconciled.committed === true,
    "Synthetic authoritative commit was not reconciled");
  results.push({ check: "ambiguous_quarantine_reconciliation", pass: true });

  const expiryLane = lane + "-expiry";
  const expiredIdentity = {
    content_profile_id: expiryLane, platform: "synthetic",
    platform_output_record_id: PREFIX + "expired",
    owner_operation_id: PREFIX + nonce + "-expired",
    reservation_id: PREFIX + nonce + "-expired",
    lease_ms: 30000,
  };
  const oldOwner = await acquireScheduleReservation(isolated, expiredIdentity, {maxWaitMs:0});
  await new Promise(resolve => setTimeout(resolve, 31500));
  const successorIdentity = {
    ...expiredIdentity,
    platform_output_record_id: PREFIX + "successor",
    owner_operation_id: PREFIX + nonce + "-successor",
    reservation_id: PREFIX + nonce + "-successor",
  };
  const successor = await acquireScheduleReservation(isolated, successorIdentity, {maxWaitMs:0});
  assert(successor.fencing_generation > oldOwner.fencing_generation, "Expired lock did not advance fencing generation");
  let fenced = false;
  try {
    await releaseScheduleReservation(isolated, {...expiredIdentity, fencing_generation:oldOwner.fencing_generation});
  } catch (e) { fenced = /stale|fenc|owner|token/i.test(String(e.code || e.message)); }
  assert(fenced, "Expired owner released successor lock");
  const successorFailure = await failScheduleReservation(isolated, {...successorIdentity, fencing_generation:successor.fencing_generation, error:"synthetic cleanup"});
  assert(successorFailure.recovery_required === false, "Successor cleanup unexpectedly quarantined");
  await releaseScheduleReservation(isolated, {...successorIdentity, fencing_generation:successor.fencing_generation});
  results.push({check:"live_lease_expiry_and_stale_owner_fencing",pass:true});
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
