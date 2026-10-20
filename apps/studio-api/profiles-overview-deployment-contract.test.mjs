import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerDeploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");
const pagesDeploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-cloudflare-pages-production.yml"), "utf8");

test("Worker production deploy performs authenticated force-refresh acceptance", () => {
  assert.match(workerDeploy, /overview-refresh/);
  assert.match(workerDeploy, /overview-status/);
  assert.match(workerDeploy, /Verify authoritative All Profiles force refresh through service binding/);
  assert.match(workerDeploy, /component_status\.outputs=="completed"/);
  assert.match(workerDeploy, /component_status\.ideas=="completed"/);
  assert.match(workerDeploy, /snapshot_generation/);
  assert.match(workerDeploy, /test "\$SNAPSHOT_AT" -gt "\$BEFORE_AT"/);
  assert.match(workerDeploy, /overview_force_refresh_production=PASS/);
  assert.match(workerDeploy, /Roll back to captured production version on any failure/);
});

test("Worker production deploy preserves and verifies Cloudflare bindings", () => {
  assert.match(workerDeploy, /Capture production rollback point and exact binding contract/);
  assert.match(workerDeploy, /postdeploy_binding_contract=PASS/);
  assert.match(workerDeploy, /active_source_byte_match/);
  assert.match(workerDeploy, /studio_home_overview_force_refresh_v1/);
});

test("Pages production deploy verifies the exact force-refresh asset on custom domain", () => {
  assert.match(pagesDeploy, /EXPECTED_OVERVIEW_URL/);
  assert.match(pagesDeploy, /all-profiles-overview-1007/);
  assert.match(pagesDeploy, /custom-overview\.js/);
  assert.match(pagesDeploy, /\/api\/profiles\/overview\/refresh/);
  assert.match(pagesDeploy, /min_generation=/);
  assert.match(pagesDeploy, /Updated just now/);
  assert.match(pagesDeploy, /custom-domain Home overview cache-busted asset/);
});

test("Home expired Airtable tally is rebuilt rather than being stale forever", () => {
  const worker = fs.readFileSync(path.join(root, "apps/studio-api/worker.js"), "utf8");
  const functions = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
  assert.match(worker, /STUDIO_PROFILES_OVERVIEW_CACHE_MS = 2 \* 60 \* 1000/);
  const view = functions.slice(functions.indexOf("export async function profilesOverview("),
    functions.indexOf("/*__STUDIO_WORKER_END:profilesOverview__*/"));
  assert.match(view, /!manualRefreshing && !supabaseBacked && !cooling/);
  assert.match(view, /scheduleStudioProfilesOverviewRefresh\(ctx, env, authorization\)/);
  assert.match(view, /if \(snapshot\?\.rows\?\.length\)/);
});
