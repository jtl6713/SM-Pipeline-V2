import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// These obsolete entrypoints could restart an Airtable-era deployment,
// install an Airtable PAT binding, or flip the Worker/runner back to mixed SoR.
// They must not be restored to obtain a green regression or emergency rollout.
const retired = [
  ".github/workflows/factory-live-airtable-staging.yml",
  "apps/studio-api/run-factory-staging-http.sh",
  "wrangler.factory-staging.jsonc",
  ".github/workflows/apply-studio-deploy-live-binding-contract.yml",
  "repair/tools/patch_studio_deploy_live_binding_contract.py",
  ".github/workflows/cloudflare-production-rollback-v86.yml",
  ".github/workflows/cloudflare-production-stage-safety.yml",
  ".github/workflows/cloudflare-prune-bad-studio-versions.yml",
  ".github/workflows/deploy-studio-api-lease-table-id-repair.yml",
  ".github/workflows/enable-runner-supabase-reads.yml",
  ".github/workflows/enable-studio-phase6-write-source.yml",
  ".github/workflows/enable-studio-write-sor.yml",
  ".github/workflows/apply-repair-lease-table-id.yml",
  "repair/tools/patch_repair_lease_table_id.py",
];

test("legacy Airtable-era deployment and config entrypoints remain retired", () => {
  for (const filename of retired) {
    assert.equal(existsSync(new URL(`../../${filename}`, import.meta.url)), false, filename);
  }
});

test("supported Studio Worker release still requires Supabase and rollback", () => {
  const deploy = readFileSync(
    new URL("../../.github/workflows/deploy-cloudflare-worker-production.yml", import.meta.url), "utf8");
  assert.match(deploy, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(deploy, /SUPABASE_URL/);
  assert.doesNotMatch(deploy, /'secrets':\{'required':\['AIRTABLE_PAT'/);
  assert.match(deploy, /rollback/i);
});

test("Factory HTTP check is hermetic and does not claim deployed staging acceptance", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/factory-batch-http-staging.yml", import.meta.url), "utf8");
  assert.match(workflow, /factory-submit-http-boundary\.test\.mjs/);
  assert.match(workflow, /DEPLOYED_STAGING_HTTP=NOT_TESTED/);
  assert.match(workflow, /LIVE_ZERO_AIRTABLE_EGRESS=NOT_VERIFIED/);
  assert.doesNotMatch(workflow, /STAGING_AIRTABLE_API_TOKEN/);
});
