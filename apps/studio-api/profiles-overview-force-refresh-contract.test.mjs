import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();
const functions04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");

test("force refresh routes pass the Phase 2A gate and existing Studio write security", () => {
  assert.match(worker, /isProfilesOverviewRefreshRoute = url\.pathname === "\/api\/profiles\/overview\/refresh"/);
  assert.match(worker, /isProfilesOverviewRefreshStatusRoute = url\.pathname === "\/api\/profiles\/overview\/refresh-status"/);
  assert.match(worker, /isProfilesOverviewRefreshWrite = isProfilesOverviewRefreshRoute && request\.method === "POST"/);
  const gate = worker.slice(worker.indexOf("const allowedMethod ="), worker.indexOf('if (url.pathname === "/api/hooks/r5-done")'));
  assert.match(gate, /isProfilesOverviewRefreshWrite/);
  const route = worker.slice(worker.indexOf("if (isProfilesOverviewRefreshRoute)"), worker.indexOf('if (url.pathname === "/api/dashboard")'));
  assert.match(route, /assertWriteRequest\(request, env\)/);
  assert.match(route, /requireAnyPermission/);
  assert.match(route, /startProfilesOverviewForceRefresh/);
  assert.match(route, /getProfilesOverviewRefreshStatus/);
});

test("manual refresh bypasses normal snapshot TTL and refreshes Ideas too", () => {
  const start = functions04.indexOf("export async function runStudioProfilesOverviewForceRefresh");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:runStudioProfilesOverviewForceRefresh__*/", start);
  const force = functions04.slice(start, end);
  assert.match(force, /buildStudioProfilesOverviewRows\(env, profiles, \{ forceIdeas: true, commitIdeas: false \}\)/);
  assert.doesNotMatch(force, /studioProfilesOverviewFreshMs/);
  assert.match(functions04, /usedSupabaseOutputs && forceIdeas/);
  assert.match(functions04, /AIRTABLE_IDEA_TABLE_ID/);
});

test("forced result is complete, durable, generation-verified and last-good safe", () => {
  assert.match(functions04, /validateStudioProfilesOverviewRows/);
  assert.match(functions04, /durableRequired: true/);
  assert.match(functions04, /verifyStudioProfilesOverviewSnapshot\(env, generation\)/);
  assert.match(functions04, /Forced overview refresh did not publish a newer verified snapshot/);
  assert.match(functions04, /Profiles overview outputs exceeded complete-scan safety ceiling/);
  assert.match(functions04, /Profiles overview ideas exceeded complete-scan safety ceiling/);
  assert.match(functions04, /preserveRowIdeas: true/);
});

test("scheduled overview stays on the canonical platform-dispatch eligibility function", () => {
  assert.match(functions04, /studioOverviewScheduledCounts\(mappedOutputs\)[\s\S]*countPendingPlatformDispatch\(mappedOutputs\)/);
});

test("normal overview polling retains TTL-backed snapshot behavior", () => {
  const start = functions04.indexOf("export async function profilesOverview(");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:profilesOverview__*/", start);
  const normal = functions04.slice(start, end);
  assert.match(normal, /age < freshMs/);
  assert.match(normal, /scheduleStudioProfilesOverviewRefresh/);
  assert.match(normal, /manualRefreshing/);
  assert.match(worker, /studio_home_overview_force_refresh_v1: true/);
});

test("overview response exposes source snapshot age and generation metadata", () => {
  assert.match(functions04, /snapshot_at: Number\(meta\.at \|\| 0\) \|\| null/);
  assert.match(functions04, /snapshot_generation: meta\.generation \|\| null/);
  assert.match(functions04, /ideas_at: Number\(meta\.ideasAt \|\| 0\) \|\| null/);
});

test("completed manual generation can force a durable R2 reread across Worker isolates", () => {
  assert.match(functions04, /minGeneration = String\(url\.searchParams\.get\("min_generation"\) \|\| ""\)/);
  assert.match(functions04, /readStudioProfilesOverviewSnapshot\(env, \{ minGeneration \}\)/);
  assert.match(functions04, /options\.forceDurable === true/);
  assert.match(functions04, /cacheGeneration !== expectedGeneration/);
  assert.match(functions04, /readStudioProfilesOverviewSnapshot\(env, \{ forceDurable: true \}\)/);
});
