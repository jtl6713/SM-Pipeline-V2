import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const overview = fs.readFileSync(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const worker = readStudioWorkerSource();

test("All Profiles overview uses one lean /api/profiles/overview call", () => {
  assert.match(overview, /\/api\/profiles\/overview/);
  assert.doesNotMatch(overview, /\/api\/dashboard\?profile=/);
  assert.doesNotMatch(overview, /mapPool\(profiles/);
  assert.match(overview, /POLL_MS = 5000/);
  assert.match(overview, /overviewViewActive/);
  assert.match(overview, /document\.hidden/);
  assert.match(overview, /\n  start\(\);/);
  assert.doesNotMatch(overview, /120000/);
  assert.doesNotMatch(overview, /timeout: 4500/);
  assert.doesNotMatch(overview, /setTimeout\(start, 3200\)/);
  assert.match(overview, /sessionStorage/);
  assert.match(overview, /localStorage/);
  assert.match(overview, /Showing last good overview/);
  assert.match(overview, /Automatic polling remains a read-only snapshot GET/);
  assert.match(overview, /\/api\/profiles\/overview\?_=/);
  assert.match(html, /all-profiles-overview-1007\.js\?v=/);
});

test("Worker exposes profilesOverview lean batch route", () => {
  assert.match(worker, /pathname === "\/api\/profiles\/overview"/);
  assert.match(worker, /async function profilesOverview/);
  assert.match(worker, /Skip produce-job hydration/);
  assert.match(worker, /studio_home_overview_lean_v1: true/);
  assert.match(worker, /studio_home_overview_cache_v1: true/);
  assert.match(worker, /studio_home_overview_soft_429_v1: true/);
  assert.match(worker, /buildStudioProfilesOverviewRows/);
  assert.match(worker, /STUDIO_PROFILES_OVERVIEW_CACHE_MS/);
  assert.match(worker, /STUDIO_PROFILES_OVERVIEW_SUPABASE_CACHE_MS = 10 \* 1000/);
  assert.match(worker, /STUDIO_PROFILES_OVERVIEW_IDEAS_REFRESH_MS = 15 \* 60 \* 1000/);
  assert.match(worker, /studio_home_overview_fast_poll_v1: true/);
  assert.match(worker, /Reuse last-good Ideas counts/);
  assert.match(worker, /must not block that output rebuild/);
  assert.match(worker, /refreshStudioProfilesOverviewIdeas/);
  assert.match(worker, /includeIdeas/);
  assert.match(worker, /studio\/state\/profiles-overview\.json/);
  assert.match(worker, /readStudioProfilesOverviewSnapshot/);
  assert.match(worker, /refreshStudioProfilesOverviewSnapshot/);
  assert.match(worker, /studio_home_overview_snapshot_v1: true/);
  assert.match(worker, /studio_home_overview_force_refresh_v1: true/);
  assert.match(worker, /respondProfilesOverviewSoft/);
  assert.match(worker, /Never HTTP 429 the home overview/);
});

test("All Profiles client soft-handles Airtable cooling without a red HTTP 429 banner", () => {
  assert.match(overview, /data\?\.cooling/);
  assert.match(overview, /waiting on Airtable/);
  assert.match(overview, /timeoutMs: 8000/);
  assert.match(overview, /isOverviewSoftFailure/);
  assert.match(overview, /never paint a red unavailable banner/i);
  assert.doesNotMatch(overview, /timeoutMs: 60000/);
  assert.doesNotMatch(overview, /could not load:/i);
});

test("Worker budgets overview Airtable work so home never waits 60s", () => {
  assert.match(worker, /studio_home_overview_budget_v1:\s*true/);
  assert.match(worker, /STUDIO_PROFILES_OVERVIEW_BUILD_BUDGET_MS/);
  assert.match(worker, /raceStudioOverviewBudget/);
  assert.match(worker, /0\.10\.657-stop-duplicate-purge/);
});
