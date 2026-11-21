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
  ".github/workflows/diagnose-post-insights-profiles.yml",
  ".github/workflows/prove-ap0-failure-preservation.yml",
  ".github/workflows/prove-ap0-revision-restage-v2.yml",
  ".github/workflows/prove-ap0-revision-restage-v3.yml",
  ".github/workflows/prove-ap0-revision-restage-v4.yml",
  ".github/workflows/prove-item11-youtube-oauth.yml",
  ".github/workflows/prove-item12-r2-lifecycle.yml",
  ".github/workflows/prove-item14-instagram-carousel.yml",
  ".github/workflows/prove-item16-tiktok-draft.yml",
  ".github/workflows/prove-item19-webhook-map.yml",
  ".github/workflows/prove-item21-change-control.yml",
  ".github/workflows/prove-item9-native-covers.yml",
  ".github/workflows/qa-ap1c-7856-7043-stage-restart.yml",
  ".github/workflows/repair-make-admin-module19-v2.yml",
  ".github/workflows/cloudflare-secret-recovery-readonly.yml",
  ".github/workflows/credential-presence-audit.yml",
  ".github/workflows/i1-durable-runner-enable.yml",
  ".github/workflows/put-studio-api-assets-read.yml",
  ".github/workflows/put-studio-api-auth-read.yml",
  ".github/workflows/put-studio-api-b3-factory-ops-read.yml",
  ".github/workflows/put-studio-api-home-read.yml",
  ".github/workflows/put-studio-api-music-read.yml",
  ".github/workflows/repair-secret-presence-check.yml",
  ".github/workflows/trim-engagement-history.yml",
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
  const contract = readFileSync(
    new URL("../../repair/scripts/studio_api_binding_contract.py", import.meta.url), "utf8");
  assert.match(contract, /"SUPABASE_URL": "plain_text"/);
  assert.match(contract, /"SUPABASE_SERVICE_ROLE_KEY": "secret_text"/);
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

test("post-insights diagnostics retain a safe Supabase/public-health successor", () => {
  const health = readFileSync(
    new URL("../../.github/workflows/post-insights-public-health.yml", import.meta.url), "utf8");
  const regression = readFileSync(
    new URL("./post-insights-supabase-regression.test.mjs", import.meta.url), "utf8");
  assert.match(health, /scripts\/post-insights-public-health\.py/);
  assert.match(health, /workflow_dispatch/);
  assert.doesNotMatch(health, /AIRTABLE_PAT|credential-envelope|api\.airtable\.com/);
  assert.match(regression, /Supabase/);
});
