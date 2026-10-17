import test from "node:test";
import assert from "node:assert/strict";

import {
  ScheduleReservationLane,
  acquireScheduleReservation,
  failScheduleReservation,
} from "./schedule-reservation-authority.mjs";
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";
import {
  MAE_SCHEDULE_GAP_MS,
  maeScheduleConflicts,
  maeScheduleNextSlot,
} from "./mae-schedule.mjs";

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) {
    const value = this.map.get(key);
    return value == null ? value : structuredClone(value);
  }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { this.map.delete(key); }
  async transaction(fn) {
    const before = new Map([...this.map.entries()].map(([k, v]) => [k, structuredClone(v)]));
    try { return await fn(this); }
    catch (error) { this.map = before; throw error; }
  }
}

class FakeNamespace {
  constructor() { this.objects = new Map(); }
  idFromName(name) { return name; }
  get(id) {
    if (!this.objects.has(id)) {
      const state = { storage: new FakeStorage() };
      const lane = new ScheduleReservationLane(state, {});
      lane._now = () => Date.parse("2026-10-17T15:00:00.000Z");
      this.objects.set(id, lane);
    }
    const lane = this.objects.get(id);
    return { fetch: (request) => lane.fetch(request) };
  }
  lane(id) { return this.objects.get(id); }
}

function makeEnv() {
  return {
    STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true",
    STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST: ["recChicago", "recNewYork", "recOther", "recMiami", "recLosAngeles", "recFacebookHeld", "recTikTokFree", "recChicagoHeld", "recNewYorkFree"].flatMap(p => ["facebook","tiktok","instagram","youtube"].map(v => `${p}::${v}`)).join(","),
    STUDIO_SCHEDULE_RESERVATIONS: new FakeNamespace(),
  };
}

const NOW = new Date("2026-10-17T15:00:00.000Z");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function schedulerCallbacks(authoritative, outputId, type = "Reel", hooks = {}) {
  return {
    plan: async ({ occupied_reservations }) => {
      hooks.onPlan?.(occupied_reservations);
      const platformOccupiedMs = (occupied_reservations || [])
        .map((row) => Date.parse(String(row.scheduled_iso || "")))
        .filter(Number.isFinite);
      const laneOccupiedMs = (occupied_reservations || [])
        .filter((row) => String(row.output_type || "").toLowerCase() === String(type).toLowerCase())
        .map((row) => Date.parse(String(row.scheduled_iso || "")))
        .filter(Number.isFinite);
      const picked = maeScheduleNextSlot({
        now: NOW,
        timeZone: "America/Chicago",
        horizonDays: 30,
        laneOccupiedMs,
        platformOccupiedMs,
      });
      assert.equal(picked.ok, true);
      return { action: "reserve", selectedIso: picked.iso, previousIso: "" };
    },
    write: async (plan) => {
      hooks.onWriteStarted?.(plan);
      if (hooks.writeBarrier) await hooks.writeBarrier.promise;
      authoritative.set(outputId, plan.selectedIso);
      return { id: outputId, selectedIso: plan.selectedIso };
    },
    verify: async (_row, plan) => {
      const stored = authoritative.get(outputId) || "";
      assert.equal(stored, plan.selectedIso);
      return stored;
    },
  };
}

async function scheduleOne(env, authoritative, {
  profile = "recChicago",
  platform = "Facebook",
  outputId,
  type = "Reel",
  operation = `approve:${outputId}`,
  hooks = {},
  maxWaitMs = 0,
} = {}) {
  return runAtomicScheduleTransaction(env, {
    content_profile_id: profile,
    platform,
    output_type: type,
    platform_output_record_id: outputId,
    owner_operation_id: operation,
  }, schedulerCallbacks(authoritative, outputId, type, hooks), {
    maxWaitMs,
    jitter: false,
  });
}

function assertSeparated(isos) {
  const values = isos.map((iso) => Date.parse(iso)).sort((a, b) => a - b);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      assert.equal(
        maeScheduleConflicts(values[i], [values[j]], MAE_SCHEDULE_GAP_MS),
        false,
        `schedule collision between ${new Date(values[i]).toISOString()} and ${new Date(values[j]).toISOString()}`,
      );
    }
  }
}

test("ten Facebook outputs commit ten unique nonconflicting MAE reservations", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const isos = [];
  for (let i = 1; i <= 10; i += 1) {
    const outputId = `recFacebook${i}`;
    const result = await scheduleOne(env, authoritative, { platform: "Facebook", outputId, type: "Reel" });
    isos.push(result.value.selectedIso);
  }
  assert.equal(new Set(isos).size, 10);
  assertSeparated(isos);
});

test("ten TikTok outputs commit ten unique nonconflicting MAE reservations", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const isos = [];
  for (let i = 1; i <= 10; i += 1) {
    const outputId = `recTikTok${i}`;
    const result = await scheduleOne(env, authoritative, { platform: "TikTok", outputId, type: "Video Draft" });
    isos.push(result.value.selectedIso);
  }
  assert.equal(new Set(isos).size, 10);
  assertSeparated(isos);
});

test("two Factory-style batches on the same lane cannot plan concurrently", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const first = scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recBatchA1",
    operation: "factory-batch:batch-a:recBatchA1",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  await assert.rejects(
    scheduleOne(env, authoritative, {
      platform: "Facebook",
      outputId: "recBatchB1",
      operation: "factory-batch:batch-b:recBatchB1",
    }),
    /lane|waiting|busy/i,
  );

  barrier.resolve();
  const committedFirst = await first;

  let seen = [];
  const committedSecond = await scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recBatchB1",
    operation: "factory-batch:batch-b:recBatchB1",
    hooks: { onPlan: (rows) => { seen = rows; } },
  });
  assert.ok(seen.some((row) => row.platform_output_record_id === "recBatchA1"));
  assert.notEqual(committedSecond.value.selectedIso, committedFirst.value.selectedIso);
});

test("Factory batch and Pipeline single approval serialize on the same lane", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const factory = scheduleOne(env, authoritative, {
    platform: "TikTok",
    outputId: "recFactory",
    operation: "factory-batch:batch-1:recFactory",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  await assert.rejects(
    scheduleOne(env, authoritative, {
      platform: "TikTok",
      outputId: "recPipeline",
      operation: "pipeline-approve:recPipeline",
    }),
    /lane|waiting|busy/i,
  );

  barrier.resolve();
  const first = await factory;
  const second = await scheduleOne(env, authoritative, {
    platform: "TikTok",
    outputId: "recPipeline",
    operation: "pipeline-approve:recPipeline",
  });
  assert.notEqual(first.value.selectedIso, second.value.selectedIso);
});

test("different platforms do not block while another platform is inside external write", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const facebook = scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recFacebookHeld",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  const tiktok = await scheduleOne(env, authoritative, {
    platform: "TikTok",
    outputId: "recTikTokFree",
    type: "Video Draft",
  });
  assert.ok(tiktok.value.selectedIso);

  barrier.resolve();
  await facebook;
});

test("different content profiles do not block on the same platform", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const chicago = scheduleOne(env, authoritative, {
    profile: "recChicago",
    platform: "Facebook",
    outputId: "recChicagoHeld",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  const newYork = await scheduleOne(env, authoritative, {
    profile: "recNewYork",
    platform: "Facebook",
    outputId: "recNewYorkFree",
  });
  assert.ok(newYork.value.selectedIso);

  barrier.resolve();
  await chicago;
});

test("different output types share one platform wall-clock occupancy", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const reel = await scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recReel",
    type: "Reel",
  });
  let feedSawReel = false;
  const feed = await scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recFeed",
    type: "Multi-Image Post",
    hooks: {
      onPlan: (rows) => {
        feedSawReel = rows.some((row) => row.platform_output_record_id === "recReel");
      },
    },
  });
  assert.equal(feedSawReel, true);
  assert.notEqual(feed.value.selectedIso, reel.value.selectedIso);
  assertSeparated([reel.value.selectedIso, feed.value.selectedIso]);
});

test("browser/client disappearance cannot release a transaction frozen after external-write intent", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const background = scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recBackground",
    operation: "factory-batch:durable-job:recBackground",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  await assert.rejects(
    scheduleOne(env, authoritative, {
      platform: "Facebook",
      outputId: "recContender",
      operation: "pipeline-approve:recContender",
    }),
    /lane|waiting|busy/i,
  );

  // No browser object participates in this state. Releasing the simulated
  // backend write is sufficient for the durable Worker transaction to finish.
  barrier.resolve();
  const result = await background;
  assert.equal(authoritative.get("recBackground"), result.value.selectedIso);
});

test("operation retry is idempotent after a verified commit and does not write twice", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  let writes = 0;
  const args = {
    content_profile_id: "recChicago",
    platform: "Facebook",
    output_type: "Reel",
    platform_output_record_id: "recRetry",
    owner_operation_id: "factory-batch:stable:recRetry",
  };
  const callbacks = schedulerCallbacks(authoritative, "recRetry", "Reel", {
    onWriteStarted: () => { writes += 1; },
  });
  const first = await runAtomicScheduleTransaction(env, args, callbacks, { maxWaitMs: 0, jitter: false });
  const second = await runAtomicScheduleTransaction(env, args, callbacks, { maxWaitMs: 0, jitter: false });
  assert.equal(first.value.selectedIso, authoritative.get("recRetry"));
  assert.equal(second.already_committed, true);
  assert.equal(writes, 1);
});

test("same-lane crash before external write is safely retryable after explicit fail/release", async () => {
  const env = makeEnv();
  const acquired = await acquireScheduleReservation(env, {
    content_profile_id: "recChicago",
    platform: "Facebook",
    output_type: "Reel",
    platform_output_record_id: "recCrashBefore",
    owner_operation_id: "crash-before",
  }, { maxWaitMs: 0, jitter: false });
  assert.equal(acquired.ok, true);
  const failure = await failScheduleReservation(env, {
    content_profile_id: "recChicago",
    platform: "Facebook",
    platform_output_record_id: "recCrashBefore",
    owner_operation_id: "crash-before",
    reservation_id: acquired.reservation_id,
    fencing_generation: acquired.fencing_generation,
    error: "simulated pre-write crash",
  });
  assert.equal(failure.recovery_required, false);
});


test("manual override cannot bypass an automatic reservation on the same lane", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const automatic = scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recAutoHeld",
    operation: "pipeline-approve:recAutoHeld",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  let manualWrites = 0;
  const manualArgs = {
    content_profile_id: "recChicago",
    platform: "Facebook",
    output_type: "Multi-Image Post",
    platform_output_record_id: "recManual",
    owner_operation_id: "manual:recManual",
  };
  const manualTarget = "2026-10-18T10:30:00.000Z";
  const manualCallbacks = {
    plan: async ({ occupied_reservations }) => {
      const occupied = (occupied_reservations || [])
        .map((row) => Date.parse(String(row.scheduled_iso || "")))
        .filter(Number.isFinite);
      const requestedMs = Date.parse(manualTarget);
      if (maeScheduleConflicts(requestedMs, occupied)) {
        throw new Error("manual schedule conflict");
      }
      return { action: "reserve", selectedIso: manualTarget, previousIso: "" };
    },
    write: async (plan) => {
      manualWrites += 1;
      authoritative.set("recManual", plan.selectedIso);
      return { id: "recManual", selectedIso: plan.selectedIso };
    },
    verify: async (_row, plan) => authoritative.get("recManual") || plan.selectedIso,
  };

  await assert.rejects(
    runAtomicScheduleTransaction(env, manualArgs, manualCallbacks, { maxWaitMs: 0, jitter: false }),
    /lane|waiting|busy/i,
  );
  assert.equal(manualWrites, 0, "manual override must not write while the automatic owner holds the lane");

  barrier.resolve();
  const committedAuto = await automatic;
  const committedIso = committedAuto.value.selectedIso;

  const conflictingCallbacks = {
    ...manualCallbacks,
    plan: async ({ occupied_reservations }) => {
      const occupied = (occupied_reservations || [])
        .map((row) => Date.parse(String(row.scheduled_iso || "")))
        .filter(Number.isFinite);
      assert.ok(occupied.includes(Date.parse(committedIso)));
      if (maeScheduleConflicts(Date.parse(committedIso), occupied)) {
        throw new Error("manual schedule conflict");
      }
      return { action: "reserve", selectedIso: committedIso, previousIso: "" };
    },
  };

  await assert.rejects(
    runAtomicScheduleTransaction(
      env,
      { ...manualArgs, owner_operation_id: "manual:recManual:retry" },
      conflictingCallbacks,
      { maxWaitMs: 0, jitter: false },
    ),
    /manual schedule conflict/,
  );
  assert.equal(manualWrites, 0, "conflicting explicit manual time must be rejected, not silently moved or written");
});


test("manual exact-time override competing with automatic reservation waits, then rejects the occupied slot", async () => {
  const env = makeEnv();
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const automatic = scheduleOne(env, authoritative, {
    platform: "Facebook",
    outputId: "recAutoHeld",
    operation: "pipeline-approve:recAutoHeld",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  // A manual request cannot bypass a live automatic owner merely because the
  // operator supplied an exact time.
  await assert.rejects(
    runAtomicScheduleTransaction(env, {
      content_profile_id: "recChicago",
      platform: "Facebook",
      output_type: "Multi-Image Post",
      platform_output_record_id: "recManual",
      owner_operation_id: "manual-schedule:recManual",
    }, {
      plan: async () => ({
        action: "reserve",
        selectedIso: "2026-10-18T10:30:00.000Z",
        previousIso: "",
      }),
      write: async () => ({ id: "recManual" }),
      verify: async () => "2026-10-18T10:30:00.000Z",
    }, { maxWaitMs: 0, jitter: false }),
    /lane|waiting|busy/i,
  );

  barrier.resolve();
  const committed = await automatic;
  const occupiedIso = committed.value.selectedIso;

  // After the automatic owner commits, the manual transaction gets the lane,
  // sees that durable occupancy, and must reject the explicit conflicting time
  // instead of silently shifting it.
  await assert.rejects(
    runAtomicScheduleTransaction(env, {
      content_profile_id: "recChicago",
      platform: "Facebook",
      output_type: "Multi-Image Post",
      platform_output_record_id: "recManual",
      owner_operation_id: "manual-schedule:recManual:retry",
    }, {
      plan: async ({ occupied_reservations }) => {
        const occupiedMs = occupied_reservations
          .map((row) => Date.parse(String(row.scheduled_iso || "")))
          .filter(Number.isFinite);
        const requestedMs = Date.parse(occupiedIso);
        assert.equal(maeScheduleConflicts(requestedMs, occupiedMs), true);
        throw new Error("Requested manual schedule conflicts with another output on this profile and platform");
      },
      write: async () => {
        throw new Error("manual conflict must never write");
      },
      verify: async () => "",
    }, { maxWaitMs: 0, jitter: false }),
    /conflicts with another output/,
  );
});

test("lease expiration during an in-flight external write quarantines the lane until fenced reconciliation", async () => {
  const env = makeEnv();
  const namespace = env.STUDIO_SCHEDULE_RESERVATIONS;
  const authoritative = new Map();
  const barrier = deferred();
  const writeStarted = deferred();

  const pending = scheduleOne(env, authoritative, {
    platform: "TikTok",
    outputId: "recLeaseInflight",
    type: "Video Draft",
    operation: "factory-batch:lease-test:recLeaseInflight",
    hooks: {
      writeBarrier: barrier,
      onWriteStarted: () => writeStarted.resolve(),
    },
  });
  await writeStarted.promise;

  const lane = namespace.lane("recChicago::tiktok");
  assert.ok(lane, "Durable Object lane must exist");
  const originalNow = lane._now();
  lane._now = () => originalNow + 91_000;
  await lane.alarm();

  const status = await (await lane.fetch(new Request("https://lane/status"))).json();
  assert.equal(status.lock.state, "Recovery Required");
  assert.ok(status.quarantine);

  await assert.rejects(
    scheduleOne(env, authoritative, {
      platform: "TikTok",
      outputId: "recLeaseContender",
      type: "Video Draft",
      operation: "pipeline-approve:recLeaseContender",
    }),
    /reconciliation|quarantined|recovery/i,
  );

  // Finish the simulated request only so the promise does not leak. The stale
  // owner's later verify/commit is fenced by the recovery-required lane.
  barrier.resolve();
  await assert.rejects(pending, /recovery|required|lease|fenced/i);
});
