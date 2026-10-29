/**
 * Transfer a creatively approved revision to normal Factory approval.
 * This operation deliberately DOES NOT approve, schedule, upload or publish.
 *
 * Ordering is fail-closed:
 *   1. Select and verify V2 on the held output.
 *   2. Commit an auditable, version-fenced session handoff receipt.
 *   3. Release only this session's hold and Do_Not_Publish fence.
 *
 * A retry resumes after any partially completed step under the same output
 * approval lease used by Factory and the protected scheduler.
 */
import {CHICAGO_PROFILE_ID,applyReviewEvent} from "./rendering-review-policy.mjs";
import {renderingReviewHoldPresent} from "./rendering-review-publication-hold.mjs";

const rec=/^rec[A-Za-z0-9]{14}$/;
const file=/^[A-Za-z0-9_-]{20,}$/;
const sha=/^[a-f0-9]{64}$/;
const str=x=>String(x??"").trim();
const value=x=>typeof x==="string"?x:str(x?.name);
const deny=(code,message,status=409)=>{const e=new Error(message);e.code=code;e.status=status;throw e;};
const same=(a,b)=>str(a)===str(b);
function requireFunctions(ops){
  for(const name of ["withOutputLock","readRawOutput","readNormalizedOutput","readSession",
    "readAttempt","readField","saveSessionIfVersion","patchOutput","syncOutput"]){
    if(typeof ops?.[name]!=="function")
      deny("FACTORY_HANDOFF_ADAPTER_MISSING","Factory handoff requires "+name,503);
  }
}
function dispatchStarted(row,f){
  return ["Publish_Started_At","Publish_Locked_At","Publish_Locked_By","Published_At",
    "Platform_Post_ID","Platform_Post_URL","Platform_Media_ID"].some(k=>Boolean(str(f(row,k))))
    || /^(published|publishing|dispatched)$/i.test(value(f(row,"Output_Status")))
    || /^(published|publishing|dispatched)$/i.test(value(f(row,"Publish_Status")));
}
function noSchedule(row,f){
  return ["Scheduled_Post_Date","Studio_Scheduled_At","YouTube_Scheduled_Publish_At"]
    .every(k=>!str(f(row,k)));
}
function ownedHold(row,f,session,outputId){
  return row?.id===outputId &&
    f(row,"Studio_Render_Review_Hold_Active")===true &&
    same(f(row,"Studio_Render_Review_Hold_ID"),session.review_hold.id) &&
    same(f(row,"Studio_Render_Review_Hold_Owner"),session.id) &&
    same(f(row,"Studio_Render_Review_Session_ID"),session.id) &&
    f(row,"Do_Not_Publish")===true;
}
function validateArtifact(record,session,attempt){
  const f=record?.fields||{};
  if(record?.id==null || f.Attempt_ID!==attempt.id ||
     f.Session_ID!==session.id || f.Output_Record_ID!==session.output_id ||
     Number(f.Attempt_Number)!==Number(attempt.number) ||
     value(f.Attempt_Status)!=="ready_for_review" ||
     f.Artifact_File_ID!==attempt.artifact_id ||
     f.Artifact_URL!=="https://drive.google.com/file/d/"+attempt.artifact_id+"/view")
    deny("FACTORY_ATTEMPT_READBACK_FAILED","Authoritative V2 attempt differs from approved session");
  let evidence;
  try{evidence=JSON.parse(str(f.Validation_Evidence_JSON));}catch{
    deny("FACTORY_VALIDATION_MISSING","V2 media evidence is unavailable");
  }
  if(!sha.test(str(evidence.sha256)) || !Number.isSafeInteger(evidence.byte_count) ||
     evidence.byte_count<100000 || evidence.mime_type!=="video/mp4" ||
     evidence.width!==1080 || evidence.height!==1920 ||
     evidence.audio_verified!==true || evidence.watermark_verified!==true ||
     evidence.google_drive_verified!==true || evidence.google_drive_mime_type!=="video/mp4")
    deny("FACTORY_VALIDATION_FAILED","Only independently verified playable V2 is eligible");
  return evidence;
}
function assertFactoryReady(row,f,fileId){
  if(!row || Boolean(f(row,"Do_Not_Publish")) ||
     renderingReviewHoldPresent(key=>f(row,key)) ||
     !same(f(row,"Final_File_ID"),fileId) ||
     !same(f(row,"Final_File_URL"),"https://drive.google.com/file/d/"+fileId+"/view") ||
     value(f(row,"Render_Status"))!=="Rendered" ||
     value(f(row,"Output_Status"))!=="Ready for Review" ||
     value(f(row,"Review_Status"))!=="Review Sent" ||
     value(f(row,"Publish_Status"))!=="Not Ready" ||
     !noSchedule(row,f) || dispatchStarted(row,f))
    deny("FACTORY_HANDOFF_READBACK_FAILED","Factory queue state or selected V2 not verified",503);
}
/** Can be safely called again after a network error or partial Airtable write. */
export async function handoffApprovedReviewToFactory({output_id,env,operations,now=()=>new Date().toISOString()}){
  if(!rec.test(str(output_id)) || output_id!==env?.RENDERING_REVIEW_EXACT_OUTPUT_ID)
    deny("FACTORY_PILOT_SCOPE","Exact pilot output required",403);
  if(env?.RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED!=="true")
    deny("FACTORY_HANDOFF_DISABLED","Rendering Review handoff disabled",405);
  requireFunctions(operations);
  const o=operations;
  return o.withOutputLock(output_id,async()=>{
    const s=await o.readSession(output_id);
    if(!s || s.output_id!==output_id || s.profile_id!==CHICAGO_PROFILE_ID ||
       s.output_type!=="Instagram Reel" || s.state!=="approved" ||
       s.current_attempt_id!==s.approved_attempt_id ||
       s.original_do_not_publish!==false)
      deny("FACTORY_SESSION_NOT_ELIGIBLE","Only accepted V2 without an unrelated original hold can enter Factory");
    const attempt=s.attempts?.find(x=>x.id===s.current_attempt_id);
    const original=s.attempts?.find(x=>x.number===1);
    if(!attempt || Number(attempt.number)<2 || attempt.status!=="ready_for_review" ||
       !file.test(str(attempt.artifact_id)) ||
       !original || !file.test(str(original.artifact_id)) ||
       attempt.artifact_id===original.artifact_id)
      deny("FACTORY_CURRENT_V2_INVALID","Accepted replacement and preserved V1 must be distinct");
    const fileId=attempt.artifact_id;
    const output=await o.readRawOutput(output_id),f=o.readField;
    const normalized=await o.readNormalizedOutput(output_id);
    if(output?.id!==output_id || normalized?.id!==output_id ||
       normalized.profile_id!==CHICAGO_PROFILE_ID ||
       normalized.platform!=="Instagram" ||
       normalized.output_type!=="Instagram Reel" ||
       value(f(output,"Render_Status"))!=="Rendered" ||
       dispatchStarted(output,f) || !noSchedule(output,f))
      deny("FACTORY_OUTPUT_NOT_ELIGIBLE","Live output is not a held, unscheduled Chicago Reel");
    if(str(f(output,"Studio_Review_Hold_ID")) || str(f(output,"Studio_Review_Hold_Owner")))
      deny("FACTORY_UNRELATED_HOLD","Cannot release a different review hold");

    const currentFile=str(f(output,"Final_File_ID"));
    if(currentFile!==fileId && currentFile!==original.artifact_id)
      deny("FACTORY_OUTPUT_MEDIA_CHANGED","Output no longer selects the preserved V1 or this approved V2");

    const persistedAttempt=await o.readAttempt(attempt.id);
    validateArtifact(persistedAttempt,s,attempt);
    const alreadyTransferred=s.review_hold?.active===false;
    const receipt=s.factory_handoff;
    if(alreadyTransferred &&
       (!receipt || receipt.attempt_id!==attempt.id ||
        receipt.artifact_id!==fileId || receipt.original_artifact_id!==original.artifact_id))
      deny("FACTORY_SESSION_HANDOFF_MISMATCH","Review hold was released without matching durable Factory receipt");

    let row=output;
    if(!alreadyTransferred){
      if(!ownedHold(row,f,s,output_id))
        deny("FACTORY_HOLD_NOT_OWNED","Current session does not own the authoritative publication hold");
      if(currentFile!==fileId || !same(f(row,"Output_URL"),"https://drive.google.com/file/d/"+fileId+"/view")){
        // Never unhold while replacing a media reference. Clear any V1-specific
        // preview/public media cache so publishing must prepare V2 itself.
        await o.patchOutput(output_id,{
          Final_File_ID:fileId,
          Final_File_URL:"https://drive.google.com/file/d/"+fileId+"/view",
          Output_URL:"https://drive.google.com/file/d/"+fileId+"/view",
          Studio_Preview_URL:null,
          Studio_Preview_R2_Key:"",
          Studio_Preview_Updated_At:null,
          Publish_Asset_URL:null,
          Publish_Asset_Host:null,
          Publish_Asset_Ready_At:null,
          Publish_Asset_File_Name:null,
          Output_Status:"Ready for Review",
          Review_Status:"Review Sent",
          Publish_Status:"Not Ready",
        });
        row=await o.readRawOutput(output_id);
      }
      if(!ownedHold(row,f,s,output_id) ||
         !same(f(row,"Final_File_ID"),fileId) ||
         !same(f(row,"Final_File_URL"),"https://drive.google.com/file/d/"+fileId+"/view") ||
         !noSchedule(row,f) || dispatchStarted(row,f))
        deny("FACTORY_ASSET_PREP_READBACK_FAILED","V2 selection did not verify under active hold",503);

      const eventKey="rrfactory_"+attempt.id;
      const next=applyReviewEvent(s,{
        type:"FACTORY_HANDOFF",
        expected_version:s.version,
        attempt_id:attempt.id,
        artifact_id:fileId,
        original_artifact_id:original.artifact_id,
        factory_receipt_verified:true,
        hold_id:s.review_hold.id,
        hold_owner:s.id,
        idempotency_key:eventKey,
        fingerprint:eventKey,
        at:now(),
      }).session;
      const saved=await o.saveSessionIfVersion({
        output_id,expected_version:s.version,next,
      });
      if(saved!==true)
        deny("FACTORY_SESSION_CAS_FAILED","Review session version changed before handoff");
      const confirmed=await o.readSession(output_id);
      if(JSON.stringify(confirmed)!==JSON.stringify(next))
        deny("FACTORY_SESSION_READBACK_FAILED","Factory handoff receipt failed readback",503);
    }else{
      if(same(f(row,"Final_File_ID"),original.artifact_id))
        deny("FACTORY_HANDOFF_MEDIA_REGRESSED","Factory handoff receipt exists but V1 is selected");
    }

    // Final release only after the accepted asset AND session receipt persist.
    // Never change review approval or schedule: that remains Factory's job.
    row=await o.readRawOutput(output_id);
    if(renderingReviewHoldPresent(key=>f(row,key)) || f(row,"Do_Not_Publish")===true){
      if(!ownedHold(row,f,s,output_id))
        deny("FACTORY_HOLD_CHANGED_BEFORE_RELEASE","Only the exact review-owned hold may be released");
      await o.patchOutput(output_id,{
        Studio_Render_Review_Hold_Active:false,
        Studio_Render_Review_Hold_ID:"",
        Studio_Render_Review_Hold_Owner:"",
        Studio_Render_Review_Session_ID:"",
        Do_Not_Publish:false,
      });
    }
    const ready=await o.readRawOutput(output_id);
    assertFactoryReady(ready,f,fileId);
    const mirror=await o.syncOutput(ready);
    return {ok:true,factory_ready:true,already_transferred:alreadyTransferred,
      output_id,attempt_id:attempt.id,artifact_id:fileId,
      original_artifact_id:original.artifact_id,session_version:alreadyTransferred?s.version:s.version+1,
      review_hold_active:false,approved_for_publishing:false,
      scheduled:false,public_post_created:false,
      mirror_synced:mirror?.ok===true||mirror?.skipped===true};
  });
}
