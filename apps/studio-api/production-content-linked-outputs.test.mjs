import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { missingLinkedOutputIdsForContentRows } from "./supabase-pipeline-reads.mjs";

const id = (digits) => "rec" + String(digits).padStart(14, "0");

test("published outputs omitted by the 200-recent/1000-open windows are hydrated", () => {
  const contentRows = [
    { airtable_record_id: id(1), extras: { "Platform Outputs": [id(101), id(102), id(103)] } },
    { airtable_record_id: id(2), extras: { "Platform Outputs": [id(201), id(202)] } },
  ];
  const packed = [
    { airtable_record_id: id(101) },
    { airtable_record_id: id(201) },
  ];
  assert.deepEqual(
    missingLinkedOutputIdsForContentRows(contentRows, packed),
    [id(102), id(103), id(202)],
  );
});

test("mixed-status content only fetches missing siblings and deduplicates requests", () => {
  const contentRows = [
    { extras: { "Platform Outputs": [id(3), id(4), id(4)] } },
    { extras: { "Platform Outputs": [id(4), id(5)] } },
    { extras: { "Platform Outputs": [] } },
  ];
  assert.deepEqual(
    missingLinkedOutputIdsForContentRows(contentRows, [{ airtable_record_id: id(3) }]),
    [id(4), id(5)],
  );
});

test("incomplete or corrupt link bags cannot trigger unscoped Supabase reads", () => {
  assert.deepEqual(
    missingLinkedOutputIdsForContentRows([
      null, {}, { extras: {} },
      { extras: { "Platform Outputs": [null, {}, "", "bad", id(7), { id: id(8) }] } },
    ], [{ airtable_record_id: id(7) }]),
    [id(8)],
  );
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  assert.match(source, /missingLinkedOutputIdsForContentRows\(\[\.\.\.byId\.values\(\)\], \[\.\.\.outputById\.values\(\)\]\)/);
  assert.match(source, /platform_outputs\?content_profile_id=eq\.\$\{profileId\}&airtable_record_id=in\./);
});

test("Supabase Production read elevates old and undated active outputs ahead of open-window cutoff", () => {
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const contentFn = source.slice(source.indexOf("export async function listSupabaseContentItems("), source.indexOf("export async function listSupabaseOverviewPack("));
  assert.match(contentFn, /activeProductionOutputs/);
  assert.match(contentFn, /output_status=in\.\(In%20Production/);
  assert.match(contentFn, /\.\.\.\(openOutputs \|\| \[\]\), \.\.\.activeProductionOutputs/);
  assert.match(contentFn, /\.\.\.\(recentOutputs \|\| \[\]\), \.\.\.\(openOutputs \|\| \[\]\), \.\.\.activeProductionOutputs/);
  assert.match(contentFn, /content_items\?or=/, "old parent is fetched by active output foreign key");
  assert.match(contentFn, /do_not_publish=eq\.false/, "prioritized query must exclude held outputs");
});

test("Supabase content route classifies Production by the same output predicate as Home and never falls back to Airtable", () => {
  const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const method = source.slice(source.indexOf("export async function listContent("), source.indexOf("export async function scheduleGridContentById("));
  assert.match(method, /homeOutputInProduction\(mapped\)/);
  assert.match(method, /production_active_output_count:/);
  assert.match(method, /if \(f\(output, "Test_Run_ID"\)\) continue/);
  assert.match(method, /refusing Airtable fallback/);
  assert.match(method, /throw error/);
});

test("LA review-status outputs needing render survive all recent windows and hydrate old parents", async () => {
  const { listSupabaseContentItems } = await import('./supabase-pipeline-reads.mjs');
  const profile = { id: 'profile-la', airtable_record_id: id(90) };
  const parents = [1, 2].map(n => ({
    airtable_record_id: id(n), content_title: `LA piece ${n}`,
    created_at: null, content_profiles: profile, extras: {},
  }));
  const outputs = parents.map((parent, index) => ({
    airtable_record_id: id(101 + index), output_number: null,
    output_status: 'Ready for Review', review_status: 'Review Sent',
    render_status: index ? 'Waiting in Render Queue' : 'Ready for Render',
    do_not_publish: false, content_items: parent, content_profiles: profile,
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(input);
    assert.equal(url.hostname, 'example.supabase.co', 'Supabase reads only');
    let rows = [];
    if (url.pathname.endsWith('/content_profiles')) rows = [profile];
    else if (url.pathname.endsWith('/platform_outputs')) {
      const statuses = url.searchParams.get('output_status') || '';
      if (statuses.startsWith('in.') && statuses.includes('Ready for Review')) rows = outputs;
    } else if (url.pathname.endsWith('/content_items') && url.searchParams.has('or')) rows = parents;
    return { ok: true, text: async () => JSON.stringify(rows) };
  };
  try {
    const pack = await listSupabaseContentItems({
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
    }, { profileAirtableId: profile.airtable_record_id });
    assert.deepEqual(pack.records.map(r => r.id).sort(), parents.map(r => r.airtable_record_id).sort());
    assert.deepEqual(pack.outputs.map(r => r.id).sort(), outputs.map(r => r.airtable_record_id).sort());
  } finally { globalThis.fetch = originalFetch; }
});
