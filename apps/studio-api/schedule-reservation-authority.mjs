/**
 * Atomic MAE scheduling reservation authority.
 *
 * One Durable Object instance represents exactly one Content Profile + Platform
 * wall-clock occupancy lane. Output types intentionally share the same lane.
 *
 * Important external-write invariant:
 * - Acquired/Reserving may be replaced after lease expiry because no Airtable
 *   schedule write has been declared in flight.
 * - Verifying means an Airtable schedule write may be in flight. An expired
 *   Verifying owner is quarantined as Recovery Required; the lane is NOT handed
 *   to another scheduler until reconciliation proves the authoritative result.
 *
 * The feature is disabled unless STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED
 * is explicitly true. When enabled, the Durable Object binding is mandatory.
 */

export const SCHEDULE_RESERVATION_SCHEMA = "studio.schedule-reservation-lane.1";
export const SCHEDULE_RESERVATION_FLAG = "STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED";
export const SCHEDULE_RESERVATION_BINDING = "STUDIO_SCHEDULE_RESERVATIONS";
export const SCHEDULE_RESERVATION_INDEX_PREFIX = "studio/state/schedule-reservation-lanes/v1";

export const SCHEDULE_RESERVATION_LEASE_MS = 90 * 1000;
export const SCHEDULE_RESERVATION_HEARTBEAT_WARN_MS = 60 * 1000;
export const SCHEDULE_RESERVATION_CONTENTION_WARN_MS = 30 * 1000;
export const SCHEDULE_RESERVATION_QUEUE_WARN_MS = 2 * 60 * 1000;
/**
 * A stale external request can be ambiguous even after the owner lease expires.
 * Automatic "not committed" recovery therefore requires a conservative settle
 * period plus two stable authoritative observations.
 */
export const SCHEDULE_RESERVATION_AMBIGUOUS_SETTLE_MS = 5 * 60 * 1000;
export const SCHEDULE_RESERVATION_RECOVERY_STABLE_MS = 30 * 1000;
export const SCHEDULE_RESERVATION_RECENT_LIMIT = 512;
export const SCHEDULE_RESERVATION_WAITER_LIMIT = 32;

export const SCHEDULE_RESERVATION_STATES = Object.freeze({
  WAITING: "Waiting",
  ACQUIRED: "Acquired",
  RESERVING: "Reserving",
  VERIFYING: "Verifying",
  COMMITTED: "Committed",
  RELEASED: "Released",
  RETRYABLE_FAILURE: "Retryable Failure",
  RECOVERY_REQUIRED: "Recovery Required",
  EXPIRED: "Expired",
  RECONCILED: "Reconciled",
});

const PREWRITE_STATES = new Set([
  SCHEDULE_RESERVATION_STATES.ACQUIRED,
  SCHEDULE_RESERVATION_STATES.RESERVING,
]);

const EXTERNAL_WRITE_POSSIBLE_STATES = new Set([
  SCHEDULE_RESERVATION_STATES.VERIFYING,
  SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
]);

function clean(value, max = 256) {
  return String(value ?? "").trim().slice(0, max);
}

function nowIso(ms) {
  return new Date(ms).toISOString();
}

function parseMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function normalizePlatform(value) {
  return clean(value, 80).toLowerCase();
}

function normalizeIso(value) {
  const raw = clean(value, 128);
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw authorityError(400, "invalid_schedule_iso", "Scheduled time is invalid");
  return new Date(ms).toISOString();
}

function authorityError(status, code, message, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function boundedLeaseMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return SCHEDULE_RESERVATION_LEASE_MS;
  return Math.max(30_000, Math.min(5 * 60_000, Math.floor(n)));
}

function lockExpired(lock, nowMs) {
  if (!lock) return true;
  return parseMs(lock.lease_expiration_timestamp) <= nowMs;
}

function laneDescriptor(payload = {}) {
  const profileId = clean(payload.content_profile_id || payload.profile_id, 128);
  const platform = normalizePlatform(payload.platform);
  if (!profileId) throw authorityError(400, "missing_profile_id", "Content Profile ID is required");
  if (!platform) throw authorityError(400, "missing_platform", "Platform is required");
  return {
    content_profile_id: profileId,
    platform,
    lock_key: scheduleReservationLaneKey(profileId, platform),
  };
}

function operationDescriptor(payload = {}) {
  const ownerOperationId = clean(payload.owner_operation_id || payload.operation_id, 180);
  const outputId = clean(payload.platform_output_record_id || payload.output_id, 128);
  const reservationId = clean(payload.reservation_id, 220);
  if (!ownerOperationId) throw authorityError(400, "missing_operation_id", "Owner operation ID is required");
  if (!outputId) throw authorityError(400, "missing_output_id", "Platform Output record ID is required");
  if (!reservationId) throw authorityError(400, "missing_reservation_id", "Reservation ID is required");
  return {
    owner_operation_id: ownerOperationId,
    platform_output_record_id: outputId,
    reservation_id: reservationId,
    factory_batch_id: clean(payload.factory_batch_id, 180) || null,
    output_type: clean(payload.output_type || payload.platform_output_type, 120) || null,
  };
}

function tokenDescriptor(payload = {}) {
  const ownerOperationId = clean(payload.owner_operation_id || payload.operation_id, 180);
  const reservationId = clean(payload.reservation_id, 220);
  const generation = Number(payload.fencing_generation);
  if (!ownerOperationId || !reservationId || !Number.isInteger(generation) || generation <= 0) {
    throw authorityError(400, "invalid_fencing_token", "Valid reservation ownership and fencing generation are required");
  }
  return {
    owner_operation_id: ownerOperationId,
    reservation_id: reservationId,
    fencing_generation: generation,
  };
}

function emptyMeta() {
  return {
    schema: SCHEDULE_RESERVATION_SCHEMA,
    generation: 0,
    lane: null,
    lock: null,
    quarantine: null,
    waiters: {},
    recent_reservations: [],
    updated_at: null,
  };
}

function copyMeta(meta) {
  const source = meta && typeof meta === "object" ? meta : emptyMeta();
  return {
    ...emptyMeta(),
    ...source,
    waiters: { ...(source.waiters || {}) },
    recent_reservations: Array.isArray(source.recent_reservations)
      ? source.recent_reservations.map((row) => ({ ...row }))
      : [],
  };
}

function reservationKey(id) {
  return `reservation:${id}`;
}

function sameOwner(lock, token) {
  return Boolean(
    lock
    && lock.owner_operation_id === token.owner_operation_id
    && lock.reservation_id === token.reservation_id
    && Number(lock.fencing_generation) === Number(token.fencing_generation)
  );
}

function assertLane(meta, descriptor) {
  if (!meta.lane) {
    meta.lane = { ...descriptor };
    return;
  }
  if (
    meta.lane.content_profile_id !== descriptor.content_profile_id
    || meta.lane.platform !== descriptor.platform
  ) {
    throw authorityError(409, "lane_identity_mismatch", "Durable scheduling lane identity does not match the request");
  }
}

function pruneWaiters(waiters, nowMs) {
  const entries = Object.entries(waiters || {})
    .filter(([, row]) => row && nowMs - parseMs(row.last_waiting_timestamp) < 30 * 60 * 1000)
    .sort((a, b) => parseMs(b[1].last_waiting_timestamp) - parseMs(a[1].last_waiting_timestamp))
    .slice(0, SCHEDULE_RESERVATION_WAITER_LIMIT);
  return Object.fromEntries(entries);
}

function recordWaiter(meta, op, nowMs) {
  const prior = meta.waiters?.[op.owner_operation_id] || null;
  meta.waiters ||= {};
  meta.waiters[op.owner_operation_id] = {
    state: SCHEDULE_RESERVATION_STATES.WAITING,
    owner_operation_id: op.owner_operation_id,
    factory_batch_id: op.factory_batch_id,
    platform_output_record_id: op.platform_output_record_id,
    reservation_id: op.reservation_id,
    first_waiting_timestamp: prior?.first_waiting_timestamp || nowIso(nowMs),
    last_waiting_timestamp: nowIso(nowMs),
    attempt_count: Math.max(0, Number(prior?.attempt_count) || 0) + 1,
  };
  meta.waiters = pruneWaiters(meta.waiters, nowMs);
}

function committedOccupancy(meta, excludeOutputId = "") {
  const exclude = clean(excludeOutputId, 128);
  return (meta.recent_reservations || [])
    .filter((row) => row?.scheduled_iso && (!exclude || row.platform_output_record_id !== exclude))
    .map((row) => ({
      platform_output_record_id: row.platform_output_record_id,
      reservation_id: row.reservation_id,
      output_type: row.output_type || null,
      scheduled_iso: row.scheduled_iso,
      fencing_generation: row.fencing_generation,
      committed_timestamp: row.committed_timestamp,
    }));
}

function setRecentReservation(meta, reservation, nowMs) {
  const outputId = reservation.platform_output_record_id;
  const rows = (meta.recent_reservations || [])
    .filter((row) => row?.platform_output_record_id !== outputId);
  if (reservation.action !== "vacate" && reservation.scheduled_iso) {
    rows.push({
      platform_output_record_id: outputId,
      reservation_id: reservation.reservation_id,
      output_type: reservation.output_type || null,
      scheduled_iso: reservation.scheduled_iso,
      fencing_generation: reservation.fencing_generation,
      committed_timestamp: reservation.committed_timestamp || nowIso(nowMs),
    });
  }
  rows.sort((a, b) => parseMs(b.committed_timestamp) - parseMs(a.committed_timestamp));
  meta.recent_reservations = rows.slice(0, SCHEDULE_RESERVATION_RECENT_LIMIT);
}

function publicLock(lock, nowMs) {
  if (!lock) return null;
  return {
    ...lock,
    lock_age_ms: Math.max(0, nowMs - parseMs(lock.acquired_timestamp)),
    heartbeat_age_ms: Math.max(0, nowMs - parseMs(lock.last_heartbeat_timestamp)),
    lease_expired: lockExpired(lock, nowMs),
  };
}

function responseJson(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw authorityError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function scheduleReservationAuthorityEnabled(env = {}) {
  return /^(?:1|true|yes|on|enabled)$/i.test(clean(env?.[SCHEDULE_RESERVATION_FLAG], 32));
}

export function scheduleReservationLaneKey(contentProfileId, platform) {
  const profile = clean(contentProfileId, 128);
  const p = normalizePlatform(platform);
  if (!profile || !p) throw authorityError(400, "invalid_lane", "Content Profile ID and platform are required");
  return `${profile}::${p}`;
}

export function scheduleReservationId(outputId, operationId) {
  const output = clean(outputId, 128);
  const operation = clean(operationId, 180);
  if (!output || !operation) throw authorityError(400, "invalid_reservation_id", "Output ID and operation ID are required");
  return `${output}::${operation}`;
}

export class ScheduleReservationError extends Error {
  constructor(message, { status = 500, code = "schedule_reservation_error", details = {} } = {}) {
    super(message);
    this.name = "ScheduleReservationError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ScheduleReservationLane {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
    this._now = () => Date.now();
  }

  async _transaction(fn) {
    const storage = this.state.storage;
    if (typeof storage.transaction === "function") {
      return storage.transaction(async (txn) => fn(txn));
    }
    return fn(storage);
  }

  async _snapshot(meta) {
    const bucket = this.env?.STUDIO_MEDIA;
    if (!bucket?.put || !meta?.lane?.lock_key) return;
    const key = `${SCHEDULE_RESERVATION_INDEX_PREFIX}/${encodeURIComponent(meta.lane.lock_key)}.json`;
    const nowMs = this._now();
    const payload = {
      schema: SCHEDULE_RESERVATION_SCHEMA,
      lane: meta.lane,
      generation: meta.generation,
      lock: publicLock(meta.lock, nowMs),
      quarantine: meta.quarantine || null,
      waiter_count: Object.keys(meta.waiters || {}).length,
      recent_reservation_count: (meta.recent_reservations || []).length,
      updated_at: meta.updated_at || nowIso(nowMs),
    };
    await bucket.put(key, JSON.stringify(payload), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  async _readMeta(storage = this.state.storage) {
    return copyMeta(await storage.get("meta"));
  }

  async _writeMeta(storage, meta, nowMs) {
    meta.updated_at = nowIso(nowMs);
    await storage.put("meta", meta);
    return meta;
  }

  async _readReservation(storage, id) {
    const row = await storage.get(reservationKey(id));
    return row && typeof row === "object" ? { ...row } : null;
  }

  async _writeReservation(storage, reservation) {
    await storage.put(reservationKey(reservation.reservation_id), reservation);
  }

  _requireOwner(meta, payload, nowMs, { allowExpired = false } = {}) {
    const token = tokenDescriptor(payload);
    const lock = meta.lock;
    if (!sameOwner(lock, token)) {
      throw authorityError(409, "fenced_owner", "Scheduling reservation owner has been fenced by a newer generation", {
        current_generation: Number(meta.generation) || 0,
      });
    }
    if (!allowExpired && lockExpired(lock, nowMs)) {
      if (EXTERNAL_WRITE_POSSIBLE_STATES.has(lock.state)) {
        meta.lock = {
          ...lock,
          state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
          recovery_reason: lock.recovery_reason || "owner lease expired after external commit became possible",
          last_error: lock.last_error || "lease_expired_during_verification",
        };
        meta.quarantine = {
          reason: meta.lock.recovery_reason,
          reservation_id: lock.reservation_id,
          fencing_generation: lock.fencing_generation,
          since: nowIso(nowMs),
        };
        throw authorityError(423, "recovery_required", "Scheduling lane is quarantined pending reconciliation");
      }
      throw authorityError(409, "lease_expired", "Scheduling reservation lease expired");
    }
    return token;
  }

  async _acquire(payload) {
    const nowMs = this._now();
    const lane = laneDescriptor(payload);
    const op = operationDescriptor(payload);
    const leaseMs = boundedLeaseMs(payload.lease_ms);
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      assertLane(meta, lane);
      const existingReservation = await this._readReservation(storage, op.reservation_id);
      if (existingReservation?.committed === true && existingReservation?.state !== SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED) {
        return {
          meta,
          body: {
            ok: true,
            already_committed: true,
            fencing_generation: existingReservation.fencing_generation,
            reservation: existingReservation,
            occupied_reservations: committedOccupancy(meta, op.platform_output_record_id),
          },
        };
      }

      const lock = meta.lock;
      if (meta.quarantine) {
        recordWaiter(meta, op, nowMs);
        await this._writeMeta(storage, meta, nowMs);
        return {
          meta,
          error: authorityError(423, "lane_quarantined", "Scheduling lane requires reconciliation before another reservation can proceed", {
            quarantine: meta.quarantine,
          }),
        };
      }

      if (lock?.owner_operation_id && !lockExpired(lock, nowMs)) {
        if (
          lock.owner_operation_id === op.owner_operation_id
          && lock.reservation_id === op.reservation_id
          && lock.platform_output_record_id === op.platform_output_record_id
        ) {
          return {
            meta,
            body: {
              ok: true,
              idempotent: true,
              fencing_generation: lock.fencing_generation,
              lease_expiration_timestamp: lock.lease_expiration_timestamp,
              lock: publicLock(lock, nowMs),
              occupied_reservations: committedOccupancy(meta, op.platform_output_record_id),
            },
          };
        }
        recordWaiter(meta, op, nowMs);
        await this._writeMeta(storage, meta, nowMs);
        const retryAfterMs = Math.max(100, Math.min(2000, parseMs(lock.lease_expiration_timestamp) - nowMs));
        return {
          meta,
          error: authorityError(409, "lane_busy", "Another scheduling transaction owns this profile/platform lane", {
            retry_after_ms: retryAfterMs,
            fencing_generation: lock.fencing_generation,
            lock_state: lock.state,
          }),
        };
      }

      if (lock?.owner_operation_id && lockExpired(lock, nowMs)) {
        if (EXTERNAL_WRITE_POSSIBLE_STATES.has(lock.state)) {
          const recoveryLock = {
            ...lock,
            state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
            recovery_reason: lock.recovery_reason || "lease expired after external commit became possible",
            last_error: lock.last_error || "expired_verifying_owner",
          };
          meta.lock = recoveryLock;
          meta.quarantine = {
            reason: recoveryLock.recovery_reason,
            reservation_id: recoveryLock.reservation_id,
            fencing_generation: recoveryLock.fencing_generation,
            since: nowIso(nowMs),
          };
          const oldReservation = await this._readReservation(storage, recoveryLock.reservation_id);
          if (oldReservation) {
            await this._writeReservation(storage, {
              ...oldReservation,
              state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
              recovery_reason: recoveryLock.recovery_reason,
              updated_at: nowIso(nowMs),
            });
          }
          recordWaiter(meta, op, nowMs);
          await this._writeMeta(storage, meta, nowMs);
          return {
            meta,
            error: authorityError(423, "recovery_required", "Expired scheduling owner may have written Airtable; reconciliation is required"),
          };
        }
        const oldReservation = await this._readReservation(storage, lock.reservation_id);
        if (oldReservation && oldReservation.committed !== true) {
          await this._writeReservation(storage, {
            ...oldReservation,
            state: SCHEDULE_RESERVATION_STATES.EXPIRED,
            recovery_reason: "prewrite lease expired; safe to fence and replace",
            updated_at: nowIso(nowMs),
          });
        }
      }

      const generation = Math.max(0, Number(meta.generation) || 0) + 1;
      const attemptCount = Math.max(0, Number(existingReservation?.attempt_count) || 0) + 1;
      const acquiredAt = nowIso(nowMs);
      const newLock = {
        lock_key: lane.lock_key,
        content_profile_id: lane.content_profile_id,
        platform: lane.platform,
        owner_operation_id: op.owner_operation_id,
        factory_batch_id: op.factory_batch_id,
        platform_output_record_id: op.platform_output_record_id,
        output_type: op.output_type,
        fencing_generation: generation,
        acquired_timestamp: acquiredAt,
        last_heartbeat_timestamp: acquiredAt,
        lease_expiration_timestamp: nowIso(nowMs + leaseMs),
        state: SCHEDULE_RESERVATION_STATES.ACQUIRED,
        reservation_id: op.reservation_id,
        attempt_count: attemptCount,
        last_error: null,
        recovery_reason: null,
        external_commit_possible: false,
      };
      const reservation = {
        schema: SCHEDULE_RESERVATION_SCHEMA,
        reservation_id: op.reservation_id,
        lock_key: lane.lock_key,
        content_profile_id: lane.content_profile_id,
        platform: lane.platform,
        owner_operation_id: op.owner_operation_id,
        factory_batch_id: op.factory_batch_id,
        platform_output_record_id: op.platform_output_record_id,
        output_type: op.output_type,
        fencing_generation: generation,
        state: SCHEDULE_RESERVATION_STATES.ACQUIRED,
        action: "reserve",
        selected_iso: null,
        previous_iso: null,
        authoritative_iso: null,
        committed: false,
        attempt_count: attemptCount,
        acquired_timestamp: acquiredAt,
        last_heartbeat_timestamp: acquiredAt,
        lease_expiration_timestamp: newLock.lease_expiration_timestamp,
        updated_at: acquiredAt,
      };
      meta.generation = generation;
      meta.lock = newLock;
      meta.quarantine = null;
      if (meta.waiters?.[op.owner_operation_id]) delete meta.waiters[op.owner_operation_id];
      await this._writeReservation(storage, reservation);
      await this._writeMeta(storage, meta, nowMs);
      return {
        meta,
        body: {
          ok: true,
          fencing_generation: generation,
          reservation_id: op.reservation_id,
          lease_expiration_timestamp: newLock.lease_expiration_timestamp,
          lock: publicLock(newLock, nowMs),
          occupied_reservations: committedOccupancy(meta, op.platform_output_record_id),
        },
      };
    });
    await this._snapshot(result.meta).catch(() => {});
    if (result.error) throw result.error;
    return result.body;
  }

  async _heartbeat(payload) {
    const nowMs = this._now();
    const leaseMs = boundedLeaseMs(payload.lease_ms);
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const token = this._requireOwner(meta, payload, nowMs);
      const lock = {
        ...meta.lock,
        last_heartbeat_timestamp: nowIso(nowMs),
        lease_expiration_timestamp: nowIso(nowMs + leaseMs),
      };
      meta.lock = lock;
      const reservation = await this._readReservation(storage, token.reservation_id);
      if (reservation) {
        await this._writeReservation(storage, {
          ...reservation,
          last_heartbeat_timestamp: lock.last_heartbeat_timestamp,
          lease_expiration_timestamp: lock.lease_expiration_timestamp,
          updated_at: nowIso(nowMs),
        });
      }
      await this._writeMeta(storage, meta, nowMs);
      return { meta, body: { ok: true, fencing_generation: token.fencing_generation, lock: publicLock(lock, nowMs) } };
    });
    await this._snapshot(result.meta).catch(() => {});
    return result.body;
  }

  async _reserve(payload) {
    const nowMs = this._now();
    const action = clean(payload.action || "reserve", 32).toLowerCase();
    if (!["reserve", "move", "vacate"].includes(action)) {
      throw authorityError(400, "invalid_action", "Reservation action must be reserve, move, or vacate");
    }
    const selectedIso = action === "vacate" ? "" : normalizeIso(payload.selected_iso);
    if (action !== "vacate" && !selectedIso) {
      throw authorityError(400, "missing_selected_iso", "Selected schedule is required");
    }
    const previousIso = payload.previous_iso ? normalizeIso(payload.previous_iso) : "";
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const token = this._requireOwner(meta, payload, nowMs);
      const reservation = await this._readReservation(storage, token.reservation_id);
      if (!reservation) throw authorityError(409, "reservation_missing", "Durable reservation ledger entry is missing");
      const next = {
        ...reservation,
        state: SCHEDULE_RESERVATION_STATES.RESERVING,
        action,
        selected_iso: selectedIso || null,
        previous_iso: previousIso || reservation.previous_iso || null,
        updated_at: nowIso(nowMs),
      };
      meta.lock = {
        ...meta.lock,
        state: SCHEDULE_RESERVATION_STATES.RESERVING,
        last_heartbeat_timestamp: nowIso(nowMs),
        external_commit_possible: false,
      };
      await this._writeReservation(storage, next);
      await this._writeMeta(storage, meta, nowMs);
      return {
        meta,
        body: {
          ok: true,
          fencing_generation: token.fencing_generation,
          reservation: next,
          occupied_reservations: committedOccupancy(meta, reservation.platform_output_record_id),
        },
      };
    });
    await this._snapshot(result.meta).catch(() => {});
    return result.body;
  }

  async _beginVerify(payload) {
    const nowMs = this._now();
    const leaseMs = boundedLeaseMs(payload.lease_ms);
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const token = this._requireOwner(meta, payload, nowMs);
      const reservation = await this._readReservation(storage, token.reservation_id);
      if (!reservation || reservation.state !== SCHEDULE_RESERVATION_STATES.RESERVING) {
        throw authorityError(409, "reservation_not_ready", "Reservation must be in Reserving state before verification");
      }
      const stamp = nowIso(nowMs);
      const expires = nowIso(nowMs + leaseMs);
      const nextReservation = {
        ...reservation,
        state: SCHEDULE_RESERVATION_STATES.VERIFYING,
        commit_started_timestamp: reservation.commit_started_timestamp || stamp,
        last_heartbeat_timestamp: stamp,
        lease_expiration_timestamp: expires,
        external_commit_possible: true,
        updated_at: stamp,
      };
      meta.lock = {
        ...meta.lock,
        state: SCHEDULE_RESERVATION_STATES.VERIFYING,
        last_heartbeat_timestamp: stamp,
        lease_expiration_timestamp: expires,
        external_commit_possible: true,
      };
      await this._writeReservation(storage, nextReservation);
      await this._writeMeta(storage, meta, nowMs);
      return { meta, body: { ok: true, fencing_generation: token.fencing_generation, reservation: nextReservation } };
    });
    await this._snapshot(result.meta).catch(() => {});
    return result.body;
  }

  async _commit(payload) {
    const nowMs = this._now();
    const authoritativeIso = payload.authoritative_iso ? normalizeIso(payload.authoritative_iso) : "";
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const token = this._requireOwner(meta, payload, nowMs);
      const reservation = await this._readReservation(storage, token.reservation_id);
      if (!reservation || reservation.state !== SCHEDULE_RESERVATION_STATES.VERIFYING) {
        throw authorityError(409, "reservation_not_verifying", "Reservation is not awaiting authoritative verification");
      }
      const expected = reservation.selected_iso || "";
      const verified = reservation.action === "vacate" ? !authoritativeIso : authoritativeIso === expected;
      if (!verified) {
        const reason = reservation.action === "vacate"
          ? "authoritative schedule still present after vacate write"
          : "authoritative schedule does not match selected reservation";
        const nextReservation = {
          ...reservation,
          state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
          authoritative_iso: authoritativeIso || null,
          recovery_reason: reason,
          updated_at: nowIso(nowMs),
        };
        meta.lock = {
          ...meta.lock,
          state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
          recovery_reason: reason,
          last_error: "authoritative_verification_mismatch",
        };
        meta.quarantine = {
          reason,
          reservation_id: reservation.reservation_id,
          fencing_generation: reservation.fencing_generation,
          since: nowIso(nowMs),
        };
        await this._writeReservation(storage, nextReservation);
        await this._writeMeta(storage, meta, nowMs);
        return {
          meta,
          error: authorityError(423, "authoritative_verification_mismatch", "Authoritative schedule verification failed; lane quarantined"),
        };
      }
      const committedAt = nowIso(nowMs);
      const nextReservation = {
        ...reservation,
        state: SCHEDULE_RESERVATION_STATES.COMMITTED,
        authoritative_iso: authoritativeIso || null,
        scheduled_iso: reservation.action === "vacate" ? null : (authoritativeIso || reservation.selected_iso || null),
        committed: true,
        committed_timestamp: committedAt,
        updated_at: committedAt,
      };
      meta.lock = {
        ...meta.lock,
        state: SCHEDULE_RESERVATION_STATES.COMMITTED,
        last_heartbeat_timestamp: committedAt,
        last_error: null,
        recovery_reason: null,
      };
      meta.quarantine = null;
      setRecentReservation(meta, nextReservation, nowMs);
      await this._writeReservation(storage, nextReservation);
      await this._writeMeta(storage, meta, nowMs);
      return { meta, body: { ok: true, fencing_generation: token.fencing_generation, reservation: nextReservation } };
    });
    await this._snapshot(result.meta).catch(() => {});
    if (result.error) throw result.error;
    return result.body;
  }

  async _release(payload) {
    const nowMs = this._now();
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const token = this._requireOwner(meta, payload, nowMs, { allowExpired: true });
      const lock = meta.lock;
      if (lockExpired(lock, nowMs) && lock.state !== SCHEDULE_RESERVATION_STATES.COMMITTED) {
        throw authorityError(409, "expired_owner_cannot_release", "Expired scheduling owner cannot release this lane");
      }
      if (lock.state !== SCHEDULE_RESERVATION_STATES.COMMITTED && lock.state !== SCHEDULE_RESERVATION_STATES.RETRYABLE_FAILURE) {
        throw authorityError(409, "unsafe_release", "Scheduling lane can be released only after verified commit or a safe pre-write failure");
      }
      const reservation = await this._readReservation(storage, token.reservation_id);
      if (reservation) {
        await this._writeReservation(storage, {
          ...reservation,
          state: reservation.committed ? SCHEDULE_RESERVATION_STATES.RELEASED : SCHEDULE_RESERVATION_STATES.RETRYABLE_FAILURE,
          released_timestamp: nowIso(nowMs),
          updated_at: nowIso(nowMs),
        });
      }
      meta.lock = {
        ...lock,
        owner_operation_id: null,
        factory_batch_id: null,
        platform_output_record_id: null,
        state: SCHEDULE_RESERVATION_STATES.RELEASED,
        released_timestamp: nowIso(nowMs),
        lease_expiration_timestamp: nowIso(nowMs),
        external_commit_possible: false,
      };
      meta.quarantine = null;
      await this._writeMeta(storage, meta, nowMs);
      return { meta, body: { ok: true, released: true, fencing_generation: token.fencing_generation } };
    });
    await this._snapshot(result.meta).catch(() => {});
    return result.body;
  }

  async _fail(payload) {
    const nowMs = this._now();
    const message = clean(payload.error || payload.message || "scheduling transaction failed", 1000);
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const token = this._requireOwner(meta, payload, nowMs, { allowExpired: true });
      const reservation = await this._readReservation(storage, token.reservation_id);
      const externalPossible = Boolean(meta.lock?.external_commit_possible)
        || EXTERNAL_WRITE_POSSIBLE_STATES.has(meta.lock?.state)
        || Boolean(reservation?.external_commit_possible)
        || EXTERNAL_WRITE_POSSIBLE_STATES.has(reservation?.state);
      if (externalPossible) {
        const reason = "failure occurred after external schedule commit became possible";
        meta.lock = {
          ...meta.lock,
          state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
          last_error: message,
          recovery_reason: reason,
        };
        meta.quarantine = {
          reason,
          reservation_id: token.reservation_id,
          fencing_generation: token.fencing_generation,
          since: nowIso(nowMs),
        };
        if (reservation) {
          await this._writeReservation(storage, {
            ...reservation,
            state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
            last_error: message,
            recovery_reason: reason,
            updated_at: nowIso(nowMs),
          });
        }
        await this._writeMeta(storage, meta, nowMs);
        return {
          meta,
          body: {
            ok: false,
            recovery_required: true,
            state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
          },
        };
      }
      meta.lock = {
        ...meta.lock,
        state: SCHEDULE_RESERVATION_STATES.RETRYABLE_FAILURE,
        last_error: message,
        recovery_reason: null,
        external_commit_possible: false,
      };
      if (reservation) {
        await this._writeReservation(storage, {
          ...reservation,
          state: SCHEDULE_RESERVATION_STATES.RETRYABLE_FAILURE,
          last_error: message,
          updated_at: nowIso(nowMs),
        });
      }
      await this._writeMeta(storage, meta, nowMs);
      return {
        meta,
        body: {
          ok: false,
          recovery_required: false,
          state: SCHEDULE_RESERVATION_STATES.RETRYABLE_FAILURE,
        },
      };
    });
    await this._snapshot(result.meta).catch(() => {});
    return result.body;
  }

  async _reconcile(payload) {
    const nowMs = this._now();
    const recoveryOperationId = clean(payload.recovery_operation_id || payload.owner_operation_id, 180);
    if (!recoveryOperationId) throw authorityError(400, "missing_recovery_operation", "Recovery operation ID is required");
    const authoritativeIso = payload.authoritative_iso ? normalizeIso(payload.authoritative_iso) : "";
    const observation = clean(payload.observation || "", 32).toLowerCase();
    if (!["committed", "not_committed", "ambiguous"].includes(observation)) {
      throw authorityError(400, "invalid_recovery_observation", "Recovery observation must be committed, not_committed, or ambiguous");
    }
    const result = await this._transaction(async (storage) => {
      const meta = await this._readMeta(storage);
      const lock = meta.lock;
      if (!lock?.reservation_id) throw authorityError(409, "no_recovery_target", "No scheduling reservation requires reconciliation");
      if (!lockExpired(lock, nowMs) && lock.state !== SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED) {
        throw authorityError(409, "owner_still_live", "Scheduling owner is still live; recovery cannot take ownership");
      }
      const reservation = await this._readReservation(storage, lock.reservation_id);
      if (!reservation) {
        throw authorityError(423, "reservation_ledger_missing", "Reservation ledger is missing; lane remains quarantined");
      }

      // Fence the previous owner before evaluating any recovery result.
      const recoveryGeneration = Math.max(Number(meta.generation) || 0, Number(lock.fencing_generation) || 0) + 1;
      meta.generation = recoveryGeneration;
      meta.lock = {
        ...lock,
        owner_operation_id: recoveryOperationId,
        fencing_generation: recoveryGeneration,
        state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
        last_heartbeat_timestamp: nowIso(nowMs),
        lease_expiration_timestamp: nowIso(nowMs + SCHEDULE_RESERVATION_LEASE_MS),
        recovery_reason: lock.recovery_reason || "fenced recovery in progress",
      };

      const expected = reservation.selected_iso || "";
      const previous = reservation.previous_iso || "";
      const committedMatches = reservation.action === "vacate"
        ? observation === "committed" && !authoritativeIso
        : observation === "committed" && Boolean(expected) && authoritativeIso === expected;

      if (committedMatches) {
        const reconciled = {
          ...reservation,
          owner_operation_id: recoveryOperationId,
          fencing_generation: recoveryGeneration,
          state: SCHEDULE_RESERVATION_STATES.RECONCILED,
          committed: true,
          authoritative_iso: authoritativeIso || null,
          scheduled_iso: reservation.action === "vacate" ? null : (authoritativeIso || reservation.selected_iso || null),
          committed_timestamp: reservation.committed_timestamp || nowIso(nowMs),
          reconciled_timestamp: nowIso(nowMs),
          recovery_reason: "authoritative schedule confirms the external commit",
          updated_at: nowIso(nowMs),
        };
        setRecentReservation(meta, reconciled, nowMs);
        await this._writeReservation(storage, reconciled);
        meta.lock = {
          ...meta.lock,
          owner_operation_id: null,
          factory_batch_id: null,
          platform_output_record_id: null,
          state: SCHEDULE_RESERVATION_STATES.RELEASED,
          released_timestamp: nowIso(nowMs),
          lease_expiration_timestamp: nowIso(nowMs),
          external_commit_possible: false,
          recovery_reason: reconciled.recovery_reason,
        };
        meta.quarantine = null;
        await this._writeMeta(storage, meta, nowMs);
        return {
          meta,
          body: {
            ok: true,
            reconciled: true,
            committed: true,
            fencing_generation: recoveryGeneration,
            reservation: reconciled,
          },
        };
      }

      const commitStartedMs = parseMs(reservation.commit_started_timestamp);
      const oldProbe = reservation.recovery_probe || null;
      const sameNotCommittedObservation = observation === "not_committed"
        && (authoritativeIso || "") === (previous || "")
        && oldProbe?.observation === "not_committed"
        && (oldProbe.authoritative_iso || "") === (authoritativeIso || "");
      const probeAge = sameNotCommittedObservation ? nowMs - parseMs(oldProbe.observed_at) : 0;
      const settleAge = commitStartedMs ? nowMs - commitStartedMs : 0;
      const maySafelyAbandon = observation === "not_committed"
        && (authoritativeIso || "") === (previous || "")
        && sameNotCommittedObservation
        && probeAge >= SCHEDULE_RESERVATION_RECOVERY_STABLE_MS
        && settleAge >= SCHEDULE_RESERVATION_AMBIGUOUS_SETTLE_MS;

      if (maySafelyAbandon) {
        const reconciled = {
          ...reservation,
          owner_operation_id: recoveryOperationId,
          fencing_generation: recoveryGeneration,
          state: SCHEDULE_RESERVATION_STATES.RECONCILED,
          committed: false,
          authoritative_iso: authoritativeIso || null,
          reconciled_timestamp: nowIso(nowMs),
          recovery_reason: "two stable authoritative reads after ambiguity settle window show no external commit",
          updated_at: nowIso(nowMs),
        };
        await this._writeReservation(storage, reconciled);
        meta.lock = {
          ...meta.lock,
          owner_operation_id: null,
          factory_batch_id: null,
          platform_output_record_id: null,
          state: SCHEDULE_RESERVATION_STATES.RELEASED,
          released_timestamp: nowIso(nowMs),
          lease_expiration_timestamp: nowIso(nowMs),
          external_commit_possible: false,
          recovery_reason: reconciled.recovery_reason,
        };
        meta.quarantine = null;
        await this._writeMeta(storage, meta, nowMs);
        return {
          meta,
          body: {
            ok: true,
            reconciled: true,
            committed: false,
            fencing_generation: recoveryGeneration,
            reservation: reconciled,
          },
        };
      }

      const reason = observation === "ambiguous"
        ? "authoritative scheduling result remains ambiguous"
        : observation === "committed"
          ? "authoritative schedule does not match the selected reservation"
          : "not-committed observation is not yet stable enough for safe abandonment";
      const nextReservation = {
        ...reservation,
        owner_operation_id: recoveryOperationId,
        fencing_generation: recoveryGeneration,
        state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
        authoritative_iso: authoritativeIso || null,
        recovery_reason: reason,
        recovery_probe: {
          observation,
          authoritative_iso: authoritativeIso || null,
          observed_at: nowIso(nowMs),
        },
        updated_at: nowIso(nowMs),
      };
      await this._writeReservation(storage, nextReservation);
      meta.lock = {
        ...meta.lock,
        state: SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED,
        recovery_reason: reason,
      };
      meta.quarantine = {
        reason,
        reservation_id: reservation.reservation_id,
        fencing_generation: recoveryGeneration,
        since: meta.quarantine?.since || nowIso(nowMs),
      };
      await this._writeMeta(storage, meta, nowMs);
      return {
        meta,
        error: authorityError(423, "recovery_still_ambiguous", "Scheduling lane remains quarantined; recovery evidence is not yet safe", {
          settle_age_ms: settleAge,
          required_settle_ms: SCHEDULE_RESERVATION_AMBIGUOUS_SETTLE_MS,
          stable_probe_age_ms: probeAge,
          required_stable_probe_ms: SCHEDULE_RESERVATION_RECOVERY_STABLE_MS,
        }),
      };
    });
    await this._snapshot(result.meta).catch(() => {});
    if (result.error) throw result.error;
    return result.body;
  }

  async _status() {
    const nowMs = this._now();
    const meta = await this._readMeta();
    return {
      ok: true,
      schema: meta.schema,
      lane: meta.lane,
      generation: meta.generation,
      lock: publicLock(meta.lock, nowMs),
      quarantine: meta.quarantine,
      waiters: Object.values(meta.waiters || {}),
      recent_reservations: meta.recent_reservations || [],
      updated_at: meta.updated_at,
      thresholds: {
        lease_ms: SCHEDULE_RESERVATION_LEASE_MS,
        heartbeat_warn_ms: SCHEDULE_RESERVATION_HEARTBEAT_WARN_MS,
        contention_warn_ms: SCHEDULE_RESERVATION_CONTENTION_WARN_MS,
        queue_warn_ms: SCHEDULE_RESERVATION_QUEUE_WARN_MS,
        ambiguous_settle_ms: SCHEDULE_RESERVATION_AMBIGUOUS_SETTLE_MS,
        recovery_stable_ms: SCHEDULE_RESERVATION_RECOVERY_STABLE_MS,
      },
    };
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      let body = {};
      if (request.method !== "GET") body = await readJson(request);
      let result;
      if (request.method === "POST" && url.pathname === "/acquire") result = await this._acquire(body);
      else if (request.method === "POST" && url.pathname === "/heartbeat") result = await this._heartbeat(body);
      else if (request.method === "POST" && url.pathname === "/reserve") result = await this._reserve(body);
      else if (request.method === "POST" && url.pathname === "/begin-verify") result = await this._beginVerify(body);
      else if (request.method === "POST" && url.pathname === "/commit") result = await this._commit(body);
      else if (request.method === "POST" && url.pathname === "/release") result = await this._release(body);
      else if (request.method === "POST" && url.pathname === "/fail") result = await this._fail(body);
      else if (request.method === "POST" && url.pathname === "/reconcile") result = await this._reconcile(body);
      else if (request.method === "GET" && url.pathname === "/status") result = await this._status();
      else return responseJson({ ok: false, error: "Not found" }, 404);
      return responseJson(result);
    } catch (error) {
      return responseJson({
        ok: false,
        code: error?.code || "schedule_reservation_error",
        error: error instanceof Error ? error.message : String(error),
        details: error?.details || {},
      }, Number(error?.status) || 500);
    }
  }
}

function requireReservationBinding(env) {
  if (!scheduleReservationAuthorityEnabled(env)) return null;
  const namespace = env?.[SCHEDULE_RESERVATION_BINDING];
  if (!namespace?.idFromName || !namespace?.get) {
    throw new ScheduleReservationError(
      "Atomic scheduling reservation authority is enabled but its Durable Object binding is unavailable",
      { status: 503, code: "schedule_reservation_binding_missing" },
    );
  }
  return namespace;
}

async function callLane(env, lane, path, payload = null) {
  const namespace = requireReservationBinding(env);
  if (!namespace) return { ok: true, bypass: true, enabled: false };
  const key = scheduleReservationLaneKey(lane.content_profile_id, lane.platform);
  const stub = namespace.get(namespace.idFromName(key));
  const init = payload == null
    ? { method: "GET" }
    : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          content_profile_id: lane.content_profile_id,
          platform: lane.platform,
        }),
      };
  const response = await stub.fetch(new Request(`https://schedule-reservation${path}`, init));
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    throw new ScheduleReservationError(
      body?.error || `Scheduling reservation request failed (${response.status})`,
      {
        status: response.status,
        code: body?.code || "schedule_reservation_request_failed",
        details: body?.details || {},
      },
    );
  }
  return body || { ok: true };
}

export async function acquireScheduleReservation(env, args = {}, options = {}) {
  if (!scheduleReservationAuthorityEnabled(env)) {
    return { ok: true, bypass: true, enabled: false, occupied_reservations: [] };
  }
  const lane = laneDescriptor(args);
  const operation = operationDescriptor(args);
  const maxWaitMs = Math.max(0, Math.min(2 * 60 * 1000, Number(options.maxWaitMs ?? 30_000)));
  const started = Date.now();
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await callLane(env, lane, "/acquire", { ...args, ...operation });
    } catch (error) {
      if (!(error instanceof ScheduleReservationError) || error.code !== "lane_busy") throw error;
      const elapsed = Date.now() - started;
      if (elapsed >= maxWaitMs) {
        throw new ScheduleReservationError(
          "Timed out waiting for the profile/platform scheduling lane",
          {
            status: 409,
            code: "schedule_reservation_wait_timeout",
            details: { waited_ms: elapsed, attempt_count: attempt, ...(error.details || {}) },
          },
        );
      }
      const base = Math.max(100, Math.min(1500, Number(error.details?.retry_after_ms) || 250));
      const jitter = options.jitter === false ? 0 : Math.floor(Math.random() * Math.min(250, base));
      await (options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
        Math.min(base + jitter, Math.max(0, maxWaitMs - elapsed)),
      );
    }
  }
}

export async function heartbeatScheduleReservation(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/heartbeat", args);
}

export async function stageScheduleReservation(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/reserve", args);
}

export async function beginScheduleReservationVerification(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/begin-verify", args);
}

export async function commitScheduleReservation(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/commit", args);
}

export async function releaseScheduleReservation(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/release", args);
}

export async function failScheduleReservation(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/fail", args);
}

export async function reconcileScheduleReservation(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/reconcile", args);
}

export async function readScheduleReservationLane(env, args = {}) {
  return callLane(env, laneDescriptor(args), "/status", null);
}
