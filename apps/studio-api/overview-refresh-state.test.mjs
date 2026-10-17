import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERVIEW_REFRESH_COOLDOWN_MS,
  OVERVIEW_REFRESH_STALE_MS,
  normalizeOverviewRefreshState,
  overviewRefreshIsActive,
  overviewRefreshIsStale,
  overviewRefreshCooldownRemainingMs,
  nextOverviewSnapshotGeneration,
  publicOverviewRefreshState,
  overviewRefreshFailureComponent,
} from "./overview-refresh-state.mjs";

test("refresh state distinguishes active, stale and cooldown windows", () => {
  const now = Date.parse("2026-10-17T13:00:00Z");
  const state = normalizeOverviewRefreshState({
    status: "refreshing",
    updated_at: new Date(now - 5000).toISOString(),
  });
  assert.equal(overviewRefreshIsActive(state, now), true);
  assert.equal(overviewRefreshIsStale(state, now), false);
  assert.equal(overviewRefreshIsActive({ ...state, updated_at: new Date(now - OVERVIEW_REFRESH_STALE_MS - 1).toISOString() }, now), false);
  assert.equal(overviewRefreshCooldownRemainingMs({ cooldown_until: new Date(now + OVERVIEW_REFRESH_COOLDOWN_MS).toISOString() }, now), OVERVIEW_REFRESH_COOLDOWN_MS);
});

test("snapshot generation is monotonic across rapid refreshes", () => {
  assert.equal(nextOverviewSnapshotGeneration("1000", 900), "1001");
  assert.equal(nextOverviewSnapshotGeneration("1000", 2000), "2000");
});

test("public state exposes safe snapshot metadata and derives stale failure", () => {
  const now = Date.parse("2026-10-17T13:00:00Z");
  const publicState = publicOverviewRefreshState({
    status: "refreshing",
    updated_at: new Date(now - OVERVIEW_REFRESH_STALE_MS - 1).toISOString(),
    operation_id: "private-op",
  }, {
    at: now - 20000,
    generation: "123",
    readSource: "supabase",
    ideasAt: now - 20000,
  }, now);
  assert.equal(publicState.status, "failed");
  assert.equal(publicState.snapshot_generation, "123");
  assert.equal(publicState.operation_id, undefined);
  assert.match(publicState.reason, /did not complete/);
});

test("failure classification identifies incomplete ideas without exposing internals", () => {
  assert.equal(overviewRefreshFailureComponent(new Error("Profiles overview ideas exceeded complete-scan safety ceiling")), "ideas");
  assert.equal(overviewRefreshFailureComponent(new Error("snapshot durable write failed")), "snapshot");
});
