import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFILES_OVERVIEW_REFRESH_STATE_KEY,
  claimProfilesOverviewRefresh,
  patchProfilesOverviewRefreshState,
  publicProfilesOverviewRefreshState,
  readProfilesOverviewRefreshStateRecord,
} from "./profiles-overview-refresh.mjs";

class FakeR2 {
  constructor() {
    this.objects = new Map();
    this.seq = 0;
  }
  async get(key) {
    const hit = this.objects.get(key);
    if (!hit) return null;
    return {
      etag: hit.etag,
      httpEtag: `"${hit.etag}"`,
      async json() { return JSON.parse(hit.value); },
    };
  }
  async put(key, value, options = {}) {
    const current = this.objects.get(key);
    const onlyIf = options.onlyIf;
    const ifMatch = onlyIf?.get?.("If-Match") || "";
    const ifNoneMatch = onlyIf?.get?.("If-None-Match") || "";
    if (ifNoneMatch === "*" && current) return null;
    if (ifMatch) {
      const normalized = ifMatch.replace(/^"|"$/g, "");
      if (!current || current.etag !== normalized) return null;
    }
    const etag = `etag-${++this.seq}`;
    this.objects.set(key, { value: String(value), etag });
    return { etag, httpEtag: `"${etag}"` };
  }
}

test("two concurrent manual refresh claims produce one durable winner", async () => {
  const env = { STUDIO_MEDIA: new FakeR2() };
  const now = Date.parse("2026-10-17T13:00:00Z");
  const [a, b] = await Promise.all([
    claimProfilesOverviewRefresh(env, { now, baselineSnapshotAt: now - 30_000, baselineGeneration: "old" }),
    claimProfilesOverviewRefresh(env, { now, baselineSnapshotAt: now - 30_000, baselineGeneration: "old" }),
  ]);
  assert.equal([a, b].filter((row) => row.claimed).length, 1);
  assert.equal([a, b].filter((row) => row.reason === "in_progress").length, 1);
  const stored = await readProfilesOverviewRefreshStateRecord(env);
  assert.equal(stored.state.status, "refreshing");
  assert.ok(stored.state.operation_id);
  assert.equal(stored.state.baseline_generation, "old");
});

test("completion creates a short server-side cooldown without losing completed metadata", async () => {
  const env = { STUDIO_MEDIA: new FakeR2() };
  const now = Date.parse("2026-10-17T13:00:00Z");
  const claimed = await claimProfilesOverviewRefresh(env, { now });
  const op = claimed.state.operation_id;
  const patched = await patchProfilesOverviewRefreshState(env, op, {
    status: "completed",
    started_at: new Date(now).toISOString(),
    completed_at: new Date(now + 4_000).toISOString(),
    snapshot_at: now + 4_000,
    snapshot_generation: "force-generation",
    ideas_at: now + 3_500,
    component_status: { outputs: "completed", ideas: "completed" },
  }, { now: now + 4_000 });
  assert.equal(patched.updated, true);
  assert.equal(patched.state.status, "completed");

  const second = await claimProfilesOverviewRefresh(env, { now: now + 5_000 });
  assert.equal(second.claimed, false);
  assert.equal(second.reason, "cooldown");
  assert.equal(second.state.status, "cooling_down");
  assert.equal(second.state.snapshot_generation, "force-generation");
  assert.ok(second.state.cooldown_remaining_ms > 0);
});

test("stale refreshing state can be reclaimed after a terminated Worker", async () => {
  const env = { STUDIO_MEDIA: new FakeR2() };
  const now = Date.parse("2026-10-17T13:00:00Z");
  const first = await claimProfilesOverviewRefresh(env, { now, staleMs: 10_000 });
  assert.equal(first.claimed, true);
  const second = await claimProfilesOverviewRefresh(env, { now: now + 11_000, staleMs: 10_000, cooldownMs: 0 });
  assert.equal(second.claimed, true);
  assert.notEqual(second.state.operation_id, first.state.operation_id);
});

test("public state turns an abandoned active operation into a safe failure view", () => {
  const requested = Date.parse("2026-10-17T13:00:00Z");
  const view = publicProfilesOverviewRefreshState({
    status: "refreshing",
    operation_id: "op-1",
    requested_at: new Date(requested).toISOString(),
  }, requested + 121_000);
  assert.equal(view.status, "failed");
  assert.equal(view.stale_operation, true);
  assert.match(view.error, /previous complete snapshot/i);
});

test("refresh state uses only the dedicated R2 key", async () => {
  const bucket = new FakeR2();
  const env = { STUDIO_MEDIA: bucket };
  await claimProfilesOverviewRefresh(env, { now: Date.parse("2026-10-17T13:00:00Z") });
  assert.deepEqual([...bucket.objects.keys()], [PROFILES_OVERVIEW_REFRESH_STATE_KEY]);
});
