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
