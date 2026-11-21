import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const backend=readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
const list=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
const web=readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");

const start=backend.indexOf("export async function listSupabaseIdeasForProfile(");
const end=backend.indexOf("\nfunction ideaListReadError(",start);
assert.ok(start>=0 && end>start);
const implementation=backend.slice(start,end).replace(/^export /,"");
const makeList=({page})=>new Function(
 "resolveSupabaseProfileId","supabaseRest","airtableShapedIdeaFromSupabase","ideaListReadError",
 implementation+"\nreturn listSupabaseIdeasForProfile;"
)(
 async()=> "00000000-0000-4000-8000-000000000001",
 async(_env,url)=>{
  assert.match(url,/content_profile_id=eq\./);
  assert.match(url,/or=\(status\.is\.null,status\.neq\.Promoted\)/);
  const offset=Number(url.match(/&offset=(\d+)/)?.[1]||0);
  return page(offset);
 },
 row=>({
   id:row.airtable_record_id,
   fields:{
     Candidate_Status:row.status,
     Promoted_Content_Record_ID:row.payload?.Promoted_Content_Record_ID || null,
     "Content Items":row.payload?.["Content Items"]||[],
   },
 }),
 message=>new Error(String(message))
);

const candidate=(n,linked=false)=>({
 airtable_record_id:"rec"+String(n).padStart(14,"A"),
 status:linked?"Approved":"Generated",
 payload:linked?{Promoted_Content_Record_ID:"recExistingProduction"}:{},
});

test("fetches beyond the first 100 unpromoted-status but linked promoted rows",async()=>{
 const rows=Array.from({length:102},(_,i)=>candidate(i,true)).concat([candidate(102),candidate(103)]);
 let calls=0;
 const fn=makeList({page:offset=>{calls++;return rows.slice(offset,offset+100);}});
 const results=await fn({},"recProfile123456",100,{unpromotedOnly:true});
 assert.equal(calls,2);
 assert.equal(results.length,2);
 assert.deepEqual(results.map(x=>x.id),[candidate(102).airtable_record_id,candidate(103).airtable_record_id]);
});
test("does not silently fall back to 100 latest promoted records",()=>{
 const start=list.indexOf("export async function listIdeas(");
 const end=list.indexOf("/*__STUDIO_WORKER_END:listIdeas__*/",start);
 const code=list.slice(start,end);
 assert.match(code,/unpromotedOnly = url\.searchParams\.get\("unpromoted"\) === "1"/);
 assert.match(code,/unpromoted-v1/);
 assert.match(code,/buildIdeasListPayload\(env, profile, limit, \{ unpromotedOnly \}\)/);
 const webStart=web.indexOf("async function loadIdeas() {");
 const webEnd=web.indexOf("function productionPageActive()",webStart);
 assert.match(web.slice(webStart,webEnd),/\/api\/ideas\?limit=100&unpromoted=1&fresh=1/);
});
test("failing an incomplete scan prevents a misleading empty Ideas list",async()=>{
 const fn=makeList({page:()=>null});
 await assert.rejects(()=>fn({},"recProfile123456",100,{unpromotedOnly:true}),/Incomplete unpromoted ideas scan/);
});
