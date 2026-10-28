import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_SESSION_TABLE, REVIEW_EVENT_TABLE, REVIEW_HOLD_FIELDS,
  REVIEW_STAGING_TABLES,
  prepareAuthoritativeReviewHoldPatch, verifyAuthoritativeReviewHold,
  encodeReviewSessionForAirtable, decodeReviewSessionFromAirtable,
  checkRenderingReviewBeforeDispatch,
} from "./rendering-review-airtable-contract.mjs";
import { CHICAGO_PROFILE_ID, REVIEW_PILOT, enrollReview } from "./rendering-review-policy.mjs";

const outputId="recA1B2C3D4E5F6G7";
const sessionId="session-12345678";
const holdId="hold-00000001";
const attemptId="attempt-00000001";
const artifactId="drivefile-00000001";
const output={
  id:outputId,profile_id:CHICAGO_PROFILE_ID,output_type:"Instagram Reel",
  platform:"Instagram",output_status:"Ready for Review",
  publish_status:"Not Ready",render_status:"Rendered",final_file_id:artifactId,
};
const store=()=>{
  const fields={
    Content_Profile:[CHICAGO_PROFILE_ID], Platform:"Instagram",
    Platform_Output_Type:"Instagram Reel",Output_Status:"Ready for Review",
    Publish_Status:"Not Ready",Do_Not_Publish:false,
    Studio_Review_Hold_ID:"",
  };
  return {id:outputId,fields};
};
const catches=(fn,code)=>assert.throws(fn,e=>e.code===code);

test("staging schema identifies isolated sessions and events; not production base",()=>{
  assert.equal(REVIEW_SESSION_TABLE,"Rendering Review Sessions");
  assert.equal(REVIEW_EVENT_TABLE,"Rendering Review Events");
  assert.equal(REVIEW_STAGING_TABLES.sessions,"tbl2usbCpJNWCAAcL");
  assert.equal(REVIEW_STAGING_TABLES.events,"tblyxIPTWx4aGpRf6");
  assert.equal(REVIEW_HOLD_FIELDS.length,5);
});

test("hold PATCH includes existing legacy block and explicit owner",()=>{
  const p=prepareAuthoritativeReviewHoldPatch({
    output_id:outputId,session_id:sessionId,hold_id:holdId,
    current_attempt_id:attemptId,artifact_id:artifactId,
  });
  assert.equal(p.Do_Not_Publish,true);
  assert.equal(p.Studio_Review_Hold_ID,holdId);
  assert.equal(p.Studio_Review_Hold_Owner,sessionId);
  assert.equal(p.Studio_Review_Current_Attempt_ID,attemptId);
  assert.equal(p.Studio_Review_Current_Artifact_ID,artifactId);
  catches(()=>prepareAuthoritativeReviewHoldPatch({
    output_id:"any-output",session_id:sessionId,hold_id:holdId,
    current_attempt_id:attemptId,artifact_id:artifactId,
  }),"INVALID_HOLD_IDENTITY");
});

test("authoritative hold readback must match all identities and existing publish blocker",()=>{
  const patch=prepareAuthoritativeReviewHoldPatch({
    output_id:outputId,session_id:sessionId,hold_id:holdId,
    current_attempt_id:attemptId,artifact_id:artifactId,
  });
  const full={id:outputId,fields:{...store().fields,...patch}};
  assert.deepEqual(verifyAuthoritativeReviewHold({
    output:full,output_id:outputId,session_id:sessionId,hold_id:holdId,
  }),{id:holdId,owner:sessionId,output_id:outputId,verified:true,active:true});
  for(const fields of [
    {Do_Not_Publish:false},{Studio_Review_Hold_ID:"hold-different01"},
    {Studio_Review_Hold_Owner:"session-different01"},
    {Studio_Review_Current_Attempt_ID:null},
  ])catches(()=>verifyAuthoritativeReviewHold({
    output:{...full,fields:{...full.fields,...fields}},
    output_id:outputId,session_id:sessionId,hold_id:holdId,
  }),"REVIEW_HOLD_NOT_AUTHORITATIVE");
  catches(()=>verifyAuthoritativeReviewHold({
    output:{...full,fields:{...full.fields,Publish_Started_At:"2026-10-28"}},
    output_id:outputId,session_id:sessionId,hold_id:holdId,
  }),"DISPATCH_OWNED");
});

test("session maps to Airtable and round-trips independently checked fields",()=>{
  const s=enrollReview(output,{
    id:holdId,verified:true,owner:sessionId,output_id:outputId,
  },{...REVIEW_PILOT,enabled:true},{
    session_id:sessionId,original_attempt_id:attemptId,
  });
  s.enrollment_request_id="request-00000001";
  const fields=encodeReviewSessionForAirtable(s,"2026-10-28T06:00:00Z");
  assert.equal(fields.Platform_Output_Record_ID,outputId);
  assert.equal(fields.Session_Version,1);
  assert.equal(fields.Review_Hold_Active,true);
  assert.deepEqual(decodeReviewSessionFromAirtable({fields}),s);
  catches(()=>decodeReviewSessionFromAirtable({fields:{
    ...fields,Current_Attempt_ID:"attempt-stale123",
  }}),"SESSION_FIELD_DRIFT");
  catches(()=>decodeReviewSessionFromAirtable({fields:{
    ...fields,Session_JSON:"{",
  }}),"CORRUPT_SESSION");
});

test("existing hold always denies dispatch, even before optional pilot activation",()=>{
  const row=store();row.fields.Studio_Review_Hold_ID=holdId;
  assert.deepEqual(checkRenderingReviewBeforeDispatch({output:row}),{
    allowed:false,reason:"REVIEW_HOLD_ACTIVE",
  });
});

test("legacy unselected output stays unaffected while enforcement off",()=>{
  assert.deepEqual(checkRenderingReviewBeforeDispatch({output:store()}),{
    allowed:true,reason:"LEGACY_UNENROLLED",
  });
});

test("once enforcement is active Chicago Reel needs a complete hold field and lookup",()=>{
  const o=store();
  assert.equal(checkRenderingReviewBeforeDispatch({
    output:o,enforcement_enabled:true,sessionResolution:{kind:"not_found"},
  }).reason,"HOLD_FIELD_NOT_FETCHED");
  assert.equal(checkRenderingReviewBeforeDispatch({
    output:o,enforcement_enabled:true,hold_field_fetched:true,
  }).reason,"REVIEW_LOOKUP_UNAVAILABLE");
  assert.equal(checkRenderingReviewBeforeDispatch({
    output:o,enforcement_enabled:true,hold_field_fetched:true,
    sessionResolution:{kind:"error"},
  }).allowed,false);
  assert.equal(checkRenderingReviewBeforeDispatch({
    output:o,enforcement_enabled:true,hold_field_fetched:true,
    sessionResolution:{kind:"not_found"},
  }).allowed,true);
});

test("missing or ambiguous city profile never bypasses Chicago pilot",()=>{
  for(const v of [undefined,[],[CHICAGO_PROFILE_ID,"recABCDEFGH123456"],["not-a-record"]]){
    const o=store();
    o.fields.Content_Profile=v;
    assert.equal(checkRenderingReviewBeforeDispatch({
      output:o,enforcement_enabled:true,hold_field_fetched:true,
      sessionResolution:{kind:"not_found"},
    }).reason,"PROFILE_UNRESOLVED");
  }
  const o=store();
  o.fields.Content_Profile=["recABCDEFGHIJKLMN"];
  assert.equal(checkRenderingReviewBeforeDispatch({
    output:o,enforcement_enabled:true,hold_field_fetched:true,
    sessionResolution:{kind:"not_found"},
  }).reason,"OUTSIDE_PILOT_SCOPE");
});

test("approved session can dispatch only the latest artifact and no unrelated hold",()=>{
  const s=enrollReview(output,{id:holdId,verified:true,owner:sessionId,output_id:outputId},
    {...REVIEW_PILOT,enabled:true},{session_id:sessionId,original_attempt_id:attemptId});
  s.state="approved";s.approved_attempt_id=attemptId;s.review_hold.active=false;
  const candidate={attempt_id:attemptId,artifact_id:artifactId};
  const base={output:store(),enforcement_enabled:true,hold_field_fetched:true,
    sessionResolution:{kind:"found",session:s},candidate};
  assert.equal(checkRenderingReviewBeforeDispatch(base).allowed,true);
  assert.equal(checkRenderingReviewBeforeDispatch({...base,candidate:{
    attempt_id:attemptId,artifact_id:"artifact-stale123",
  }}).allowed,false);
  const held=store();held.fields.Do_Not_Publish=true;
  assert.equal(checkRenderingReviewBeforeDispatch({...base,output:held}).allowed,false);
  assert.equal(checkRenderingReviewBeforeDispatch({...base,sessionResolution:{kind:"found",
    session:{...s,output_id:"recABCDEFGHIJKLMN"},
  }}).reason,"SESSION_IDENTITY_MISMATCH");
});

test("production authoritative hold cannot bypass staging dispatch gate even when admission off",()=>{
  const row=store();
  row.fields.Studio_Render_Review_Hold_Active=true;
  row.fields.Studio_Render_Review_Hold_ID="rrhold-00000001";
  assert.equal(checkRenderingReviewBeforeDispatch({output:row}).reason,"REVIEW_HOLD_ACTIVE");
  row.fields.Studio_Render_Review_Hold_ID="";
  assert.equal(checkRenderingReviewBeforeDispatch({output:row}).allowed,false);
});
