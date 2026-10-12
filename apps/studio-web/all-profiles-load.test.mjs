import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const overview = fs.readFileSync(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(here, "../studio-api/worker.js"), "utf8");

test("All Profiles overview uses one lean /api/profiles/overview call", () => {
  assert.match(overview, /\/api\/profiles\/overview/);
  assert.doesNotMatch(overview, /\/api\/dashboard\?profile=/);
  assert.doesNotMatch(overview, /mapPool\(profiles/);
  assert.match(overview, /requestIdleCallback|setTimeout\(start/);
  assert.match(overview, /sessionStorage/);
  assert.match(overview, /localStorage/);
  assert.match(overview, /Showing last good overview/);
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
  assert.match(worker, /studio\/state\/profiles-overview\.json/);
  assert.match(worker, /readStudioProfilesOverviewSnapshot/);
  assert.match(worker, /refreshStudioProfilesOverviewSnapshot/);
  assert.match(worker, /studio_home_overview_snapshot_v1: true/);
  assert.match(worker, /respondProfilesOverviewSoft/);
  assert.match(worker, /Never HTTP 429 the home overview/);
});

test("All Profiles client soft-handles Airtable cooling without a red HTTP 429 banner", () => {
  assert.match(overview, /data\?\.cooling/);
  assert.match(overview, /waiting on Airtable/);
  assert.match(overview, /timeoutMs: 8000/);
  assert.match(overview, /isOverviewSoftFailure/);
  assert.match(overview, /never paint a red/i);
  assert.doesNotMatch(overview, /timeoutMs: 60000/);
  assert.doesNotMatch(overview, /could not load:/i);
});

test("Worker budgets overview Airtable work so home never waits 60s", () => {
  assert.match(worker, /studio_home_overview_budget_v1:\s*true/);
  assert.match(worker, /STUDIO_PROFILES_OVERVIEW_BUILD_BUDGET_MS/);
  assert.match(worker, /raceStudioOverviewBudget/);
  assert.match(worker, /0\.10\.559-open-index/);
});
