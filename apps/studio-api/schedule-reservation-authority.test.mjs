import test from "node:test";
import assert from "node:assert/strict";
import {
  ScheduleReservationLane,
  SCHEDULE_RESERVATION_AMBIGUOUS_SETTLE_MS,
  SCHEDULE_RESERVATION_RECOVERY_STABLE_MS,
  SCHEDULE_RESERVATION_STATES,
  scheduleReservationAuthorityEnabled,
  scheduleReservationLaneKey,
  scheduleReservationId,
} from "./schedule-reservation-authority.mjs";

class FakeStorage {
  constructor() {
    this.map = new Map();
  }
  async get(key) {
    const value = this.map.get(key);
    return value == null ? value : structuredClone(value);
  }
  async put(key, value) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key) {
    this.map.delete(key);
  }
  async transaction(fn) {
    const before = new Map([...this.map.entries()].map(([k, v]) => [k, structuredClone(v)]));
    try {
      return await fn(this);
    } catch (error) {
      this.map = before;
      throw error;
    }
  }
}

function makeLane(nowMs = Date.parse("2026-10-17T15:00:00.000Z")) {
  const state = { storage: new FakeStorage() };
  const lane = new ScheduleReservationLane(state, {});
  let clock = nowMs;
  lane._now = () => clock;
  return {
    lane,
    state,
    now: () => clock,
    setNow: (value) => { clock = Number(value); },
    advance: (ms) => { clock += Number(ms); },
  };
}

const base = {
  content_profile_id: "recChicagoProfile",
  platform: "TikTok",
};

function op(output, operation) {
  return {
    ...base,
    platform_output_record_id: output,
    owner_operation_id: operation,
    reservation_id: scheduleReservationId(output, operation),
  };
}

async function post(lane, path, body) {
  const response = await lane.fetch(new Request(`https://lane${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  const json = await response.json();
  return { status: response.status, body: json };
}

async function get(lane, path = "/status") {
  const response = await lane.fetch(new Request(`https://lane${path}`));
  return { status: response.status, body: await response.json() };
}

test("reservation authority is disabled by default and lane key is profile + platform", () => {
  assert.equal(scheduleReservationAuthorityEnabled({}), false);
  assert.equal(scheduleReservationAuthorityEnabled({ STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "false" }), false);
  assert.equal(scheduleReservationAuthorityEnabled({ STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true" }), true);
  assert.equal(scheduleReservationLaneKey("recChicagoProfile", "TikTok"), "recChicagoProfile::tiktok");
  assert.equal(scheduleReservationLaneKey("recChicagoProfile", "Reel"), "recChicagoProfile::reel");
});

test("one owner acquires a lane and a competing owner waits instead of scheduling from stale occupancy", async () => {
  const { lane } = makeLane();
  const a = op("recOutA", "op-a");
  const b = op("recOutB", "op-b");
  const acquired = await post(lane, "/acquire", a);
  assert.equal(acquired.status, 200);
  assert.equal(acquired.body.fencing_generation, 1);

  const blocked = await post(lane, "/acquire", b);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "lane_busy");

  const status = await get(lane);
  assert.equal(status.body.lock.platform_output_record_id, "recOutA");
  assert.equal(status.body.waiters.length, 1);
  assert.equal(status.body.waiters[0].state, SCHEDULE_RESERVATION_STATES.WAITING);
});

test("expired pre-write owner is fenced and replaced with a higher generation", async () => {
  const { lane, advance } = makeLane();
  const a = op("recOutA", "op-a");
  const b = op("recOutB", "op-b");
  const first = await post(lane, "/acquire", { ...a, lease_ms: 30_000 });
  assert.equal(first.body.fencing_generation, 1);
  await post(lane, "/reserve", {
    ...a,
    fencing_generation: 1,
    selected_iso: "2026-10-18T10:30:00.000Z",
  });

  advance(31_000);
  const second = await post(lane, "/acquire", b);
  assert.equal(second.status, 200);
  assert.equal(second.body.fencing_generation, 2);

  const staleRelease = await post(lane, "/release", { ...a, fencing_generation: 1 });
  assert.equal(staleRelease.status, 409);
  assert.equal(staleRelease.body.code, "fenced_owner");
});

test("Verifying owner that expires quarantines the lane instead of handing it to a contender", async () => {
  const { lane, advance } = makeLane();
  const a = op("recOutA", "op-a");
  const b = op("recOutB", "op-b");
  await post(lane, "/acquire", { ...a, lease_ms: 30_000 });
  await post(lane, "/reserve", {
    ...a,
    fencing_generation: 1,
    selected_iso: "2026-10-18T10:30:00.000Z",
  });
  await post(lane, "/begin-verify", { ...a, fencing_generation: 1, lease_ms: 30_000 });
  advance(31_000);

  const blocked = await post(lane, "/acquire", b);
  assert.equal(blocked.status, 423);
  assert.equal(blocked.body.code, "recovery_required");

  const status = await get(lane);
  assert.equal(status.body.lock.state, SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED);
  assert.ok(status.body.quarantine);
});

test("verified commit is durable before release and becomes occupancy for the next output", async () => {
  const { lane } = makeLane();
  const a = op("recOutA", "op-a");
  const iso = "2026-10-18T10:30:00.000Z";
  await post(lane, "/acquire", a);
  await post(lane, "/reserve", { ...a, fencing_generation: 1, selected_iso: iso });
  await post(lane, "/begin-verify", { ...a, fencing_generation: 1 });
  const committed = await post(lane, "/commit", {
    ...a,
    fencing_generation: 1,
    authoritative_iso: iso,
  });
  assert.equal(committed.status, 200);
  assert.equal(committed.body.reservation.state, SCHEDULE_RESERVATION_STATES.COMMITTED);

  let status = await get(lane);
  assert.equal(status.body.lock.state, SCHEDULE_RESERVATION_STATES.COMMITTED);
  assert.equal(status.body.recent_reservations.length, 1);
  assert.equal(status.body.recent_reservations[0].scheduled_iso, iso);

  const released = await post(lane, "/release", { ...a, fencing_generation: 1 });
  assert.equal(released.status, 200);

  const b = op("recOutB", "op-b");
  const next = await post(lane, "/acquire", b);
  assert.equal(next.status, 200);
  assert.equal(next.body.fencing_generation, 2);
  assert.deepEqual(next.body.occupied_reservations.map((x) => x.scheduled_iso), [iso]);

  status = await get(lane);
  assert.equal(status.body.lock.platform_output_record_id, "recOutB");
});

test("authoritative mismatch never releases the lane", async () => {
  const { lane } = makeLane();
  const a = op("recOutA", "op-a");
  await post(lane, "/acquire", a);
  await post(lane, "/reserve", {
    ...a,
    fencing_generation: 1,
    selected_iso: "2026-10-18T10:30:00.000Z",
  });
  await post(lane, "/begin-verify", { ...a, fencing_generation: 1 });
  const mismatch = await post(lane, "/commit", {
    ...a,
    fencing_generation: 1,
    authoritative_iso: "2026-10-18T17:30:00.000Z",
  });
  assert.equal(mismatch.status, 423);
  assert.equal(mismatch.body.code, "authoritative_verification_mismatch");

  const status = await get(lane);
  assert.equal(status.body.lock.state, SCHEDULE_RESERVATION_STATES.RECOVERY_REQUIRED);
  assert.ok(status.body.quarantine);
});

test("stale owner cannot commit after a recovery generation fences it", async () => {
  const { lane, advance } = makeLane();
  const a = op("recOutA", "op-a");
  const iso = "2026-10-18T10:30:00.000Z";
  await post(lane, "/acquire", { ...a, lease_ms: 30_000 });
  await post(lane, "/reserve", { ...a, fencing_generation: 1, selected_iso: iso });
  await post(lane, "/begin-verify", { ...a, fencing_generation: 1, lease_ms: 30_000 });
  advance(31_000);

  const recovery = await post(lane, "/reconcile", {
    ...base,
    recovery_operation_id: "qa-recovery-1",
    observation: "committed",
    authoritative_iso: iso,
  });
  assert.equal(recovery.status, 200);
  assert.equal(recovery.body.fencing_generation, 2);
  assert.equal(recovery.body.reconciled, true);

  const stale = await post(lane, "/commit", {
    ...a,
    fencing_generation: 1,
    authoritative_iso: iso,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "fenced_owner");
});

test("ambiguous no-write recovery needs a settle window and two stable reads", async () => {
  const start = Date.parse("2026-10-17T15:00:00.000Z");
  const { lane, setNow, advance } = makeLane(start);
  const a = op("recOutA", "op-a");
  await post(lane, "/acquire", { ...a, lease_ms: 30_000 });
  await post(lane, "/reserve", {
    ...a,
    fencing_generation: 1,
    selected_iso: "2026-10-18T10:30:00.000Z",
  });
  await post(lane, "/begin-verify", { ...a, fencing_generation: 1, lease_ms: 30_000 });
  advance(31_000);

  const early = await post(lane, "/reconcile", {
    ...base,
    recovery_operation_id: "qa-recovery-1",
    observation: "not_committed",
    authoritative_iso: "",
  });
  assert.equal(early.status, 423);
  assert.equal(early.body.code, "recovery_still_ambiguous");

  setNow(start + SCHEDULE_RESERVATION_AMBIGUOUS_SETTLE_MS + 1);
  const firstStable = await post(lane, "/reconcile", {
    ...base,
    recovery_operation_id: "qa-recovery-1",
    observation: "not_committed",
    authoritative_iso: "",
  });
  assert.equal(firstStable.status, 423);

  advance(SCHEDULE_RESERVATION_RECOVERY_STABLE_MS + 1);
  const secondStable = await post(lane, "/reconcile", {
    ...base,
    recovery_operation_id: "qa-recovery-1",
    observation: "not_committed",
    authoritative_iso: "",
  });
  assert.equal(secondStable.status, 200);
  assert.equal(secondStable.body.reconciled, true);
  assert.equal(secondStable.body.committed, false);

  const status = await get(lane);
  assert.equal(status.body.quarantine, null);
  assert.equal(status.body.lock.state, SCHEDULE_RESERVATION_STATES.RELEASED);
});

test("move replaces an output occupancy only after the replacement is verified", async () => {
  const { lane } = makeLane();
  const first = op("recOutA", "op-a");
  const oldIso = "2026-10-18T10:30:00.000Z";
  const newIso = "2026-10-18T17:30:00.000Z";

  await post(lane, "/acquire", first);
  await post(lane, "/reserve", { ...first, fencing_generation: 1, selected_iso: oldIso });
  await post(lane, "/begin-verify", { ...first, fencing_generation: 1 });
  await post(lane, "/commit", { ...first, fencing_generation: 1, authoritative_iso: oldIso });
  await post(lane, "/release", { ...first, fencing_generation: 1 });

  const move = op("recOutA", "op-move");
  const acquireMove = await post(lane, "/acquire", move);
  assert.equal(acquireMove.body.occupied_reservations.length, 0, "current output must exclude its old occupancy while moving");
  await post(lane, "/reserve", {
    ...move,
    fencing_generation: 2,
    action: "move",
    previous_iso: oldIso,
    selected_iso: newIso,
  });

  let status = await get(lane);
  assert.equal(status.body.recent_reservations[0].scheduled_iso, oldIso, "old occupancy remains until replacement commit");

  await post(lane, "/begin-verify", { ...move, fencing_generation: 2 });
  await post(lane, "/commit", { ...move, fencing_generation: 2, authoritative_iso: newIso });
  await post(lane, "/release", { ...move, fencing_generation: 2 });

  status = await get(lane);
  assert.equal(status.body.recent_reservations.length, 1);
  assert.equal(status.body.recent_reservations[0].scheduled_iso, newIso);
});

test("vacate removes committed occupancy only after authoritative schedule is confirmed blank", async () => {
  const { lane } = makeLane();
  const first = op("recOutA", "op-a");
  const iso = "2026-10-18T10:30:00.000Z";
  await post(lane, "/acquire", first);
  await post(lane, "/reserve", { ...first, fencing_generation: 1, selected_iso: iso });
  await post(lane, "/begin-verify", { ...first, fencing_generation: 1 });
  await post(lane, "/commit", { ...first, fencing_generation: 1, authoritative_iso: iso });
  await post(lane, "/release", { ...first, fencing_generation: 1 });

  const cancel = op("recOutA", "op-cancel");
  await post(lane, "/acquire", cancel);
  await post(lane, "/reserve", {
    ...cancel,
    fencing_generation: 2,
    action: "vacate",
    previous_iso: iso,
  });
  await post(lane, "/begin-verify", { ...cancel, fencing_generation: 2 });
  await post(lane, "/commit", { ...cancel, fencing_generation: 2, authoritative_iso: "" });
  await post(lane, "/release", { ...cancel, fencing_generation: 2 });

  const status = await get(lane);
  assert.equal(status.body.recent_reservations.length, 0);
});


test("alarm safely releases a verified committed owner without losing occupancy", async () => {
  const { lane, advance } = makeLane();
  const a = op("recOutA", "op-a");
  const iso = "2026-10-18T10:30:00.000Z";
  await post(lane, "/acquire", { ...a, lease_ms: 30_000 });
  await post(lane, "/reserve", { ...a, fencing_generation: 1, selected_iso: iso });
  await post(lane, "/begin-verify", { ...a, fencing_generation: 1, lease_ms: 30_000 });
  await post(lane, "/commit", { ...a, fencing_generation: 1, authoritative_iso: iso });

  advance(31_000);
  await lane.alarm();

  const status = await get(lane);
  assert.equal(status.body.lock.state, SCHEDULE_RESERVATION_STATES.RELEASED);
  assert.equal(status.body.lock.owner_operation_id, null);
  assert.equal(status.body.quarantine, null);
  assert.equal(status.body.recent_reservations.length, 1);
  assert.equal(status.body.recent_reservations[0].scheduled_iso, iso);

  const b = op("recOutB", "op-b");
  const next = await post(lane, "/acquire", b);
  assert.equal(next.status, 200);
  assert.deepEqual(next.body.occupied_reservations.map((row) => row.scheduled_iso), [iso]);
});
