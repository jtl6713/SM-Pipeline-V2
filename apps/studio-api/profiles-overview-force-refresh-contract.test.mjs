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
  assert.match(worker, /isProfilesOverviewSummaryReconcileWrite/);
  const gate = worker.slice(worker.indexOf("const allowedMethod ="), worker.indexOf('if (url.pathname === "/api/hooks/r5-done")'));
  assert.match(gate, /isProfilesOverviewRefreshWrite/);
  assert.match(gate, /isProfilesOverviewSummaryReconcileWrite/);
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
  assert.match(force, /buildStudioProfilesOverviewRows\(env, profiles, \{ forceIdeas: true, commitIdeas: false, preferSupabase: true \}\)/);
  assert.doesNotMatch(force, /studioProfilesOverviewFreshMs/);
  assert.match(functions04, /includeIdeas: missingIdeaCounts/);
  assert.match(functions04, /supabaseIdeasUsable = missingIdeaCounts && pack\.ideas_incomplete !== true/);
  assert.match(functions04, /forceIdeas && !supabaseIdeasUsable/);
  assert.match(functions04, /listStudioOverviewUnpromotedIdeas/);
  assert.match(functions04, /AIRTABLE_IDEA_TABLE_ID/);
  assert.match(force, /compareHomeOverviewParity/);
  assert.match(force, /reconcileHomeOverviewWithAirtable/);
  assert.match(force, /forceAirtable: true/);
  assert.match(force, /home_parity/);
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

test("manual generation is fenced from pre-existing background rebuilds", () => {
  assert.match(functions04, /manualGenerationProtected/);
  assert.match(functions04, /refreshState\.status === "refreshing"/);
  assert.match(functions04, /refreshState\.status === "completed"[\s\S]*cooldown_remaining_ms/);
  assert.match(functions04, /readStudioProfilesOverviewSnapshotFromR2\(env\)/);
  assert.match(functions04, /trackedBuild = build\.finally/);
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


test("manual refresh cannot hang behind a slow background rebuild or Airtable cooldown when Supabase is active", () => {
  const start = functions04.indexOf("export async function runStudioProfilesOverviewForceRefresh");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:runStudioProfilesOverviewForceRefresh__*/", start);
  const force = functions04.slice(start, end);
  assert.match(force, /raceStudioOverviewBudget\(cache\.inflight, 250, "overview-existing-build"\)/);
  assert.match(force, /superseding slow background rebuild/);
  assert.match(force, /raceStudioOverviewBudget\(trackedBuild, 26_000, "overview-force-build"\)/);

  const routeStart = functions04.indexOf("export async function startProfilesOverviewForceRefresh");
  const routeEnd = functions04.indexOf("/*__STUDIO_WORKER_END:startProfilesOverviewForceRefresh__*/", routeStart);
  const route = functions04.slice(routeStart, routeEnd);
  assert.match(route, /!studioSupabaseConfigured\(env\).*coolMs > AIRTABLE_SLOT_FAIL_FAST_MS/s);
});


test("manual force refresh can prefer Supabase without changing the global Studio read-source flag", () => {
  const buildStart = functions04.indexOf("async function buildStudioProfilesOverviewRows");
  const buildEnd = functions04.indexOf("/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/", buildStart);
  const build = functions04.slice(buildStart, buildEnd);
  assert.match(build, /const preferSupabase = options\.preferSupabase === true && studioSupabaseConfigured\(env\)/);
  assert.match(build, /studioHomeReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(build, /studioReadSource\(env\) === "supabase" \|\| preferSupabase/);
});


test("Airtable force fallback interleaves lean output and idea scans instead of running full tables serially", () => {
  const start = functions04.indexOf("async function buildStudioProfilesOverviewRows");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/", start);
  const build = functions04.slice(start, end);
  assert.match(build, /const \[outputs, ideas\] = await Promise\.all\(\[/);
  assert.match(build, /fields: \["Content_Profile", "Promoted_Content_Record_ID", "Content Items", "Candidate_Status"\]/);
  assert.match(build, /if \(usedSupabaseOutputs\) \{[\s\S]*overlayLiveTikTokPublishRows/);
});

test("Home Supabase path counts Ideas from the open-idea filtered pack", () => {
  const start = functions04.indexOf("async function buildStudioProfilesOverviewRows");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/", start);
  const build = functions04.slice(start, end);
  assert.match(build, /includeIdeas: missingIdeaCounts/);
  assert.match(build, /supabaseIdeasUsable/);
  assert.match(build, /ideasSource = "supabase"/);
  assert.match(build, /forceIdeas && !supabaseIdeasUsable/);
  assert.match(build, /listStudioOverviewUnpromotedIdeas\(env, profileList/);
});


test("authoritative Airtable refresh filters terminal output history and promoted Ideas before pagination", () => {
  const start = functions04.indexOf("async function buildStudioProfilesOverviewRows");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/", start);
  const build = functions04.slice(start, end);
  assert.match(build, /profileOutputFormula = profileFormula[\s\S]*\{Output_Status\}!="Published"[\s\S]*\{Publish_Status\}!="Published"/);
  assert.match(functions04, /studioOverviewUnpromotedIdeaFormula/);
  assert.match(functions04, /\{Promoted_Content_Record_ID\}=BLANK\(\)/);
  assert.match(functions04, /\{Content Items\}=BLANK\(\)/);
  assert.match(functions04, /\{Candidate_Status\}!="Promoted"/);
  assert.match(build, /filterFormula: profileOutputFormula/);
  assert.match(build, /filterFormula: studioOverviewUnpromotedIdeaFormula\(profileFormula\)/);
});
