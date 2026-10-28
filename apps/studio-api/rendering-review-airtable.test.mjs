import test from "node:test";
import assert from "node:assert/strict";
import {makeRenderingReviewAirtableOperations,RENDER_REVIEW_TABLES,RENDER_REVIEW_OUTPUT_FIELDS} from "./rendering-review-airtable.mjs";
import {enrollManualReviewCommand,mutateReviewSessionCommand} from "./rendering-review-coordinator.mjs";
import {CHICAGO_PROFILE_ID,REVIEW_PILOT} from "./rendering-review-policy.mjs";

const outputId="recA1B2C3D4E5F6G7";
const args={output_id:outputId,session_id:"session-12345678",
  original_attempt_id:"attempt-00000001",idempotency_key:"request-00000001",
  policy:{...REVIEW_PILOT,enabled:true}};
const clone=x=>JSON.parse(JSON.stringify(x));
const reject=(fn,code)=>assert.rejects(fn,e=>e.code===code);
function fake({mutationGate=false,scheduleRevocationReady=true}={}){
 const output={
  id:outputId,
  fields:{
   Content_Profile:["Chicago Shining Studio"],Content_Item:["recC1B2C3D4E5F6G7"],
   Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
   Output_Status:"Ready for Review",Review_Status:"Review Sent",
   Render_Status:"Rendered",Publish_Status:"Not Ready",
   Final_File_ID:"drive-original-12345",
   Final_File_URL:"https://drive.google.com/file/d/abcdefgh/view",
   Scheduled_Post_Date:null,Studio_Scheduled_At:null,Do_Not_Publish:false,
  },
 };
 const content={id:"recC1B2C3D4E5F6G7",fields:{Content_Profile:[CHICAGO_PROFILE_ID]}};
 let session=null, writes=0;
 const env={AIRTABLE_OUTPUT_TABLE_ID:"tblrlPeboBthkplH0",STUDIO_MEDIA:{}};
 const readField=(row,k)=>row?.fields?.[k];
 const airtableFetch=async (_env,table,id,opts={})=>{
  if(table==="tblwzN9AXWvmKVKPs")return clone(content);
  if(table===env.AIRTABLE_OUTPUT_TABLE_ID){
   if(id!==outputId)throw Error("wrong output ID");
   if(opts.method==="PATCH"){
     Object.assign(output.fields,JSON.parse(opts.body).fields);
     writes++;
   }
   return clone(output);
  }
  if(table===RENDER_REVIEW_TABLES.sessions){
   if(opts.method==="POST"){
     if(session)throw Error("duplicate create");
     session={id:"recS1E2S3S4I5O6N7",fields:JSON.parse(opts.body).fields};
     writes++;
     return clone(session);
   }
   if(opts.method==="PATCH"){
     if(session?.id!==id)throw Error("wrong session ID");
     Object.assign(session.fields,JSON.parse(opts.body).fields);
     writes++;
     return clone(session);
   }
  }
  throw Error("unsupported Airtable operation");
 };
 const listRecords=async (_env,table,options)=>{
  assert.equal(table,RENDER_REVIEW_TABLES.sessions);
  assert.ok(options.filterFormula.includes(outputId));
  return session?[clone(session)]:[];
 };
 const ops=makeRenderingReviewAirtableOperations({
  env,airtableFetch,listRecords,readField,
  withOutputApprovalLock:async (_bucket,id,fn)=>{
    assert.equal(id,outputId);return fn();
  },
  authorizeReview:async()=>true,
  authorizeEvent:async()=>true,
  scheduleRevocationReady:scheduleRevocationReady ? async descriptor=>{
    assert.equal(descriptor.output_id,outputId);
    assert.equal(descriptor.profile_id,CHICAGO_PROFILE_ID);
    return true;
  } : null,
  revokeScheduleUnderHold:async ({output_id,review_hold_id,review_owner})=>{
    assert.equal(output_id,outputId);
    assert.equal(output.fields.Studio_Render_Review_Hold_Active,true);
    assert.equal(output.fields.Studio_Render_Review_Hold_ID,review_hold_id);
    assert.equal(output.fields.Studio_Render_Review_Hold_Owner,review_owner);
    // Fake the existing scheduler's authorized hold-first revocation; this
    // is not a standalone production Airtable schedule writer.
    Object.assign(output.fields,{
      Scheduled_Post_Date:null,Studio_Scheduled_At:null,YouTube_Scheduled_Publish_At:null,
      Review_Status:"Review Sent",Output_Status:"Ready for Review",Publish_Status:"Not Ready",
    });
    writes++;
  },
  holdIdFactory:()=>"rrhold-00000001",
  mutationGate,
 });
 return {ops,output,content,get session(){return session},get writes(){return writes}};
}

test("real Airtable table IDs and dedicated fields are independent of other holds",()=>{
 assert.equal(Object.keys(RENDER_REVIEW_TABLES).length,6);
 assert.equal(RENDER_REVIEW_TABLES.sessions,"tblHX3UdoNszkoquG");
 assert.equal(RENDER_REVIEW_OUTPUT_FIELDS.hold_active,"Studio_Render_Review_Hold_Active");
 assert.notEqual(RENDER_REVIEW_OUTPUT_FIELDS.hold_active,"Do_Not_Publish");
});

test("read maps actual Platform Output schema to strict Chicago pilot identity",async()=>{
 const f=fake();
 const output=await f.ops.readOutput(outputId);
 assert.equal(output.profile_id,CHICAGO_PROFILE_ID);
 assert.equal(output.output_type,"Instagram Reel");
 assert.equal(output.platform,"Instagram");
 assert.equal(output.final_file_id,"drive-original-12345");
 assert.equal(f.writes,0);
});

test("storage mutators are locked off by default, independent of caller policy",async()=>{
 const f=fake();
 await reject(()=>enrollManualReviewCommand({...args,operations:f.ops}),"PILOT_WRITE_DISABLED");
 assert.equal(f.writes,0);
 assert.equal(f.session,null);
});

test("same authoritative base holds first, revokes schedule, then creates session",async()=>{
 const f=fake({mutationGate:true});
 f.output.fields.Scheduled_Post_Date="2026-11-01T15:30:00Z";
 f.output.fields.Review_Status="Approved";
 f.output.fields.Output_Status="Approved for Publishing";
 f.output.fields.Publish_Status="Ready to Schedule";
 f.output.fields.Do_Not_Publish=true; // unrelated pre-existing hold must remain
 const result=await enrollManualReviewCommand({...args,operations:f.ops});
 assert.equal(result.replay,false);
 assert.equal(f.writes,3);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Owner,args.session_id);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_ID,"rrhold-00000001");
 assert.equal(f.output.fields.Do_Not_Publish,true);
 assert.equal(f.output.fields.Scheduled_Post_Date,null);
 assert.equal(f.output.fields.Review_Status,"Review Sent");
 assert.equal(f.output.fields.Publish_Status,"Not Ready");
 assert.equal(f.session.fields.Session_ID,args.session_id);
 assert.equal(f.session.fields.Row_Version,1);
 assert.equal(JSON.parse(f.session.fields.Session_JSON).current_attempt_id,args.original_attempt_id);
});

test("server-generated message survives reload using versioned Airtable session record",async()=>{
 const f=fake({mutationGate:true});
 await enrollManualReviewCommand({...args,operations:f.ops});
 const result=await mutateReviewSessionCommand({output_id:outputId,operations:f.ops,
   event:{type:"MESSAGE",expected_version:1,idempotency_key:"request-00000002",
     fingerprint:"digest-00000002",message_id:"message-00000002",
     role:"user",content:"Keep the opener and add a practical route example."},
 });
 assert.equal(result.session.version,2);
 assert.equal(f.session.fields.Row_Version,2);
 assert.equal((await f.ops.readSession(outputId)).messages[0].content,
   "Keep the opener and add a practical route example.");
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
});

test("provider post receipt blocks admission even if status remains Ready for Review",async()=>{
 const f=fake({mutationGate:true});
 f.output.fields.Platform_Post_ID="ig-public-post-id";
 await reject(()=>enrollManualReviewCommand({...args,operations:f.ops}),"DISPATCH_ALREADY_STARTED");
 assert.equal(f.writes,0);
});

test("an existing Instagram media container blocks enrollment before a hold or schedule write",async()=>{
 for(const [field,value] of [
  ["Platform_Media_ID","existing-container-123"],
  ["Platform_Post_URL","https://instagram.com/reel/existing"],
  ["Publish_Locked_By","active-remote-publisher"],
 ]){
  const f=fake({mutationGate:true});
  f.output.fields[field]=value;
  const projected=await f.ops.readOutput(outputId);
  if(field==="Platform_Media_ID")assert.equal(projected.platform_media_id,value);
  await reject(()=>enrollManualReviewCommand({...args,operations:f.ops}),"DISPATCH_ALREADY_STARTED");
  assert.equal(f.writes,0);
  assert.equal(f.session,null);
 }
});

test("malformed session and duplicate Airtable sessions fail closed",async()=>{
 const f=fake({mutationGate:true});
 await enrollManualReviewCommand({...args,operations:f.ops});
 f.session.fields.Row_Version=999;
 await reject(()=>f.ops.readSession(outputId),"SESSION_IDENTITY_CONFLICT");
});

test("client cannot publish from storage adapter via a generic mutation",async()=>{
 const f=fake({mutationGate:true});
 await enrollManualReviewCommand({...args,operations:f.ops});
 await reject(()=>mutateReviewSessionCommand({output_id:outputId,operations:f.ops,
  event:{type:"RELEASE_REVIEW_HOLD",expected_version:1,idempotency_key:"request-00000003",
    fingerprint:"digest-00000003",scheduler_receipt_verified:true}}),"ORCHESTRATION_REQUIRED");
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
});

test("new review owns a separate hold and retains evidence of original legacy hold",async()=>{
 const f=fake({mutationGate:true});
 const session=(await enrollManualReviewCommand({...args,operations:f.ops})).session;
 assert.equal(session.original_do_not_publish,false);
 assert.equal(f.output.fields.Do_Not_Publish,true);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Owner,session.id);
});

test("lookup spoofing cannot override linked profile and ambiguous links fail closed",async()=>{
 const f=fake({mutationGate:true});
 f.output.fields.Content_Profile=[CHICAGO_PROFILE_ID];
 f.content.fields.Content_Profile=["recZ1B2C3D4E5F6G7"];
 assert.equal((await f.ops.readOutput(outputId)).profile_id,"recZ1B2C3D4E5F6G7");
 f.output.fields.Content_Item.push("recD1B2C3D4E5F6G7");
 await reject(()=>f.ops.readOutput(outputId),"CONTENT_IDENTITY_CONFLICT");
 assert.equal(f.writes,0);
});

test("retained review ownership cannot be overwritten when active checkbox is false",async()=>{
 for(const field of ["Studio_Render_Review_Hold_ID","Studio_Render_Review_Hold_Owner",
   "Studio_Render_Review_Session_ID","Studio_Review_Hold_ID","Studio_Review_Hold_Owner"]){
  const f=fake({mutationGate:true});
  f.output.fields[field]="prior-review-owner";
  await reject(()=>f.ops.claimHold({output_id:outputId,session_id:args.session_id}),"ALREADY_HELD");
  assert.equal(f.writes,0);
  assert.equal(f.output.fields[field],"prior-review-owner");
 }
});

test("durable session cannot change identity or skip a version under a current version check",async()=>{
 const f=fake({mutationGate:true});
 const {session}=await enrollManualReviewCommand({...args,operations:f.ops});
 const before=f.writes;
 for(const patch of [{id:"replacement-session"},{version:4},{profile_id:"recZ1B2C3D4E5F6G7"},
   {review_hold:{...session.review_hold,id:"replacement-hold"}}]){
  await reject(()=>f.ops.saveSessionIfVersion({output_id:outputId,expected_version:1,
    next:{...clone(session),version:2,...patch}}),"SESSION_IDENTITY_CONFLICT");
 }
 assert.equal(f.writes,before);
 f.session.fields.Session_ID="replacement-session";
 await reject(()=>f.ops.readSession(outputId),"SESSION_IDENTITY_CONFLICT");
});

test("unconfigured scheduling revocation prevents orphaned hold before any writes",async()=>{
 const f=fake({mutationGate:true,scheduleRevocationReady:false});
 f.output.fields.Scheduled_Post_Date="2026-12-07T17:30:00Z";
 await reject(()=>enrollManualReviewCommand({...args,operations:f.ops}),"SCHEDULE_REVOCATION_UNAVAILABLE");
 assert.equal(f.writes,0);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_ID,undefined);
 assert.equal(f.session,null);
});
test("unconfigured scheduler still denies the entirely unscheduled path before holding",async()=>{
 const f=fake({mutationGate:true,scheduleRevocationReady:false});
 await reject(()=>enrollManualReviewCommand({...args,operations:f.ops}),"SCHEDULE_REVOCATION_UNAVAILABLE");
 assert.equal(f.writes,0);
 assert.equal(f.session,null);
});
