import {
  SCHEDULE_RESERVATION_CONTENTION_WARN_MS,
  SCHEDULE_RESERVATION_HEARTBEAT_WARN_MS,
  SCHEDULE_RESERVATION_INDEX_PREFIX,
  SCHEDULE_RESERVATION_QUEUE_WARN_MS,
  SCHEDULE_RESERVATION_STATES,
} from "./schedule-reservation-authority.mjs";
import {
  MAE_SCHEDULE_GAP_MS,
  MAE_STORY_COMPANION_OFFSET_MS,
} from "./mae-schedule.mjs";

export const SCHEDULE_RESERVATION_QUALITY_PREFIX = "studio/state/schedule-reservation-quality/v1";
export const SCHEDULE_RESERVATION_QUALITY_LATEST_KEY = `${SCHEDULE_RESERVATION_QUALITY_PREFIX}/latest.json`;

export const SCHEDULE_RESERVATION_SIGNATURES = Object.freeze({
  LOCK_HUNG: "QA-SCHEDULE-LOCK-HUNG",
  LOCK_CONTENTION: "QA-SCHEDULE-LOCK-CONTENTION",
  RESERVATION_DRIFT: "QA-SCHEDULE-RESERVATION-DRIFT",
  COLLISION: "QA-SCHEDULE-COLLISION",
  QUEUE_STALLED: "QA-SCHEDULE-QUEUE-STALLED",
});

export const SCHEDULE_RESERVATION_KINDS = Object.freeze({
  [SCHEDULE_RESERVATION_SIGNATURES.LOCK_HUNG]: "schedule_lock_hung",
  [SCHEDULE_RESERVATION_SIGNATURES.LOCK_CONTENTION]: "schedule_lock_contention",
  [SCHEDULE_RESERVATION_SIGNATURES.RESERVATION_DRIFT]: "schedule_reservation_drift",
  [SCHEDULE_RESERVATION_SIGNATURES.COLLISION]: "schedule_collision",
  [SCHEDULE_RESERVATION_SIGNATURES.QUEUE_STALLED]: "schedule_queue_stalled",
});

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function parseMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function iso(value) {
  const ms = parseMs(value);
  return ms ? new Date(ms).toISOString() : null;
}

function laneIdentity(snapshot = {}) {
  const lane = snapshot?.lane || {};
  const lock = snapshot?.lock || {};
  const active = snapshot?.active_reservation || {};
  return {
    content_profile_id: clean(lane.content_profile_id, 128) || null,
    profile_id: clean(lane.content_profile_id, 128) || null,
    platform: clean(lane.platform, 80) || null,
    output_id: clean(active.platform_output_record_id || lock.platform_output_record_id, 128) || null,
    platform_output_record_id: clean(active.platform_output_record_id || lock.platform_output_record_id, 128) || null,
    factory_batch_id: clean(active.factory_batch_id || lock.factory_batch_id, 180) || null,
    fencing_generation: Number(active.fencing_generation || lock.fencing_generation || snapshot?.generation) || 0,
    reservation_id: clean(active.reservation_id || lock.reservation_id, 220) || null,
  };
}

function fingerprint(signature, identity, suffix = "") {
  return [
    signature,
    identity.content_profile_id || "profile",
    identity.platform || "platform",
    identity.platform_output_record_id || "lane",
    identity.reservation_id || "reservation",
    suffix,
  ].filter(Boolean).join(":");
}

function finding(signature, snapshot, fields = {}) {
  const identity = laneIdentity(snapshot);
  const kind = SCHEDULE_RESERVATION_KINDS[signature];
  return {
    signature,
    code: signature,
    kind,
    class: fields.class || "transient",
    actor: fields.actor || "worker_heal",
    needs_eyes: Boolean(fields.needs_eyes),
    urgent: Boolean(fields.urgent),
    fingerprint: fields.fingerprint || fingerprint(signature, identity, fields.fingerprint_suffix),
    record_id: fields.record_id || identity.platform_output_record_id,
    ...identity,
    lock_age_ms: Number(fields.lock_age_ms ?? snapshot?.lock?.lock_age_ms) || 0,
    heartbeat_age_ms: Number(fields.heartbeat_age_ms ?? snapshot?.lock?.heartbeat_age_ms) || 0,
    state: fields.state || snapshot?.lock?.state || null,
    blocker: fields.blocker || null,
    diagnosis: fields.diagnosis || null,
    proposed_recovery_action: fields.proposed_recovery_action || null,
    detected_at: fields.detected_at || new Date().toISOString(),
    ...fields,
  };
}

function waiterAgeMs(waiter, nowMs) {
  const first = parseMs(waiter?.first_waiting_timestamp);
  return first ? Math.max(0, nowMs - first) : 0;
}

export function scheduleReservationSnapshotFindings(snapshot, nowMs = Date.now()) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const findings = [];
  const lock = snapshot.lock || null;
  const active = snapshot.active_reservation || null;
  const leaseExpirationMs = parseMs(lock?.lease_expiration_timestamp);
  const leaseExpired = Boolean(lock?.owner_operation_id)
    && (!leaseExpirationMs || leaseExpirationMs <= nowMs);
  const heartbeatMs = parseMs(lock?.last_heartbeat_timestamp);
  const heartbeatAgeMs = heartbeatMs ? Math.max(0, nowMs - heartbeatMs) : 0;
  const acquiredMs = parseMs(lock?.acquired_timestamp);
  const lockAgeMs = acquiredMs ? Math.max(0, nowMs - acquiredMs) : 0;
  const recoveryRequired = lock?.state === SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED
    || Boolean(snapshot.quarantine);

  // A stale heartbeat alone does not make a lock abandoned. While the lease is
  // still valid, classify it as slow/contended and never run hung-lock recovery.
  // QA-SCHEDULE-LOCK-HUNG is reserved for fenced Recovery Required lanes or
  // genuinely expired owners.
  if (recoveryRequired || leaseExpired) {
    findings.push(finding(SCHEDULE_RESERVATION_SIGNATURES.LOCK_HUNG, snapshot, {
      class: recoveryRequired ? "code_bug" : "transient",
      needs_eyes: recoveryRequired && !active,
      urgent: recoveryRequired,
      lock_age_ms: lockAgeMs,
      heartbeat_age_ms: heartbeatAgeMs,
      blocker: recoveryRequired
        ? "Scheduling lane is quarantined because an external Airtable commit may be ambiguous."
        : "Scheduling owner lease expired.",
      diagnosis: clean(
        snapshot?.quarantine?.reason
        || active?.recovery_reason
        || lock?.recovery_reason
        || lock?.last_error
        || "Owner stopped progressing",
        1000,
      ),
      proposed_recovery_action: recoveryRequired
        ? "Fence the stale owner, inspect Airtable and the reservation ledger, then reconcile only from authoritative evidence."
        : "Verify owner state; pre-write expiration may be fenced safely, but never clear a Verifying owner blindly.",
    }));
  } else if (
    lock?.owner_operation_id
    && heartbeatAgeMs >= SCHEDULE_RESERVATION_HEARTBEAT_WARN_MS
    && ![SCHEDULE_RESERVATION_STATES.COMMITTED, SCHEDULE_RESERVATION_STATES.RELEASED].includes(lock.state)
  ) {
    findings.push(finding(SCHEDULE_RESERVATION_SIGNATURES.LOCK_CONTENTION, snapshot, {
      class: "transient",
      actor: "worker_heal",
      needs_eyes: false,
      urgent: false,
      lock_age_ms: lockAgeMs,
      heartbeat_age_ms: heartbeatAgeMs,
      blocker: "Scheduling owner heartbeat is stale but its lease is still valid.",
      diagnosis: "Slow but still-owned scheduling transaction; elapsed time alone is not safe evidence of abandonment.",
      proposed_recovery_action: "Record contention and recheck owner progress. Do not clear, replace, or reconcile the owner until fencing or lease expiry proves it is safe.",
      fingerprint_suffix: "slow-live-owner",
    }));
  }

  const waiters = Array.isArray(snapshot.waiters) ? snapshot.waiters : [];
  const oldest = waiters
    .map((row) => ({ row, age: waiterAgeMs(row, nowMs) }))
    .sort((a, b) => b.age - a.age)[0] || null;
  if (oldest && oldest.age >= SCHEDULE_RESERVATION_CONTENTION_WARN_MS) {
    findings.push(finding(SCHEDULE_RESERVATION_SIGNATURES.LOCK_CONTENTION, snapshot, {
      record_id: clean(oldest.row.platform_output_record_id, 128) || laneIdentity(snapshot).platform_output_record_id,
      factory_batch_id: clean(oldest.row.factory_batch_id, 180) || laneIdentity(snapshot).factory_batch_id,
      wait_age_ms: oldest.age,
      waiting_operation_id: clean(oldest.row.owner_operation_id, 180) || null,
      blocker: `Scheduling request has waited ${Math.round(oldest.age / 1000)} seconds for this profile/platform lane.`,
      proposed_recovery_action: "Inspect current owner progress; do not bypass the lane lock.",
    }));
  }
  if (oldest && oldest.age >= SCHEDULE_RESERVATION_QUEUE_WARN_MS) {
    findings.push(finding(SCHEDULE_RESERVATION_SIGNATURES.QUEUE_STALLED, snapshot, {
      class: "code_bug",
      needs_eyes: recoveryRequired,
      urgent: recoveryRequired,
      record_id: clean(oldest.row.platform_output_record_id, 128) || laneIdentity(snapshot).platform_output_record_id,
      factory_batch_id: clean(oldest.row.factory_batch_id, 180) || laneIdentity(snapshot).factory_batch_id,
      wait_age_ms: oldest.age,
      blocker: `Scheduling queue has not advanced for ${Math.round(oldest.age / 1000)} seconds.`,
      proposed_recovery_action: recoveryRequired
        ? "Reconcile the quarantined reservation before resuming queued approvals."
        : "Verify the owner heartbeat and queue progress; fenced recovery is required if the lease expired.",
    }));
  }

  findings.push(...scheduleReservationCollisionFindings(snapshot, nowMs));
  return findings;
}

function isStoryType(value) {
  return /story/i.test(String(value || ""));
}

function documentedStoryCompanionPair(a, b, delta) {
  if (delta < 60 * 1000) return false;
  const aStory = isStoryType(a?.output_type);
  const bStory = isStoryType(b?.output_type);
  // The documented exception is one Story sitting at main + 10 minutes.
  // Two Stories 10 minutes apart still compete for normal platform capacity.
  if (aStory === bStory) return false;
  return Math.abs(delta - MAE_STORY_COMPANION_OFFSET_MS) < 60 * 1000;
}

export function scheduleReservationCollisionFindings(snapshot, nowMs = Date.now()) {
  const rows = (Array.isArray(snapshot?.recent_reservations) ? snapshot.recent_reservations : [])
    .filter((row) => Number.isFinite(parseMs(row?.scheduled_iso)))
    .sort((a, b) => parseMs(a.scheduled_iso) - parseMs(b.scheduled_iso));
  const findings = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      const delta = Math.abs(parseMs(right.scheduled_iso) - parseMs(left.scheduled_iso));
      if (delta >= MAE_SCHEDULE_GAP_MS) break;
      if (documentedStoryCompanionPair(left, right, delta)) continue;
      const identity = laneIdentity(snapshot);
      findings.push(finding(SCHEDULE_RESERVATION_SIGNATURES.COLLISION, snapshot, {
        class: "code_bug",
        actor: "desk_agent",
        needs_eyes: true,
        urgent: true,
        record_id: clean(left.platform_output_record_id, 128) || identity.platform_output_record_id,
        collision_output_ids: [
          clean(left.platform_output_record_id, 128),
          clean(right.platform_output_record_id, 128),
        ].filter(Boolean),
        collision_reservation_ids: [
          clean(left.reservation_id, 220),
          clean(right.reservation_id, 220),
        ].filter(Boolean),
        separation_ms: delta,
        scheduled_at: iso(left.scheduled_iso),
        conflicting_scheduled_at: iso(right.scheduled_iso),
        fingerprint: fingerprint(
          SCHEDULE_RESERVATION_SIGNATURES.COLLISION,
          identity,
          [left.platform_output_record_id, right.platform_output_record_id].sort().join("+"),
        ),
        blocker: `Two committed outputs are only ${Math.round(delta / 60000)} minute(s) apart on the same profile/platform lane.`,
        proposed_recovery_action: "Do not silently move an approved schedule. Raise Needs Eyes and determine the operator-approved correction.",
        detected_at: new Date(nowMs).toISOString(),
      }));
    }
  }
  return findings;
}

export function scheduleReservationAuthoritativeIso(record) {
  const fields = record?.fields || record || {};
  const raw = fields.Scheduled_Post_Date
    || fields.YouTube_Scheduled_Publish_At
    || fields.Studio_Scheduled_At
    || "";
  const ms = parseMs(raw);
  return ms ? new Date(ms).toISOString() : "";
}

export function scheduleReservationRecoveryObservation(snapshot, authoritativeIsoRaw) {
  const reservation = snapshot?.active_reservation || {};
  const action = String(reservation.action || "reserve").toLowerCase();
  const selected = iso(reservation.selected_iso) || "";
  const previous = iso(reservation.previous_iso) || "";
  const authoritative = iso(authoritativeIsoRaw) || "";
  if (action === "vacate") {
    if (!authoritative) return { observation: "committed", authoritative_iso: "" };
    if (previous && authoritative === previous) return { observation: "not_committed", authoritative_iso: authoritative };
    return { observation: "ambiguous", authoritative_iso: authoritative };
  }
  if (selected && authoritative === selected) {
    return { observation: "committed", authoritative_iso: authoritative };
  }
  if ((!previous && !authoritative) || (previous && authoritative === previous)) {
    return { observation: "not_committed", authoritative_iso: authoritative };
  }
  return { observation: "ambiguous", authoritative_iso: authoritative };
}

export function scheduleReservationDriftFinding(snapshot, reservation, record, nowMs = Date.now()) {
  if (!reservation?.platform_output_record_id) return null;
  const ledgerIso = iso(reservation.scheduled_iso) || "";
  const authoritativeIso = scheduleReservationAuthoritativeIso(record);
  if (ledgerIso === authoritativeIso) return null;
  const published = /published/i.test(String(
    record?.fields?.Publish_Status
    || record?.fields?.Output_Status
    || record?.Publish_Status
    || record?.Output_Status
    || ""
  )) || Boolean(record?.fields?.Published_At || record?.Published_At);
  return finding(SCHEDULE_RESERVATION_SIGNATURES.RESERVATION_DRIFT, snapshot, {
    class: published ? "transient" : "code_bug",
    actor: published ? "desk_agent" : "worker_heal",
    needs_eyes: published,
    urgent: !published,
    record_id: reservation.platform_output_record_id,
    reservation_id: reservation.reservation_id || null,
    fencing_generation: Number(reservation.fencing_generation) || Number(snapshot?.generation) || 0,
    ledger_scheduled_at: ledgerIso || null,
    authoritative_scheduled_at: authoritativeIso || null,
    blocker: "Durable reservation ledger and authoritative Platform Output schedule disagree.",
    diagnosis: published
      ? "Published output drift is preserved for operator review; published schedules are never silently moved."
      : "A schedule writer may have bypassed the authority or a prior commit needs reconciliation.",
    proposed_recovery_action: published
      ? "Needs Eyes: confirm published occupancy policy before changing the ledger."
      : "Acquire the same profile/platform authority, re-read Airtable, and reconcile the ledger without moving the authoritative schedule.",
    fingerprint_suffix: reservation.reservation_id || reservation.platform_output_record_id,
    detected_at: new Date(nowMs).toISOString(),
  });
}

export async function listScheduleReservationSnapshots(bucket, options = {}) {
  if (!bucket?.list || !bucket?.get) return [];
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const rows = [];
  let cursor;
  do {
    const page = await bucket.list({
      prefix: `${SCHEDULE_RESERVATION_INDEX_PREFIX}/`,
      limit: Math.min(1000, limit - rows.length),
      ...(cursor ? { cursor } : {}),
    });
    for (const object of page?.objects || []) {
      const found = await bucket.get(object.key);
      if (!found) continue;
      try {
        rows.push(JSON.parse(await found.text()));
      } catch {}
      if (rows.length >= limit) break;
    }
    cursor = page?.truncated ? page.cursor : null;
  } while (cursor && rows.length < limit);
  return rows;
}

export async function writeScheduleReservationQualityLatest(bucket, report) {
  if (!bucket?.put) return false;
  await bucket.put(SCHEDULE_RESERVATION_QUALITY_LATEST_KEY, JSON.stringify(report), {
    httpMetadata: { contentType: "application/json" },
  });
  return true;
}

export async function readScheduleReservationQualityLatest(bucket) {
  if (!bucket?.get) return null;
  const found = await bucket.get(SCHEDULE_RESERVATION_QUALITY_LATEST_KEY);
  if (!found) return null;
  try {
    return JSON.parse(await found.text());
  } catch {
    return null;
  }
}
