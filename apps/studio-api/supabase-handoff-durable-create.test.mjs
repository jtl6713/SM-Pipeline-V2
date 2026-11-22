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
  // Legacy Airtable preference flags cannot override canonical Supabase routing.
  assert.equal(studioLegacyExportEnabled({ ...supabase, STUDIO_WRITE_SOURCE: "airtable" }, CONTENT_ITEMS_TABLE_ID), true);
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
  // The retired Worker rejects ALL uncommitted Supabase CRUD operations.
  // The old narrower Airtable soft-echo branch no longer exists.
  assert.match(handler, /supabase_only_crud_uncommitted/);
  assert.match(handler, /Canonical Supabase write uncommitted; no legacy archive fallback/);
  assert.match(handler, /throw new HttpError\(\s*503,/);
  assert.doesNotMatch(handler, /await airtableRequestSlot\(/);
  assert.doesNotMatch(handler, /body = \{ records: \[\] \}/);
  assert.doesNotMatch(handler, /deleted: true/);
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

test("Museum Mile normal I4 create persists typed Content Item -> Production Request owner", async()=>{
 const originalFetch=globalThis.fetch;
 const calls=[];
 const profileUuid="63c2e81b-0cd1-423d-a033-11366e69bdee";
 const requestUuid="baf09caf-f1cc-4771-a6ac-c1794e871645";
 globalThis.fetch=async(url,init={})=>{
  const parsed=new URL(url);
  const method=String(init.method||"GET").toUpperCase();
  calls.push({path:parsed.pathname,method,body:init.body?JSON.parse(init.body):null});
  const data=parsed.pathname.endsWith("/content_profiles")?[{id:profileUuid}]:
   parsed.pathname.endsWith("/production_requests")?[{id:requestUuid}]:[];
  return new Response(JSON.stringify(data),{status:method==="POST"?201:200,headers:{"Content-Type":"application/json"}});
 };
 try{
  const result=await studioSupabaseCommitOutputContentFirst(supabase, CONTENT_ITEMS_TABLE_ID,[{
   id:"recJS9V7be7OpQ9zD",
   fields:{Content_Title:"Museum Mile In One Day",Content_Status:"Idea Approved",
    Production_Request:["recbx2NNJZTvoZr8u"],Content_Profile:["recgtK8Z7eNADNtVy"]},
  }],{create:true});
  assert.equal(result.ok,true);
  const inserted=calls.filter(c=>c.path.endsWith("/content_items")&&c.method==="POST");
  assert.equal(inserted.length,1,"one original Content Item insert");
  assert.equal(inserted[0].body[0].airtable_record_id,"recJS9V7be7OpQ9zD");
  assert.equal(inserted[0].body[0].production_request_id,requestUuid);
  assert.equal(inserted[0].body[0].content_profile_id,profileUuid);
 }finally{globalThis.fetch=originalFetch;}
});

test("I4 Content create refuses a linked Production Request that does not exist",async()=>{
 const originalFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,init={})=>{
  const method=String(init.method||"GET").toUpperCase();
  calls.push(method);
  return new Response("[]",{status:method==="POST"?201:200,headers:{"Content-Type":"application/json"}});
 };
 try{
  await assert.rejects(
   studioSupabaseCommitOutputContentFirst(supabase,CONTENT_ITEMS_TABLE_ID,[{
    id:"recJS9V7be7OpQ9zD",fields:{Content_Title:"Museum Mile In One Day",
     Production_Request:["recbx2NNJZTvoZr8u"]},
   }],{create:true}),
   /Production_Request owner cannot be resolved/
  );
  assert.ok(!calls.includes("POST"),"unresolved owner never receives orphan INSERT");
 }finally{globalThis.fetch=originalFetch;}
});
