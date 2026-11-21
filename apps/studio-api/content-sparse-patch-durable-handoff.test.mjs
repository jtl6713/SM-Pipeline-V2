import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mergePresentContentBagFields,
  syncAirtableContentRowToSupabase,
} from "./supabase-pipeline-reads.mjs";

const recordId="recBiDsEj1JVat2pR";
const originalId="7a7c5420-eac7-400b-878e-b39d8c871ec7";
const env={
  SUPABASE_URL:"https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:"test-only",
};
const originalExtras=()=>({
  Source_Candidate:["recOriginal0000001"],
  Production_Request:["recOriginal0000002"],
  Content_Themes:["NYC history","photography"],
  Studio_Creative_Masters_JSON:'{"assets":[1,2]}',
  _studio_recovery:{reason:"original exact recovered content"},
});

test("Content sparse extras merge preserves original idea/photo/runner provenance and clears only explicit nulls",()=>{
  const original=originalExtras();
  const merged=mergePresentContentBagFields(original,{
    Production_Request:["recNewOwner000001"],
    Production_Request_Directives_JSON:'{"mode":"exact"}',
    Include_Thumbnail:"Yes",
    Internal_Notes:null,
    Content_Title:"must remain typed",
    _studio_recovery:{reason:"must not overwrite recovery provenance"},
  });
  assert.deepEqual(merged.Production_Request,["recNewOwner000001"]);
  assert.deepEqual(merged.Source_Candidate,original.Source_Candidate);
  assert.deepEqual(merged.Content_Themes,original.Content_Themes);
  assert.equal(merged.Studio_Creative_Masters_JSON,original.Studio_Creative_Masters_JSON);
  assert.deepEqual(merged._studio_recovery,original._studio_recovery);
  assert.equal(merged.Include_Thumbnail,"Yes");
  assert.equal(merged.Production_Request_Directives_JSON,'{"mode":"exact"}');
  assert.equal(Object.hasOwn(merged,"Content_Title"),false);
  assert.notEqual(merged,original);
});

test("previously skipped Content directives-only PATCH persists same canonical row and keeps original extras",async()=>{
  const saved=originalExtras();
  const fetchBefore=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(url,opts={})=>{
    const path=new URL(url);
    assert.equal(path.pathname,"/rest/v1/content_items");
    const method=String(opts.method||"GET").toUpperCase();
    requests.push({method,path:path.search,body:opts.body?JSON.parse(opts.body):null});
    if(method==="GET"){
      if(path.searchParams.get("select")==="id,extras")
        return Response.json([{id:originalId,extras:saved}]);
      if(path.searchParams.get("select")==="airtable_record_id,extras")
        return Response.json([{airtable_record_id:recordId,extras:saved}]);
      throw Error("Unexpected GET "+path.search);
    }
    if(method==="PATCH"){
      assert.equal(opts.headers.Prefer,"return=representation");
      assert.equal(path.searchParams.get("select"),"id");
      const patch=JSON.parse(opts.body);
      assert.equal(Object.hasOwn(patch,"content_title"),false,"sparse PATCH must not zero typed title");
      assert.equal(Object.hasOwn(patch,"content_status"),false,"sparse PATCH must not zero typed status");
      assert.equal(Object.hasOwn(patch,"content_profile_id"),false,"sparse PATCH must not erase profile");
      assert.deepEqual(patch.extras.Source_Candidate,originalExtras().Source_Candidate);
      assert.deepEqual(patch.extras._studio_recovery,originalExtras()._studio_recovery);
      Object.assign(saved,patch.extras);
      return Response.json([{id:originalId}]);
    }
    throw Error("Unexpected method "+method);
  };
  try{
    const out=await syncAirtableContentRowToSupabase(env,{
      id:recordId,
      fields:{
        Production_Request:["recNewOwner000001"],
        Production_Request_Directives_JSON:'{"schema":"studio.directives.1"}',
        Requested_Caption_Mode:"AI decides",
        Include_Background_Music:"No",
      }
    });
    assert.equal(out.ok,true);
    assert.equal(out.mode,"patch");
    assert.equal(requests.filter(x=>x.method==="PATCH").length,1);
    assert.equal(saved.Production_Request_Directives_JSON,'{"schema":"studio.directives.1"}');
    assert.deepEqual(saved.Source_Candidate,originalExtras().Source_Candidate);
  }finally{globalThis.fetch=fetchBefore;}
});

test("Content PATCH cannot succeed when original canonical row is missing",async()=>{
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=async()=>Response.json([]);
  try{
    await assert.rejects(
      syncAirtableContentRowToSupabase(env,{
        id:recordId,fields:{Production_Request_Directives_JSON:'{"schema":"missing"}'}
      }),
      /identity missing or ambiguous/,
    );
  }finally{globalThis.fetch=fetchBefore;}
});

test("NYC recovery retries old R2 receipts only after confirmed sparse PATCH failure",()=>{
  const source=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const start=source.indexOf("export async function studioNyc20261121HandoffCron(");
  const stop=source.indexOf("/*__STUDIO_WORKER_END:studioNyc20261121HandoffCron__*/",start);
  assert.ok(start>0 && stop>start);
  const body=source.slice(start,stop);
  assert.match(body,/sparse-patch-v2/);
  assert.match(body,/previous_failure_not_content_sparse_patch/);
  assert.match(body,/previous_outcome_not_retryable/);
  assert.match(body,/failed_no_auto_retry/);
  assert.match(body,/previous\?\.error/);
  assert.match(body,/if \(await env\.STUDIO_MEDIA\.get\(receiptKey\)\)/);
  assert.ok(body.indexOf("sparse-patch-v2")<body.indexOf("finalizeProductionRequestPromotion("));
  assert.match(body,/existing_platform_outputs_need_reconcile/);
  assert.doesNotMatch(body,/publishPlatform|publishNow|schedulePlatform/i);
});
