import test from "node:test";
import assert from "node:assert/strict";
import {composeRenderingReviewEnrollmentOperations as compose}
  from "./rendering-review-enrollment-wiring.mjs";
import {enrollManualReviewCommand} from "./rendering-review-coordinator.mjs";
import {REVIEW_PILOT,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {RENDER_REVIEW_TABLES} from "./rendering-review-airtable.mjs";

const outputId="recA1B2C3D4E5F6G7";
const itemId="recC1B2C3D4E5F6G7";
const sessionId="session-12345678";
const attemptId="attempt-00000001";
const requestId="request-00000001";
const fields={
  RENDERING_REVIEW_ENROLL_WRITES_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
};
const clone=x=>JSON.parse(JSON.stringify(x));
const args={output_id:outputId,session_id:sessionId,original_attempt_id:attemptId,
  idempotency_key:requestId,policy:{...REVIEW_PILOT,enabled:true}};
function fixture({enabled=true,laneEnabled=true,otherProfile=false}={}){
  const env={
    ...fields,AIRTABLE_OUTPUT_TABLE_ID:"tblrlPeboBthkplH0",
    STUDIO_MEDIA:{},STUDIO_SCHEDULE_RESERVATIONS:{},
    STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED:laneEnabled?"true":"false",
    STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST:CHICAGO_PROFILE_ID+"::instagram",
  };
  if(!enabled)delete env.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED;
  const output={id:outputId,fields:{
    Content_Item:[itemId],Content_Profile:["Untrusted display lookup"],
    Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
    Render_Status:"Rendered",Final_File_ID:"drive-file-12345678",
    Output_Status:"Approved for Publishing",Publish_Status:"Ready to Schedule",
    Review_Status:"Approved",Do_Not_Publish:false,
    Scheduled_Post_Date:"2026-12-16T17:30:00.000Z",
  }};
  const item={id:itemId,fields:{
    Content_Profile:[otherProfile?"recZ1B2C3D4E5F6G7":CHICAGO_PROFILE_ID],
  }};
  let stored=null,writeCount=0,mirrorCount=0,scheduleCount=0;
  const calls=[];
  const airtableFetch=async(_env,table,id,options)=>{
    calls.push("read:"+table);
    if(table==="tblwzN9AXWvmKVKPs"){
      assert.equal(id,itemId);
      return clone(item);
    }
    if(table===env.AIRTABLE_OUTPUT_TABLE_ID){
      assert.equal(id,outputId);
      if(options?.method==="PATCH"){
        calls.push("write:hold");
        Object.assign(output.fields,JSON.parse(options.body).fields);
        writeCount++;
      }
      return clone(output);
    }
    if(table===RENDER_REVIEW_TABLES.sessions){
      if(options?.method==="POST"){
        assert.equal(stored,null);
        stored={id:"recS1E2S3S4I5O6N7",fields:JSON.parse(options.body).fields};
        calls.push("write:session");
        writeCount++;
        return clone(stored);
      }
    }
    throw Error("Unmocked Airtable transport");
  };
  const listRecords=async(_env,table,opts)=>{
    assert.equal(table,RENDER_REVIEW_TABLES.sessions);
    assert.ok(opts.filterFormula.includes(outputId));
    return stored?[clone(stored)]:[];
  };
  const postCommit=async ({output:row})=>{
    assert.equal(row.id,outputId);
    mirrorCount++;calls.push("mirror");
  };
  const scheduleTransaction=async(_env,info,callbacks)=>{
    assert.equal(info.platform_output_record_id,outputId);
    assert.equal(info.content_profile_id,CHICAGO_PROFILE_ID);
    scheduleCount++;calls.push("atomic-lane");
    const plan=await callbacks.plan();
    assert.equal(plan.action,"vacate");
    assert.equal(plan.previousIso,"2026-12-16T17:30:00.000Z");
    calls.push("lane-write");
    await callbacks.write(plan,{signal:new AbortController().signal});
    assert.equal(await callbacks.verify(),"");
    await callbacks.afterCommit();
    return {atomic_schedule:true};
  };
  const operations=compose({
    env,airtableFetch,listRecords,readField:(r,key)=>r?.fields?.[key],
    withOutputApprovalLock:async(_bucket,id,fn)=>{
      assert.equal(id,outputId);calls.push("acquire-output-lock");
      try{return await fn();}finally{calls.push("release-output-lock");}
    },
    authorizeReview:async()=>true,authorizeEvent:async()=>true,
    writeVacateUnderLane:async({output_id,fields:patch,review_hold_id,review_owner})=>{
      assert.equal(output_id,outputId);
      assert.equal(output.fields.Studio_Render_Review_Hold_ID,review_hold_id);
      assert.equal(output.fields.Studio_Render_Review_Hold_Owner,review_owner);
      assert.equal(output.fields.Do_Not_Publish,true);
      Object.assign(output.fields,patch);
      writeCount++;calls.push("write:schedule");
    },
    postCommit,scheduleTransaction,holdIdFactory:()=>"rrhold-00000001",
  });
  return {output,item,env,operations,calls,
    get writes(){return writeCount},get mirror(){return mirrorCount},
    get schedules(){return scheduleCount},get stored(){return stored}};
}
const reject=(f,code)=>assert.rejects(f,e=>e.code===code);

test("with protected flags missing, composed adapters do no writes or lane acquisition",async()=>{
  const f=fixture({enabled:false});
  await reject(()=>enrollManualReviewCommand({...args,operations:f.operations}),"PILOT_WRITE_DISABLED");
  assert.equal(f.writes,0);assert.equal(f.schedules,0);assert.equal(f.mirror,0);
});
test("with atomic Chicago lane unavailable, preflight denies before creating hold",async()=>{
  const f=fixture({laneEnabled:false});
  await reject(()=>enrollManualReviewCommand({...args,operations:f.operations}),"SCHEDULE_REVOCATION_UNAVAILABLE");
  assert.equal(f.writes,0);assert.equal(f.schedules,0);assert.equal(f.stored,null);
});
test("composed hold-first enrollment vacates exact schedule through MAE lane and persists one session",async()=>{
  const f=fixture();
  const outcome=await enrollManualReviewCommand({...args,operations:f.operations});
  assert.equal(outcome.replay,false);
  assert.equal(f.writes,3);
  assert.equal(f.schedules,1);
  assert.equal(f.mirror,1);
  assert.equal(f.output.fields.Scheduled_Post_Date,null);
  assert.equal(f.output.fields.Review_Status,"Review Sent");
  assert.equal(f.output.fields.Output_Status,"Ready for Review");
  assert.equal(f.output.fields.Publish_Status,"Not Ready");
  assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
  assert.equal(f.output.fields.Do_Not_Publish,true);
  assert.equal(f.stored.fields.Row_Version,1);
  const order=key=>f.calls.indexOf(key);
  assert.ok(order("acquire-output-lock")<order("write:hold"));
  assert.ok(order("write:hold")<order("atomic-lane"));
  assert.ok(order("atomic-lane")<order("write:schedule"));
  assert.ok(order("write:schedule")<order("write:session"));
  assert.ok(order("write:session")<order("release-output-lock"));
  const replay=await enrollManualReviewCommand({...args,operations:f.operations});
  assert.equal(replay.replay,true);
  assert.equal(f.writes,3);assert.equal(f.schedules,1);
});
test("source Content Item profile mismatch denies before any hold or vacate",async()=>{
  const f=fixture({otherProfile:true});
  await reject(()=>enrollManualReviewCommand({...args,operations:f.operations}),"OUTSIDE_PILOT_SCOPE");
  assert.equal(f.writes,0);assert.equal(f.schedules,0);
});
test("created Instagram container denies preflight before any writes",async()=>{
  const f=fixture();
  f.output.fields.Platform_Media_ID="ig-existing-container-123";
  await reject(()=>enrollManualReviewCommand({...args,operations:f.operations}),"DISPATCH_ALREADY_STARTED");
  assert.equal(f.writes,0);assert.equal(f.schedules,0);
});
test("missing mandatory trusted schedule or mirror callback is rejected during composition",()=>{
  assert.throws(()=>compose({env:{AIRTABLE_OUTPUT_TABLE_ID:"output"}}),
    e=>e.code==="REVIEW_INTEGRATION_MISSING");
});
