import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

// Test the actual extracted worker function under the live mixed authority flags
// without Airtable, Cloudflare, a media upload or publication.
const source=fs.readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
const begin=source.indexOf("export async function outputRowsForProductionRequest(");
const end=source.indexOf("/*__STUDIO_WORKER_END:outputRowsForProductionRequest__*/",begin);
assert.ok(begin>=0 && end>begin, "expected exact Worker function");

const requestId="rec0t4shEtd72MeD8";
const outputs=[
  ["Instagram","Reel"],["Instagram","Story"],
  ["Facebook","Reel"],["Facebook","Story"],["TikTok","Video Draft"],["YouTube","Short"]
].map(([platform,type],index)=>({id:"rec"+String(index).padStart(14,"0"),fields:{
  Platform:platform,Output_Type:type,Aspect_Ratio:"9:16",Enabled:true,Active:true,Output_Order:index+1
}}));

function harness({rows=outputs,writeSource="airtable",phase6Source="supabase"}={}){
  let airtableHits=0,supabaseHits=0;
  const context={
    studioWriteSource:()=>writeSource,studioPhase6WriteSource:()=>phase6Source,
    listSupabaseProductionRequestOutputs:async()=>{supabaseHits++;return rows;},
    airtableFetch:async()=>{airtableHits++;throw new Error("legacy archive forbidden");},
    listRecords:async()=>{airtableHits++;throw new Error("legacy archive forbidden");},
    listRecordsPage:async()=>{airtableHits++;throw new Error("legacy archive forbidden");},
    f:(row,key)=>row?.fields?.[key],
    arrayOrEmpty:(a)=>Array.isArray(a)?a:[],
    HttpError:class extends Error{constructor(status,message){super(message);this.status=status;}}
  };
  const fn=vm.runInNewContext("("+source.slice(begin,end).trim().replace(/^export /,"")+")",context);
  return {fn,stats:()=>({airtableHits,supabaseHits})};
}
test("live six-output Supabase PRO set is returned without legacy calls even when Output SoR flag differs",async()=>{
  const {fn,stats}=harness();
  const found=await fn({},requestId);
  assert.equal(found.length,6);
  assert.equal(found.filter(o=>o.fields.Aspect_Ratio==="9:16").length,6);
  assert.equal(stats().supabaseHits,1);
  assert.equal(stats().airtableHits,0);
});
test("a missing Supabase PRO list fails closed rather than scanning Airtable",async()=>{
  const {fn,stats}=harness({rows:null});
  await assert.rejects(()=>fn({},requestId),error=>error.status===503&&/Supabase/.test(error.message));
  assert.equal(stats().airtableHits,0);
});
test("only enabled outputs participate and no fallback is permitted if none are enabled",async()=>{
  const disabled=outputs.map((o,i)=>({...o,fields:{...o.fields,Enabled:i===0,Active:i===0}}));
  const {fn,stats}=harness({rows:disabled});
  assert.equal((await fn({},requestId)).length,1);
  assert.equal((await fn({},requestId,{includeInactive:true})).length,6);
  assert.equal(stats().airtableHits,0);
});
test("existing Airtable-authority branch remains available only when Phase6 is not Supabase",async()=>{
  const {fn,stats}=harness({rows:null,writeSource:"airtable",phase6Source:"airtable"});
  await assert.rejects(()=>fn({},requestId),/legacy archive forbidden/);
  assert.equal(stats().airtableHits>0,true);
});
