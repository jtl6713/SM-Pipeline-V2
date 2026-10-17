import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEDULE_RESERVATION_SIGNATURES,
  scheduleReservationCollisionFindings,
  scheduleReservationDriftFinding,
  scheduleReservationRecoveryObservation,
  scheduleReservationSnapshotFindings,
} from "./schedule-reservation-quality.mjs";

const now = Date.parse("2026-10-17T16:00:00.000Z");

function snapshot(overrides = {}) {
  return {
    lane: { content_profile_id: "recChicago", platform: "tiktok", lock_key: "recChicago::tiktok" },
    generation: 7,
    lock: {
      owner_operation_id: "op-1",
      platform_output_record_id: "recOut1",
      reservation_id: "recOut1::op-1",
      fencing_generation: 7,
      acquired_timestamp: "2026-10-17T15:59:30.000Z",
      last_heartbeat_timestamp: "2026-10-17T15:59:50.000Z",
      lease_expiration_timestamp: "2026-10-17T16:01:20.000Z",
      state: "Reserving",
    },
    active_reservation: {
      reservation_id: "recOut1::op-1",
      platform_output_record_id: "recOut1",
      fencing_generation: 7,
      state: "Reserving",
      action: "reserve",
      selected_iso: "2026-10-18T10:30:00.000Z",
      previous_iso: null,
    },
    quarantine: null,
    waiters: [],
    recent_reservations: [],
    ...overrides,
  };
}

test("healthy lane has no lock/queue findings", () => {
  assert.deepEqual(scheduleReservationSnapshotFindings(snapshot(), now), []);
});

test("Recovery Required lane raises QA-SCHEDULE-LOCK-HUNG and Needs Eyes when reservation evidence is missing", () => {
  const row = snapshot({
    lock: {
      ...snapshot().lock,
      state: "Recovery Required",
      lease_expiration_timestamp: "2026-10-17T15:59:00.000Z",
    },
    active_reservation: null,
    quarantine: { reason: "ambiguous external write", since: "2026-10-17T15:59:00.000Z" },
  });
  const findings = scheduleReservationSnapshotFindings(row, now);
  const hung = findings.find((x) => x.signature === SCHEDULE_RESERVATION_SIGNATURES.LOCK_HUNG);
  assert.ok(hung);
  assert.equal(hung.needs_eyes, true);
  assert.equal(hung.fencing_generation, 7);
});

test("30-second waiting emits contention and two-minute waiting emits queue stalled", () => {
  const base = snapshot({
    waiters: [{
      owner_operation_id: "waiting-op",
      platform_output_record_id: "recWait",
      first_waiting_timestamp: "2026-10-17T15:59:20.000Z",
      last_waiting_timestamp: "2026-10-17T15:59:55.000Z",
    }],
  });
  let findings = scheduleReservationSnapshotFindings(base, now);
  assert.ok(findings.some((x) => x.signature === SCHEDULE_RESERVATION_SIGNATURES.LOCK_CONTENTION));
  assert.ok(!findings.some((x) => x.signature === SCHEDULE_RESERVATION_SIGNATURES.QUEUE_STALLED));

  const stalled = snapshot({
    waiters: [{
      owner_operation_id: "waiting-op",
      platform_output_record_id: "recWait",
      first_waiting_timestamp: "2026-10-17T15:57:30.000Z",
      last_waiting_timestamp: "2026-10-17T15:59:55.000Z",
    }],
  });
  findings = scheduleReservationSnapshotFindings(stalled, now);
  assert.ok(findings.some((x) => x.signature === SCHEDULE_RESERVATION_SIGNATURES.QUEUE_STALLED));
});

test("same-platform committed collision is urgent and is never auto-moved", () => {
  const row = snapshot({
    lock: null,
    active_reservation: null,
    recent_reservations: [
      { platform_output_record_id: "recA", reservation_id: "a", output_type: "Reel", scheduled_iso: "2026-10-18T10:30:00.000Z" },
      { platform_output_record_id: "recB", reservation_id: "b", output_type: "Multi-Image Post", scheduled_iso: "2026-10-18T10:45:00.000Z" },
    ],
  });
  const collisions = scheduleReservationCollisionFindings(row, now);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].signature, SCHEDULE_RESERVATION_SIGNATURES.COLLISION);
  assert.equal(collisions[0].needs_eyes, true);
  assert.match(collisions[0].proposed_recovery_action, /Do not silently move/);
});

test("documented Story main +10 companion pair is not classified as collision", () => {
  const row = snapshot({
    lock: null,
    active_reservation: null,
    recent_reservations: [
      { platform_output_record_id: "recMain", reservation_id: "main", output_type: "Reel", scheduled_iso: "2026-10-18T10:30:00.000Z" },
      { platform_output_record_id: "recStory", reservation_id: "story", output_type: "Story", scheduled_iso: "2026-10-18T10:40:00.000Z" },
    ],
  });
  assert.deepEqual(scheduleReservationCollisionFindings(row, now), []);
});

test("recovery observation distinguishes committed, not-committed, and ambiguous external writes", () => {
  const row = snapshot({
    active_reservation: {
      ...snapshot().active_reservation,
      state: "Recovery Required",
      action: "move",
      selected_iso: "2026-10-18T17:30:00.000Z",
      previous_iso: "2026-10-18T10:30:00.000Z",
    },
  });
  assert.deepEqual(
    scheduleReservationRecoveryObservation(row, "2026-10-18T17:30:00.000Z"),
    { observation: "committed", authoritative_iso: "2026-10-18T17:30:00.000Z" },
  );
  assert.deepEqual(
    scheduleReservationRecoveryObservation(row, "2026-10-18T10:30:00.000Z"),
    { observation: "not_committed", authoritative_iso: "2026-10-18T10:30:00.000Z" },
  );
  assert.equal(
    scheduleReservationRecoveryObservation(row, "2026-10-18T12:00:00.000Z").observation,
    "ambiguous",
  );
});

test("reservation drift reports authoritative/ledger mismatch and published drift requires Needs Eyes", () => {
  const row = snapshot({ lock: null, active_reservation: null });
  const reservation = {
    platform_output_record_id: "recA",
    reservation_id: "resA",
    fencing_generation: 6,
    scheduled_iso: "2026-10-18T10:30:00.000Z",
  };
  const open = scheduleReservationDriftFinding(row, reservation, {
    id: "recA",
    fields: { Scheduled_Post_Date: "2026-10-18T17:30:00.000Z", Output_Status: "Approved for Publishing" },
  }, now);
  assert.equal(open.signature, SCHEDULE_RESERVATION_SIGNATURES.RESERVATION_DRIFT);
  assert.equal(open.needs_eyes, false);

  const published = scheduleReservationDriftFinding(row, reservation, {
    id: "recA",
    fields: { Scheduled_Post_Date: "2026-10-18T17:30:00.000Z", Output_Status: "Published", Published_At: "2026-10-18T17:31:00Z" },
  }, now);
  assert.equal(published.needs_eyes, true);
});
