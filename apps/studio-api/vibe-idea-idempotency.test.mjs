import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {vibeIdeaIntakeIdentity,vibeIdeaIntakeMatches} from "./vibe-idea-idempotency.mjs";
const profile="recProfile0000001",org="recOrg00000000001",actor="recActor000000001";
const input={title:"Vibe",summary:"Original creative direction",primary_location:"Chicago"};
const context={token:"c8ee8d47-54f3-42be-ae0b-20722e6cf065",organizationId:org,actorId:actor,profileId:profile,input,aspect:"horizontal",width:1920,height:1080,seconds:45};
const profileUuid="fe0c439d-889b-44bf-91d3-ae62b3264714";
const fields={Candidate_Title:input.title,Idea_Summary:input.summary,Candidate_Status:"Generated",Content_Profile:[profile],Studio_Production_Mode:"automatic",Studio_Production_Source:"vibe_cut"};
function row(identity){return {airtable_record_id:identity.recordId,content_profile_id:profileUuid,production_mode:"automatic",production_source:"vibe_cut",payload:{...fields,Studio_Vibe_Intake_Receipt:identity.receipt}};}
test("token, actor, profile and creative intent bind replay without permitting another Idea for changed intent",async()=>{
 const a=await vibeIdeaIntakeIdentity(context),b=await vibeIdeaIntakeIdentity(context);
 assert.deepEqual(a,b);
 const changed=await vibeIdeaIntakeIdentity({...context,input:{...input,title:"Different"}});
 assert.equal(a.recordId,changed.recordId);assert.notEqual(a.receipt.fingerprint,changed.receipt.fingerprint);
 const differentActor=await vibeIdeaIntakeIdentity({...context,actorId:"recActor000000002"});
 assert.equal(a.recordId,differentActor.recordId);
 assert.equal(vibeIdeaIntakeMatches(row(a),a,profileUuid),true);
 assert.equal(vibeIdeaIntakeMatches(row(a),changed,profileUuid),false);
 assert.equal(vibeIdeaIntakeMatches(row(a),differentActor,profileUuid),false);
 assert.equal(vibeIdeaIntakeMatches({...row(a),production_mode:"manual"},a,profileUuid),false);
 assert.equal(vibeIdeaIntakeMatches(row(a),a,"other"),false);
 await assert.rejects(vibeIdeaIntakeIdentity({...context,aspect:"vertical"}));
 await assert.rejects(vibeIdeaIntakeIdentity({...context,token:"arbitrary"}));
});
const source=readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
const start=source.indexOf("export async function commitIdempotentVibeIdea(");
const end=source.indexOf("async function commitIdeaRecords(",start);
assert.ok(start>0&&end>start);
function writer(rest){
 return vm.runInNewContext(source.slice(start,end).replace("export async function","async function")+"\ncommitIdempotentVibeIdea",{
  studioWriteSource:()=>"supabase",ideaProductionModeSelect:()=>",production_mode,production_source",
  splitIdeaProductionCapture:(_env,f)=>({fields:{...f},typed:{production_mode:"automatic",production_source:"vibe_cut"}}),
  resolveSupabaseProfileId:async()=>profileUuid,supabaseRest:rest,vibeIdeaIntakeMatches,airtableShapedIdeaFromSupabase:x=>({id:x.airtable_record_id,fields:x.payload}),
 });
}
test("committed matching identity is returned without any write; collision and changed intent are rejected",async()=>{
 const a=await vibeIdeaIntakeIdentity(context),calls=[];
 const run=writer(async(_env,path,options)=>{calls.push({path,options});return [row(a)];});
 assert.equal((await run({},fields,a)).id,a.recordId);
 assert.equal(calls.length,1);assert.equal(calls[0].options,undefined);
 const changed=await vibeIdeaIntakeIdentity({...context,input:{...input,summary:"Other"}});
 await assert.rejects(run({},fields,changed));
 assert.ok(calls.every(c=>c.options===undefined));
});
test("new Vibe Idea uses one insert without merge-upsert and recovers a lost insert response via exact readback",async()=>{
 const a=await vibeIdeaIntakeIdentity(context),calls=[];
 const run=writer(async(_env,path,options)=>{
  calls.push({path,options});
  if(calls.length===1)return [];
  if(options)throw new Error("lost response");
  return [row(a)];
 });
 assert.equal((await run({},fields,a)).id,a.recordId);
 assert.equal(calls.length,3);
 assert.equal(calls[1].options.method,"POST");assert.equal(calls[1].options.headers.Prefer,"return=representation");
 assert.equal(calls[1].options.body[0].airtable_record_id,a.recordId);
 assert.equal(calls[1].options.body[0].content_profile_id,profileUuid);
 assert.equal(calls[1].options.body[0].payload.Studio_Vibe_Intake_Receipt.fingerprint,a.receipt.fingerprint);
 assert.ok(calls[0].path.includes(a.recordId)&&calls[2].path.includes(a.recordId));
});
