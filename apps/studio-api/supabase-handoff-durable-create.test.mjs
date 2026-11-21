import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTENT_ITEMS_TABLE_ID,
  PLATFORM_OUTPUTS_TABLE_ID,
  studioLegacyExportEnabled,
  studioSupabaseCommitOutputContentFirst,
  airtableShapedProOutputFromSupabase,
} from "./supabase-pipeline-reads.mjs";

const supabase = {
  STUDIO_WRITE_SOURCE: "supabase",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-key-only",
};

test("canonical content/output IDs commit to Supabase when archived Airtable bindings are absent", () => {
  for (const table of [CONTENT_ITEMS_TABLE_ID, PLATFORM_OUTPUTS_TABLE_ID,
    "Content Items", "Platform Outputs"]) {
    assert.equal(studioLegacyExportEnabled(supabase, table), true, table);
  }
  assert.equal(studioLegacyExportEnabled(supabase, "unknown"), false);
  assert.equal(studioLegacyExportEnabled({ ...supabase, STUDIO_WRITE_SOURCE: "airtable" }, CONTENT_ITEMS_TABLE_ID), false);
});

test("canonical Content Items create writes a real Supabase row rather than returning a skipped echo", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "example.supabase.co");
    calls.push({ path: parsed.pathname, method: init.method || "GET" });
    return new Response("[]", {
      status: String(init.method || "GET").toUpperCase() === "POST" ? 201 : 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await studioSupabaseCommitOutputContentFirst(supabase, CONTENT_ITEMS_TABLE_ID, [{
      id: "rec1234567890ABCD",
      fields: { Content_Title: "NYC handoff test", Content_Status: "Idea Approved" },
    }], { create: true });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "content");
    assert.ok(calls.some((call) => call.path.endsWith("/content_items") && call.method === "POST"),
      "the canonical path must perform a durable content_items insert");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase-only Worker refuses an unsaved Output/Content mutation instead of a fake successful POST", () => {
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const start = worker.indexOf("async function airtableFetch(");
  const end = worker.indexOf("const AIRTABLE_BATCH_LIMIT", start);
  assert.ok(start > 0 && end > start);
  const handler = worker.slice(start, end);
  assert.match(handler, /studioAirtableOutputOrContentTable\(env, tableId\)/);
  assert.match(handler, /supabase output\/content mutation did not commit/);
  assert.match(handler, /throw new HttpError\(\s*503,/);
});


test("Supabase PRO typed FKs signal actual existing fanout and protect onlyMissing retries", () => {
  const row=airtableShapedProOutputFromSupabase({
    airtable_record_id:"recPRO00000000001",platform:"Instagram",output_type:"Carousel",
    enabled:true,platform_output_id:"0f35a7c4-b5c7-4f11-8e35-8a55e2d8c220",
    content_item_id:"e3df7977-bb7a-4780-86d1-97fa9bfe7449",
  });
  assert.equal(row.fields.Platform_Output_Exists,true);
  assert.equal(row.fields.Content_Item_Exists,true);
  assert.equal(airtableShapedProOutputFromSupabase({
    airtable_record_id:"recPRO00000000002",enabled:true,platform_output_id:null,
  }).fields.Platform_Output_Exists,false);
  const source=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  assert.match(source,/!Boolean\(f\(row, "Platform_Output_Exists"\)\)/);
});

test("I4 Supabase PRO write-through resolves both FKs and verifies exact platform owner before linking", () => {
  const source=readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
  const start=source.indexOf("async function commitProOutputRecords(");
  const end=source.indexOf("/** Commit idea, settings, or slide writes.",start);
  assert.ok(start>0 && end>start);
  const body=source.slice(start,end);
  assert.match(body,/resolveSupabaseLinkedId\(env, "platform_outputs"/);
  assert.match(body,/resolveSupabaseLinkedId\(env, "content_items"/);
  assert.match(body,/output\.error_messages\?\.Production_Request_Output/);
  assert.match(body,/production_request_outputs\?airtable_record_id=eq/);
  assert.match(body,/owner\/plan mismatch/);
});

test("promoted PR writes original Content Item typed FK and fails if identity is missing",()=>{
  const source=readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
  const start=source.indexOf("export async function syncAirtableProductionRequestRowToSupabase(");
  const end=source.indexOf("export async function ",start+15);
  const block=source.slice(start,end<0?undefined:end);
  assert.match(block,/if \("Promoted_Content_Item" in fields\)/);
  assert.match(block,/row\.promoted_content_item_id = originalId/);
  assert.match(block,/resolveSupabaseLinkedId\(env, "content_items", originalId\)/);
  assert.match(block,/promoted Content Item is missing in authoritative Supabase/);
});
