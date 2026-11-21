import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("active Worker and Durable Object contain no Airtable HTTP endpoint", () => {
  for (const path of [
    "apps/studio-api/worker.js",
    "apps/studio-api/profile-summary-do.mjs",
    "services/pipeline-runner/airtable/client.py",
  ]) {
    assert.equal(source(path).includes("https://api.airtable.com/"), false, path);
  }
});

test("Worker raises on missing Supabase CRUD instead of fabricating results", () => {
  const worker = source("apps/studio-api/worker.js");
  const gateway = worker.slice(
    worker.indexOf("async function airtableFetch("),
    worker.indexOf("  // Queue the summary change BEFORE optional Supabase mirror calls"),
  );
  assert.ok(gateway.includes("supabase_only_crud_uncommitted"));
  assert.ok(gateway.includes("throw new HttpError("));
  assert.ok(!gateway.includes("await airtableRequestSlot("));
  assert.ok(!gateway.includes("body = { records: [] }"));
  assert.ok(!gateway.includes("deleted: true"));
});

test("Worker Supabase deletes verify one returned row", () => {
  const adapter = source("apps/studio-api/supabase-pipeline-reads.mjs");
  assert.ok(adapter.includes("delete_not_confirmed"));
  assert.ok(adapter.includes("deleted.length !== 1"));
  assert.ok(adapter.includes('Prefer: "return=representation"'));
});

test("retired standalone scripts cannot request the Airtable API", () => {
  for (const path of [
    "scripts/backfill-airtable-closeout.py",
    "scripts/cleanup_studio_media_intake.py",
    "scripts/trim-engagement-history.py",
    "deploy/bootstrap-studio-insights-tables.py",
    "scripts/diagnose-post-insights-profiles.py",
  ]) {
    assert.ok(!source(path).includes("api.airtable.com"), path);
    assert.ok(source(path).includes("Retired: Supabase-native replacement required"), path);
  }
});

test("all Studio storage selectors ignore stale Airtable fallback flags", () => {
  const adapter = source("apps/studio-api/supabase-pipeline-reads.mjs");
  assert.ok(adapter.includes('return studioSupabaseConfigured(env) ? "supabase" : "unavailable";'));
  for (const name of [
    "studioReadSource",
    "studioPipelineReadSource",
    "studioContentReadSource",
    "studioFactoryOpsReadSource",
    "studioHomeReadSource",
    "studioMusicReadSource",
    "studioAssetsReadSource",
    "studioAuthReadSource",
    "studioWriteSource",
    "studioPhase6WriteSource",
  ]) {
    const at = adapter.indexOf("export function " + name + "(env)");
    assert.ok(at !== -1, name);
    const body = adapter.slice(at, adapter.indexOf("}", at) + 1);
    assert.ok(body.includes("studioOnlySupabaseSource(env)"), name);
    assert.ok(!body.includes('return "airtable"'), name);
  }
});

test("canonical Studio deployment uses Supabase credential contract", () => {
  const flow = source(".github/workflows/deploy-cloudflare-worker-production.yml");
  assert.ok(flow.includes("'secrets':{'required':['SUPABASE_SERVICE_ROLE_KEY']}"));
  assert.ok(flow.includes("wrangler deploy --config wrangler.jsonc --dry-run"));
  assert.ok(flow.includes("Automatic rollback") || flow.includes("rollback"));
  const contract = source("repair/scripts/studio_api_binding_contract.py");
  const core = contract.slice(contract.indexOf("CORE_BINDINGS = {"), contract.indexOf("RESERVATION_BINDINGS = {"));
  assert.ok(core.includes('"SUPABASE_SERVICE_ROLE_KEY": "secret_text"'));
  assert.ok(core.includes('"SUPABASE_URL": "plain_text"'));
  assert.ok(!core.includes('"AIRTABLE_PAT": "secret_text"'));
  for (const name of [
    "AIRTABLE_BASE_ID", "AIRTABLE_CONTENT_TABLE_ID", "AIRTABLE_IDEA_TABLE_ID",
    "AIRTABLE_MEDIA_TABLE_ID", "AIRTABLE_MUSIC_VIEW_ID", "AIRTABLE_OUTPUT_TABLE_ID",
  ]) {
    assert.ok(!core.includes(`"${name}": "plain_text"`), name);
  }
  assert.ok(flow.includes("STUDIO_PRODUCTION_SUPABASE_PROJECT_REF"));
  assert.ok(flow.includes("assert_production_supabase_target"));
});

test("tracked Airtable credential envelope cannot be restored accidentally", () => {
  for (const path of [
    ".github/workflows/airtable-secret-envelope-bootstrap.yml",
    "deploy/airtable-secret-envelope-bootstrap.txt",
    "deploy/credential-envelope/public.pem",
    "deploy/credential-envelope/private.pem.enc",
    "deploy/credential-envelope/airtable_pat.ciphertext.b64",
  ]) {
    assert.throws(() => source(path), /ENOENT/, path);
  }
});

test("replacement variant and LA TikTok deployments are manual and Airtable-free", () => {
  for (const [path, phrase] of [
    [".github/workflows/deploy-studio-variant-fill-crop-v2.yml", "DEPLOY-SUPABASE-VARIANT"],
    [".github/workflows/deploy-tiktok-auth-la-production.yml", "DEPLOY-LA-TIKTOK-AUTH"],
  ]) {
    const flow = source(path);
    assert.ok(flow.includes("workflow_dispatch"), path);
    assert.ok(flow.includes(phrase), path);
    assert.ok(flow.includes("refs/heads/main"), path);
    assert.ok(!flow.includes("api.airtable.com"), path);
    assert.ok(!flow.includes("AIRTABLE_PAT"), path);
    assert.ok(flow.toLowerCase().includes("rollback"), path);
  }
  const variant = source(".github/workflows/deploy-studio-variant-fill-crop-v2.yml");
  assert.ok(variant.includes("/rest/v1/engagement_settings"));
  const la = source(".github/workflows/deploy-tiktok-auth-la-production.yml");
  assert.ok(!la.includes("Rearm LA TikTok drafts"));
});

test("ElevenLabs maintenance is Supabase-first and never requires Airtable PAT", () => {
  for (const path of [
    ".github/workflows/install-studio-elevenlabs-video-reviewed-price.yml",
    ".github/workflows/put-studio-api-elevenlabs-secret.yml",
    ".github/workflows/put-studio-api-elevenlabs-video-secret.yml",
    ".github/workflows/verify-studio-elevenlabs-video-canary-preflight.yml",
  ]) {
    const workflow = source(path);
    assert.ok(workflow.includes("SUPABASE_URL"), path);
    assert.ok(workflow.includes("SUPABASE_SERVICE_ROLE_KEY"), path);
    assert.ok(!workflow.includes("AIRTABLE_PAT"), path);
  }
  const preflight = source(".github/workflows/verify-studio-elevenlabs-video-canary-preflight.yml");
  assert.ok(preflight.includes('payload.get("studio_write_source") == "supabase"'));
  assert.ok(!preflight.includes('in ("airtable", "supabase")'));
});
