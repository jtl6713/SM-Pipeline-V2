/**
 * Canonical client-side transaction adapter for the atomic scheduling authority.
 *
 * This module deliberately does not contain MAE selection or Airtable logic.
 * Callers provide those callbacks so the existing MAE algorithm remains the
 * sole source of slot preference. When the feature flag is disabled, callers
 * execute their legacy path unchanged.
 */

import {
  ScheduleReservationError,
  acquireScheduleReservation,
  beginScheduleReservationVerification,
  commitScheduleReservation,
  failScheduleReservation,
  heartbeatScheduleReservation,
  releaseScheduleReservation,
  scheduleReservationLaneEnabled,
  scheduleReservationId,
  stageScheduleReservation,
} from "./schedule-reservation-authority.mjs";

export const SCHEDULE_RESERVATION_EXTERNAL_WRITE_TIMEOUT_MS = 30 * 1000;
export const SCHEDULE_RESERVATION_HEARTBEAT_INTERVAL_MS = 20 * 1000;

function clean(value, max = 256) {
  return String(value ?? "").trim().slice(0, max);
}

function operationId(value) {
  const explicit = clean(value, 180);
  if (explicit) return explicit;
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function phaseError(error, phase, token = null) {
  if (error && typeof error === "object") {
    error.schedule_reservation_phase = phase;
    if (token) {
      error.schedule_reservation_id = token.reservation_id;
      error.schedule_reservation_generation = token.fencing_generation;
    }
  }
  return error;
}

async function safeFail(env, token, error) {
  if (!token?.enabled) return null;
  try {
    return await failScheduleReservation(env, {
      ...token,
      error: error instanceof Error ? error.message : String(error || "scheduling transaction failed"),
    });
  } catch (failError) {
    console.warn("schedule reservation failure bookkeeping failed", token.platform_output_record_id, failError);
    return null;
  }
}

async function safeRelease(env, token) {
  if (!token?.enabled) return null;
  try {
    return await releaseScheduleReservation(env, token);
  } catch (error) {
    console.warn("schedule reservation release deferred to reconciliation/expiry", token.platform_output_record_id, error);
    return null;
  }
}

/**
 * Run one schedule-changing transaction.
 *
 * callbacks:
 * - legacy(): required when flag is disabled; production behavior remains exact.
 * - plan(ctx): inside the acquired lane, refresh authoritative occupancy and run MAE
 *   (or validate an explicit manual time). Return:
 *     { action, selectedIso, previousIso, value }
 * - write(plan, ctx): perform the authoritative Airtable write.
 * - verify(writeResult, plan, ctx): re-read/verify authoritative state and return
 *   the stored schedule ISO (empty string for a verified vacate).
 * - afterCommit(writeResult, plan, ctx): optional Supabase/cache/write-through work.
 */
export async function runAtomicScheduleTransaction(env, args = {}, callbacks = {}, options = {}) {
  if (!scheduleReservationLaneEnabled(env, args.content_profile_id || args.profile_id, args.platform)) {
    if (typeof callbacks.legacy !== "function") {
      throw new Error("Atomic schedule feature is disabled and no legacy callback was provided");
    }
    return callbacks.legacy();
  }

  for (const name of ["plan", "write", "verify"]) {
    if (typeof callbacks[name] !== "function") {
      throw new Error(`Atomic schedule transaction requires callbacks.${name}`);
    }
  }

  const profileId = clean(args.content_profile_id || args.profile_id, 128);
  const platform = clean(args.platform, 80);
  const outputId = clean(args.platform_output_record_id || args.output_id, 128);
  if (!profileId || !platform || !outputId) {
    throw new ScheduleReservationError(
      "Atomic scheduling requires content profile ID, platform, and Platform Output record ID",
      { status: 400, code: "schedule_transaction_identity_missing" },
    );
  }

  const opId = operationId(args.owner_operation_id || args.operation_id);
  const reservationId = clean(args.reservation_id, 220) || scheduleReservationId(outputId, opId);
  const lane = {
    content_profile_id: profileId,
    platform,
    platform_output_record_id: outputId,
    owner_operation_id: opId,
    reservation_id: reservationId,
    factory_batch_id: clean(args.factory_batch_id, 180) || null,
    output_type: clean(args.output_type || args.platform_output_type, 120) || null,
    content_item_id: clean(args.content_item_id, 128) || null,
  };

  let phase = "acquire";
  let token = null;
  let externalCommitPossible = false;
  let committed = false;
  let heartbeatTimer = null;
  let heartbeatInFlight = false;
  let heartbeatFailure = null;
  let activeWriteAbort = null;

  const heartbeatIntervalMs = Math.max(
    5_000,
    Math.min(45_000, Number(options.heartbeatIntervalMs) || SCHEDULE_RESERVATION_HEARTBEAT_INTERVAL_MS),
  );
  const externalWriteTimeoutMs = Math.max(
    5_000,
    Math.min(60_000, Number(options.externalWriteTimeoutMs) || SCHEDULE_RESERVATION_EXTERNAL_WRITE_TIMEOUT_MS),
  );
  const stopHeartbeat = () => {
    if (heartbeatTimer != null) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  const heartbeatTick = async () => {
    if (!token?.enabled || heartbeatInFlight || committed) return;
    heartbeatInFlight = true;
    try {
      await heartbeatScheduleReservation(env, token);
    } catch (error) {
      heartbeatFailure ||= error;
      try { activeWriteAbort?.abort(error); } catch {}
    } finally {
      heartbeatInFlight = false;
    }
  };

  try {
    const acquired = await acquireScheduleReservation(env, lane, {
      maxWaitMs: options.maxWaitMs,
      sleep: options.sleep,
      jitter: options.jitter,
    });

    if (acquired?.already_committed) {
      return {
        atomic_schedule: true,
        already_committed: true,
        reservation: acquired.reservation,
        fencing_generation: acquired.fencing_generation,
      };
    }

    token = {
      ...lane,
      enabled: true,
      fencing_generation: acquired.fencing_generation,
    };
    heartbeatTimer = setInterval(() => { void heartbeatTick(); }, heartbeatIntervalMs);
    if (typeof heartbeatTimer?.unref === "function") heartbeatTimer.unref();

    phase = "plan";
    const plan = await callbacks.plan({
      token,
      fencing_generation: token.fencing_generation,
      reservation_id: token.reservation_id,
      occupied_reservations: Array.isArray(acquired.occupied_reservations)
        ? acquired.occupied_reservations
        : [],
    });
    const action = clean(plan?.action || args.action || "reserve", 32).toLowerCase();
    const selectedIso = action === "vacate" ? "" : clean(plan?.selectedIso || plan?.selected_iso, 128);
    const previousIso = clean(plan?.previousIso || plan?.previous_iso || args.previous_iso, 128);

    phase = "reserve";
    await stageScheduleReservation(env, {
      ...token,
      action,
      selected_iso: selectedIso,
      previous_iso: previousIso,
    });

    // Refresh the lease immediately before declaring that an external write
    // may be in flight. This maximizes the legitimate write/verify window.
    phase = "heartbeat";
    await heartbeatScheduleReservation(env, token);

    phase = "begin_verify";
    await beginScheduleReservationVerification(env, token);
    externalCommitPossible = true;

    phase = "write";
    const controller = new AbortController();
    activeWriteAbort = controller;
    const writeTimeout = setTimeout(() => {
      controller.abort(new ScheduleReservationError(
        "Authoritative scheduling write exceeded the bounded external-write window",
        {
          status: 504,
          code: "schedule_external_write_timeout",
          details: { timeout_ms: externalWriteTimeoutMs },
        },
      ));
    }, externalWriteTimeoutMs);
    if (typeof writeTimeout?.unref === "function") writeTimeout.unref();
    let writeResult;
    try {
      writeResult = await callbacks.write(plan, {
        token,
        action,
        selected_iso: selectedIso,
        previous_iso: previousIso,
        signal: controller.signal,
        external_write_timeout_ms: externalWriteTimeoutMs,
      });
    } finally {
      clearTimeout(writeTimeout);
      activeWriteAbort = null;
    }
    if (heartbeatFailure) throw heartbeatFailure;
    // The write can legitimately consume part of the lease. Renew ownership
    // before the authoritative re-read so a healthy transaction is not fenced
    // between PATCH completion and verification.
    await heartbeatScheduleReservation(env, token);

    phase = "verify";
    const authoritativeIsoRaw = await callbacks.verify(writeResult, plan, {
      token,
      action,
      selected_iso: selectedIso,
      previous_iso: previousIso,
    });
    const authoritativeIso = clean(
      authoritativeIsoRaw && typeof authoritativeIsoRaw === "object"
        ? authoritativeIsoRaw.authoritative_iso
        : authoritativeIsoRaw,
      128,
    );

    phase = "commit";
    const commit = await commitScheduleReservation(env, {
      ...token,
      authoritative_iso: authoritativeIso,
    });
    committed = true;

    // Lock release happens only after the Durable Object has accepted a
    // verified authoritative commit.
    phase = "release";
    const release = await safeRelease(env, token);

    phase = "after_commit";
    if (typeof callbacks.afterCommit === "function") {
      await callbacks.afterCommit(writeResult, plan, {
        token,
        action,
        selected_iso: selectedIso,
        previous_iso: previousIso,
        commit,
        release,
      });
    }

    stopHeartbeat();
    return {
      value: writeResult,
      atomic_schedule: true,
      reservation_id: token.reservation_id,
      fencing_generation: token.fencing_generation,
      commit,
      released: Boolean(release?.released),
    };
  } catch (error) {
    stopHeartbeat();
    try { activeWriteAbort?.abort(error); } catch {}
    // Before begin-verify there is no external scheduling write in flight:
    // record a Retryable Failure and safely release. After begin-verify the
    // failure path deliberately quarantines the lane as Recovery Required.
    // Once the Durable Object has accepted a verified commit, later failures
    // are downstream side-effect failures (for example Supabase/cache sync).
    // They must never downgrade or quarantine an already committed reservation.
    const failed = token && !committed ? await safeFail(env, token, error) : null;
    if (
      token
      && !committed
      && !externalCommitPossible
      && failed?.recovery_required !== true
    ) {
      await safeRelease(env, token);
    }
    throw phaseError(error, phase, token);
  }
}
