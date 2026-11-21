import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// This scans repository *source text*, not user-supplied URL origins.
// Conservatively reject the retired hostname even when prefixed/suffixed by
// another host string; do not mistake substring checks for URL validation.
const retiredAirtableHost = /api\.airtable\.com/i;

test("active Worker and Durable Object contain no Airtable HTTP endpoint", () => {
  for (const path of [
    "apps/studio-api/worker.js",
    "apps/studio-api/profile-summary-do.mjs",
    "services/pipeline-runner/airtable/client.py",
  ]) {
    assert.doesNotMatch(source(path), retiredAirtableHost, path);
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
    assert.doesNotMatch(source(path), retiredAirtableHost, path);
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

test("Issue 2374 independent production deploy requires Supabase identity and a QA source audit", () => {
  const flow=source(".github/workflows/deploy-issue2374-supabase-only-factory-worker.yml");
  assert.ok(flow.includes("vars.STUDIO_PRODUCTION_SUPABASE_PROJECT_REF"));
  assert.ok(flow.includes("approved_ref != 'vkwvscgisqsbuwagdvtb'"));
  assert.ok(flow.includes("plain_vars.get('SUPABASE_URL','').rstrip('/')"));
  assert.ok(flow.includes("python repair/scripts/qa_retirement_preflight.py"));
  assert.ok(flow.includes("'secrets':{'required':['SUPABASE_SERVICE_ROLE_KEY']}"));
  assert.doesNotMatch(flow, /AIRTABLE_PAT|AIRTABLE_BASE_ID/);
  const staticGate=flow.indexOf("python repair/scripts/qa_retirement_preflight.py");
  const identityGate=flow.indexOf("Factory deploy denied: protected production project identity missing");
  const deploy=flow.indexOf("wrangler deploy --config wrangler.jsonc >/tmp/wrangler-deploy.log");
  assert.ok(staticGate>=0&&identityGate>staticGate&&deploy>identityGate,
    "QA source audit and Supabase identity must execute before issue2374 deploy");
  assert.ok(!flow.includes("STUDIO_QA_SUPABASE_LEDGER_VERIFIED"));
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
    assert.doesNotMatch(flow, retiredAirtableHost, path);
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


test("legacy migration probe cannot approve Airtable as the primary read source", () => {
  const workflow = source(".github/workflows/supabase-migration-gate-readonly.yml");
  assert.ok(workflow.includes("AIRTABLE_RETIREMENT_PRIMARY_READ_GATE="));
  assert.ok(workflow.includes("studio_primary_read_source=supabase"));
  assert.ok(workflow.includes('sync.get("read_source") == "supabase"'));
  assert.ok(!workflow.includes('"studio_read_source=airtable"'));
});

test("production media preflight is SELECT-only and retains duplicate and ACL checks", () => {
  const sql = source("docs/supabase-migration/phase7/media_atomic_upsert_readonly_preflight.sql");
  const statements = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(statements, /\b(?:create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/i);
  for (const key of ["duplicate_native_groups", "duplicate_drive_groups",
    "anon_can_execute_media_rpc", "service_role_can_execute_media_rpc",
    "media_rpc_security_invoker", "scoped_native_unique_index_exists"]) {
    assert.ok(sql.includes(key), key);
  }
});

test("production audit can be statically checked in PR without exposing live secrets", () => {
  const workflow = source(".github/workflows/verify-supabase-production-readonly.yml");
  assert.ok(workflow.includes("github.event_name == 'pull_request'"));
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(workflow.includes("refs/heads/main"));
  assert.ok(workflow.includes("STUDIO_AUDIT_MODE"));
  assert.ok(workflow.includes("UNVERIFIED_DISCOVERY_ONLY"));
  assert.ok(workflow.includes("production_supabase_identity_audit_test.py"));
});


test("production release rejects Airtable-dependent QA code without obsolete migration approval", () => {
  const workflow=source(".github/workflows/deploy-cloudflare-worker-production.yml");
  const gate=workflow.indexOf("python repair/scripts/qa_retirement_preflight.py");
  const mutation=workflow.indexOf("Capture production rollback point and exact binding contract");
  assert.ok(gate!==-1 && mutation!==-1 && gate<mutation,
    "QA source gate must execute before production mutation");
  assert.ok(!workflow.includes("STUDIO_QA_SUPABASE_LEDGER_VERIFIED"));
  assert.ok(workflow.includes('.writeAuthority=="Supabase"'));
  assert.ok(!workflow.includes('.writeAuthority=="Airtable"'));
});

test("Cloudflare audit saves sanitized binding evidence before allowlist enforcement", () => {
  const audit=source(".github/workflows/cloudflare-production-bindings-audit.yml");
  const save=audit.indexOf("bindings-audit-discovery.json");
  const policy=audit.indexOf("contract=assert_live_contract(got, 'active production Worker')");
  assert.ok(save!==-1 && policy>save);
  assert.ok(audit.includes("from production_supabase_identity_audit import inspect_studio_bindings"));
  assert.ok(audit.includes("if: always()"));
  assert.ok(audit.includes('"credential_values_collected":False'));
});
