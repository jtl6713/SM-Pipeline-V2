import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeRenderingReviewOutboxAirtableOperations as make}
  from "./rendering-review-outbox-airtable.mjs";
import {RENDER_REVIEW_TABLES} from "./rendering-review-airtable.mjs";

const ID="recA1B2C3D4E5F6G7";
const SESSION="rrsession_12345678";
const CHICAGO="recT2rbKX3MF7cVFU";
const flags={
  RENDERING_REVIEW_ATTEMPT_COMMIT_ENABLED:"true",
  RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
  AIRTABLE_OUTPUT_TABLE_ID:"tblrlPeboBthkplH0",
  STUDIO_MEDIA:{},
};
function fixture(){
  const maps=new Map();
  for(const t of Object.values(RENDER_REVIEW_TABLES))maps.set(t,[]);
  maps.set(flags.AIRTABLE_OUTPUT_TABLE_ID,[]);
  maps.set("tblwzN9AXWvmKVKPs",[]);
  maps.get(RENDER_REVIEW_TABLES.sessions).push({
    id:"recS1E2S3S4I5O6N7",fields:{
      Session_ID:SESSION,Output_Record_ID:ID,Row_Version:3,
      Session_JSON:JSON.stringify({schema:"studio.render-review.1",
        id:SESSION,output_id:ID,profile_id:CHICAGO,output_type:"Instagram Reel",
        state:"plan_ready",version:3,review_hold:{active:true,
          id:"rrhold_12345678",owner:SESSION}}),
    },
  });
  maps.get(flags.AIRTABLE_OUTPUT_TABLE_ID).push({
    id:ID,fields:{Content_Item:["recC1O2N3T4E5N6T7"],Final_File_ID:"drive-master-123",
      Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
      Studio_Render_Review_Hold_Active:true,
      Studio_Render_Review_Hold_ID:"rrhold_12345678",
      Studio_Render_Review_Hold_Owner:SESSION,
      Do_Not_Publish:true},
  });
  maps.get("tblwzN9AXWvmKVKPs").push({
    id:"recC1O2N3T4E5N6T7",fields:{Content_Profile:[CHICAGO]},
  });
  let writes=0;
  const airtableFetch=async(_env,table,id,options={})=>{
    const rows=maps.get(table);
    if(!rows)throw Error("No mock table "+table);
    if(!options?.method)return structuredClone(rows.find(r=>r.id===id)||null);
    if(!["POST","PATCH"].includes(options.method))throw Error("Unsupported mutating verb");
    const body=JSON.parse(options.body);writes++;
    if(options.method==="POST"){
      const value={id:"rec"+String(writes).padStart(14,"0"),fields:structuredClone(body.fields)};
      rows.push(value);return structuredClone(value);
    }
    const existing=rows.find(r=>r.id===id);
    if(!existing)throw Error("Unknown record");
    Object.assign(existing.fields,body.fields);
    return structuredClone(existing);
  };
  const listRecords=async(_env,table,{filterFormula,fields,limit})=>{
    assert.ok(limit<=2);
    const m=/^\{([^}]+)\}="([^"]+)"$/.exec(filterFormula);
    if(!m)throw Error("Unexpected filter: "+filterFormula);
    return structuredClone((maps.get(table)||[]).filter(r=>r.fields[m[1]]===m[2]).slice(0,limit));
  };
  const operations=make({env:flags,airtableFetch,listRecords,
    readField:(r,k)=>r?.fields?.[k],
    withOutputApprovalLock:async(_bucket,_id,fn)=>fn(),
    authorizeReview:async()=>true,
  });
  return {operations,maps,get writes(){return writes}};
}
const manifest={
  output_id:ID,profile_id:CHICAGO,source_attempt_id:"original_12345678",
  source_drive_file_id:"drive-master-123",
  media_authority:"google_drive",
  creative:{acceptance_checks:["Precise narration"]},
  asset_manifest:[],
};
const plan={plan_id:"rrplan_12345678",session_id:SESSION,output_id:ID,
  plan_version:1,plan_hash:"a".repeat(64),
  source_attempt_id:"original_12345678",
  immutable_manifest:manifest};
const attempt={attempt_id:"rrattempt_12345678",session_id:SESSION,output_id:ID,
  attempt_number:2,parent_attempt_id:"original_12345678",
  plan_id:plan.plan_id,plan_version:1,job_id:"rrjob_12345678"};
const job={job_id:attempt.job_id,session_id:SESSION,output_id:ID,
  attempt_id:attempt.attempt_id,plan_id:plan.plan_id,
  plan_hash:plan.plan_hash,idempotency_key:"rrcommit_12345678",
  progress_stage:"awaiting_isolated_renderer"};
test("adapter disabled by default regardless of injected Airtable write methods",()=>{
  assert.throws(()=>make({env:{},airtableFetch:()=>{},listRecords:()=>{},
    readField:()=>{},withOutputApprovalLock:()=>{},authorizeReview:()=>{}}),
    e=>e.status===405);
});
test("project exact canonical Plan Attempt Job records with readback and idempotence",async()=>{
  const f=fixture();
  await f.operations.upsertPlanIfAbsent(plan);
  await f.operations.upsertAttemptIfAbsent(attempt);
  await f.operations.upsertJobIfAbsent(job);
  assert.equal(f.maps.get(RENDER_REVIEW_TABLES.plans).length,1);
  assert.equal(f.maps.get(RENDER_REVIEW_TABLES.attempts).length,1);
  assert.equal(f.maps.get(RENDER_REVIEW_TABLES.jobs).length,1);
  const [p,a,j]=await Promise.all([
    f.operations.readPlan(plan.plan_id),
    f.operations.readAttempt(attempt.attempt_id),
    f.operations.readJob(job.job_id),
  ]);
  assert.equal(p.plan_hash,plan.plan_hash);
  assert.equal(a.job_id,attempt.job_id);
  assert.equal(a.attempt_number,2);
  assert.equal(j.plan_hash,job.plan_hash);
  assert.equal(j.state,"queued");
  const writes=f.writes;
  await f.operations.upsertPlanIfAbsent(plan);
  await f.operations.upsertAttemptIfAbsent(attempt);
  await f.operations.upsertJobIfAbsent(job);
  assert.equal(f.writes,writes);
});
test("identity mismatch or immutable payload change fails instead of overwriting",async()=>{
  const f=fixture();
  await f.operations.upsertJobIfAbsent(job);
  await assert.rejects(()=>f.operations.upsertJobIfAbsent({...job,
    plan_hash:"b".repeat(64)}),e=>e.code==="OUTBOX_RECORD_CONFLICT");
  assert.equal(f.maps.get(RENDER_REVIEW_TABLES.jobs).length,1);
});
test("Worker route requires explicit render intent, reviewer and protected flags",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const start=worker.indexOf("const commitAttemptMatch = ");
  const end=worker.indexOf("const conversationMatch = ",start);
  assert.ok(start>0&&end>start);
  const section=worker.slice(start,end);
  for(const needle of ["renderAttemptCommitEnabled(env)","assertWriteRequest(request,env)",
    "reviewAuthorizedProfiles(env,authorization)","render_this_plan",
    "makeRenderingReviewOutboxAirtableOperations","commitReviewAttempt("])
    assert.ok(section.includes(needle),needle);
  assert.doesNotMatch(section,/graph\.publish|APPROVE_ATTEMPT|RELEASE_REVIEW_HOLD|scheduleTransaction/);
});
