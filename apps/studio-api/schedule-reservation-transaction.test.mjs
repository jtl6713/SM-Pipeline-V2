import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleReservationLane } from "./schedule-reservation-authority.mjs";
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) {
    const value = this.map.get(key);
    return value == null ? value : structuredClone(value);
  }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async transaction(fn) {
    const before = new Map([...this.map.entries()].map(([k,v]) => [k, structuredClone(v)]));
    try { return await fn(this); }
    catch (error) { this.map = before; throw error; }
  }
}

function makeEnv() {
  const state = { storage: new FakeStorage() };
  const lane = new ScheduleReservationLane(state, {});
  lane._now = () => Date.parse("2026-10-17T15:00:00.000Z");
  const namespace = {
    idFromName(name) { return name; },
    get() {
      return {
        fetch(request) { return lane.fetch(request); },
      };
    },
  };
  return {
    env: {
      STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED: "true",
      STUDIO_SCHEDULE_RESERVATIONS: namespace,
    },
    lane,
  };
}

const args = {
  content_profile_id: "recChicago",
  platform: "TikTok",
  output_type: "Video Draft",
  platform_output_record_id: "recOut1",
  owner_operation_id: "approve:recOut1",
};

test("atomic transaction releases only after authoritative verification and durable commit", async () => {
  const { env, lane } = makeEnv();
  const events = [];
  let authoritative = "";

  const result = await runAtomicScheduleTransaction(env, args, {
    plan: async ({ occupied_reservations }) => {
      events.push("plan");
      assert.deepEqual(occupied_reservations, []);
      return {
        action: "reserve",
        selectedIso: "2026-10-18T10:30:00.000Z",
        previousIso: "",
      };
    },
    write: async (plan) => {
      events.push("write");
      authoritative = plan.selectedIso;
      return { id: "recOut1" };
    },
    verify: async () => {
      events.push("verify");
      return authoritative;
    },
    afterCommit: async () => {
      events.push("afterCommit");
      const statusResponse = await lane.fetch(new Request("https://lane/status"));
      const status = await statusResponse.json();
      assert.equal(status.lock.state, "Released");
      assert.equal(status.recent_reservations.length, 1);
      assert.equal(status.recent_reservations[0].scheduled_iso, authoritative);
    },
  }, { jitter: false });

  assert.equal(result.atomic_schedule, true);
  assert.equal(result.released, true);
  assert.deepEqual(events, ["plan", "write", "verify", "afterCommit"]);
});

test("pre-write failure is retryable and does not quarantine the lane", async () => {
  const { env, lane } = makeEnv();
  await assert.rejects(
    runAtomicScheduleTransaction(env, args, {
      plan: async () => {
        throw new Error("capacity exhausted");
      },
      write: async () => { throw new Error("must not run"); },
      verify: async () => "",
    }, { jitter: false }),
    /capacity exhausted/,
  );

  const status = await (await lane.fetch(new Request("https://lane/status"))).json();
  assert.equal(status.quarantine, null);
  assert.equal(status.lock.state, "Released");
});

test("failure after external-write intent quarantines and prevents a second owner", async () => {
  const { env, lane } = makeEnv();

  await assert.rejects(
    runAtomicScheduleTransaction(env, args, {
      plan: async () => ({
        action: "reserve",
        selectedIso: "2026-10-18T10:30:00.000Z",
        previousIso: "",
      }),
      write: async () => {
        throw new Error("ambiguous Airtable timeout");
      },
      verify: async () => "",
    }, { jitter: false }),
    /ambiguous Airtable timeout/,
  );

  const status = await (await lane.fetch(new Request("https://lane/status"))).json();
  assert.equal(status.lock.state, "Recovery Required");
  assert.ok(status.quarantine);

  await assert.rejects(
    runAtomicScheduleTransaction(env, {
      ...args,
      platform_output_record_id: "recOut2",
      owner_operation_id: "approve:recOut2",
    }, {
      plan: async () => ({
        action: "reserve",
        selectedIso: "2026-10-18T17:30:00.000Z",
      }),
      write: async () => ({ id: "recOut2" }),
      verify: async () => "2026-10-18T17:30:00.000Z",
    }, { jitter: false, maxWaitMs: 0 }),
    /reconciliation|quarantined/i,
  );
});

test("flag off executes only the legacy callback", async () => {
  const calls = [];
  const value = await runAtomicScheduleTransaction(
    {},
    args,
    {
      legacy: async () => {
        calls.push("legacy");
        return { ok: true };
      },
      plan: async () => { calls.push("plan"); },
      write: async () => { calls.push("write"); },
      verify: async () => { calls.push("verify"); },
    },
  );
  assert.deepEqual(value, { ok: true });
  assert.deepEqual(calls, ["legacy"]);
});


test("write callback receives a bounded AbortSignal for the external commit window", async () => {
  const { env } = makeEnv();
  let authoritative = "";
  let seenSignal = null;
  let seenTimeout = null;
  const result = await runAtomicScheduleTransaction(env, {
    ...args,
    platform_output_record_id: "recAbortable",
    owner_operation_id: "approve:recAbortable",
  }, {
    plan: async () => ({
      action: "reserve",
      selectedIso: "2026-10-18T10:30:00.000Z",
      previousIso: "",
    }),
    write: async (plan, ctx) => {
      seenSignal = ctx.signal;
      seenTimeout = ctx.external_write_timeout_ms;
      authoritative = plan.selectedIso;
      return { id: "recAbortable" };
    },
    verify: async () => authoritative,
  }, { jitter: false });

  assert.equal(result.atomic_schedule, true);
  assert.ok(seenSignal instanceof AbortSignal);
  assert.equal(seenSignal.aborted, false);
  assert.equal(seenTimeout, 30_000);
});


test("ambiguous response after successful external write is reconciled without a second schedule write", async () => {
  const { env, lane } = makeEnv();
  const selected = "2026-10-18T10:30:00.000Z";
  let authoritative = "";
  let writes = 0;
  const opArgs = {
    ...args,
    platform_output_record_id: "recAmbiguousCommit",
    owner_operation_id: "approve:recAmbiguousCommit",
  };

  await assert.rejects(
    runAtomicScheduleTransaction(env, opArgs, {
      plan: async () => ({ action: "reserve", selectedIso: selected, previousIso: "" }),
      write: async () => {
        writes += 1;
        authoritative = selected;
        throw new Error("connection closed after Airtable accepted write");
      },
      verify: async () => authoritative,
    }, { jitter: false }),
    /connection closed/,
  );
  assert.equal(writes, 1);

  let status = await (await lane.fetch(new Request("https://lane/status"))).json();
  assert.equal(status.lock.state, "Recovery Required");
  const recoveryResponse = await lane.fetch(new Request("https://lane/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content_profile_id: "recChicago",
      platform: "TikTok",
      recovery_operation_id: "qa-recovery-ambiguous-commit",
      observation: "committed",
      authoritative_iso: authoritative,
    }),
  }));
  assert.equal(recoveryResponse.status, 200);
  const recovery = await recoveryResponse.json();
  assert.equal(recovery.committed, true);
  status = await (await lane.fetch(new Request("https://lane/status"))).json();
  assert.equal(status.quarantine, null);
  assert.equal(status.recent_reservations[0].scheduled_iso, selected);
  assert.equal(writes, 1);
});
