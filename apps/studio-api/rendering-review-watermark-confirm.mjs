/** Human visual watermark QA for an exact accepted V2.
 * Records reviewer attestation, never falsifies automatic evidence, never
 * releases a hold, schedules a post, or updates Platform Output media.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {exactReviewMediaEvidence,watermarkReviewReceipt} from "./rendering-review-watermark-qa.mjs";
const record=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const str=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?str(x.name):str(x);
const fail=(code,msg,status=409)=>{const e=new Error(msg);e.code=code;e.status=status;throw e;};
function held(row,f,s,a){
  return row?.id===s.output_id &&
    f(row,"Studio_Render_Review_Hold_Active")===true&&
    str(f(row,"Studio_Render_Review_Hold_ID"))===s.review_hold.id&&
    str(f(row,"Studio_Render_Review_Hold_Owner"))===s.id&&
    str(f(row,"Studio_Render_Review_Session_ID"))===s.id&&
    f(row,"Do_Not_Publish")===true&&f(row,"Auto_Publish_Enabled")!==true&&
    str(f(row,"Final_File_ID"))===a.artifact_id&&
    str(f(row,"Final_File_URL"))==="https://drive.google.com/file/d/"+a.artifact_id+"/view"&&
    choice(f(row,"Output_Status"))==="Ready for Review"&&
    choice(f(row,"Render_Status"))==="Rendered"&&
    choice(f(row,"Review_Status"))==="Review Sent"&&
    choice(f(row,"Publish_Status"))==="Not Ready"&&
    ["Publish_Started_At","Published_At","Publish_Locked_At","Publish_Locked_By",
     "Platform_Post_ID","Platform_Post_URL","Platform_Media_ID",
     "Scheduled_Post_Date","Studio_Scheduled_At","YouTube_Scheduled_Publish_At",
     "Studio_Review_Hold_ID","Studio_Review_Hold_Owner"].every(k=>!str(f(row,k)));
}
export async function confirmHeldWatermarkReview({
 output_id,actor_id,expected_version,client_request_id,
 attempt_id,artifact_id,confirmed_visible,operations,
 now=()=>new Date().toISOString()
}){
  if(!record.test(str(output_id))||!record.test(str(actor_id)))
    fail("WATERMARK_REVIEW_SCOPE","Exact authorized reviewer and output required",403);
  if(!token.test(str(client_request_id))||
     !Number.isSafeInteger(expected_version)||expected_version<1||
     !token.test(str(attempt_id))||!token.test(str(artifact_id))||
     confirmed_visible!==true)
    fail("WATERMARK_REVIEW_INPUT",
      "Explicit visual confirmation of the selected V2 is required",400);
  const o=operations;
  for(const k of ["withOutputLock","readSession","readAttempt","readRawOutput",
    "readNormalizedOutput","readField","saveSessionIfVersion"])
    if(typeof o?.[k]!=="function")fail("WATERMARK_REVIEW_ADAPTER","Missing protected "+k,503);
  const key="rrwatermark_"+client_request_id;
  return o.withOutputLock(output_id,async()=>{
    const s=await o.readSession(output_id);
    const a=s?.attempts?.find(x=>x.id===s.approved_attempt_id);
    const row=await o.readRawOutput(output_id);
    const norm=await o.readNormalizedOutput(output_id);
    const f=o.readField;
    if(!s||s.output_id!==output_id||s.profile_id!==CHICAGO_PROFILE_ID||
       s.output_type!=="Instagram Reel"||s.state!=="approved"||
       s.original_do_not_publish!==false||
       s.review_hold?.active!==true||
       s.factory_review?.status!=="accepted_pending_qa"||
       s.factory_review?.attempt_id!==s.approved_attempt_id||
       s.current_attempt_id!==s.approved_attempt_id||
       s.active_job||!a||Number(a.number)<2||
       a.status!=="ready_for_review"||a.id!==attempt_id||
       a.artifact_id!==artifact_id||
       norm?.id!==output_id||norm.profile_id!==CHICAGO_PROFILE_ID||
       norm.platform!=="Instagram"||norm.output_type!=="Instagram Reel"||
       !held(row,f,s,a))
      fail("WATERMARK_REVIEW_NOT_HELD",
        "Only the currently accepted and safely held V2 may receive visual QA");
    const attempt=await o.readAttempt(a.id),af=attempt?.fields||{};
    if(!attempt?.id||af.Attempt_ID!==a.id||
       af.Session_ID!==s.id||af.Output_Record_ID!==output_id||
       Number(af.Attempt_Number)!==Number(a.number)||
       choice(af.Attempt_Status)!=="ready_for_review"||
       af.Artifact_File_ID!==a.artifact_id||
       af.Artifact_URL!=="https://drive.google.com/file/d/"+a.artifact_id+"/view")
      fail("WATERMARK_REVIEW_ATTEMPT_MISMATCH","The exact saved V2 identity could not be verified");
    let proof;try{proof=JSON.parse(str(af.Validation_Evidence_JSON))}
    catch{fail("WATERMARK_REVIEW_MEDIA_UNAVAILABLE","V2 media evidence was not readable");}
    if(!exactReviewMediaEvidence(proof))
      fail("WATERMARK_REVIEW_MEDIA_NOT_VALIDATED",
        "Audio, Drive, media bytes and dimensions must be validated first");
    const existing=watermarkReviewReceipt(proof,s,a);
    if(existing?.method==="human"){
      if(s.processed?.[key]&&s.factory_watermark_qa?.reviewer_id!==actor_id)
        fail("WATERMARK_REVIEW_REPLAY_CONFLICT","Another reviewer has already confirmed this V2");
      return {ok:true,replay:true,watermark_qa_confirmed:true,
        qa_method:"explicit_human_visual_review",output_id,
        session_version:s.version,review_hold_active:true,
        approved_for_publishing:false,scheduled:false,public_post_created:false};
    }
    if(s.version!==expected_version)
      fail("WATERMARK_REVIEW_STALE","Reload the accepted V2 before verifying",409);
    const fingerprint="rrwatermarkfp_"+proof.sha256+"_"+actor_id;
    const next=applyReviewEvent(s,{
      type:"FACTORY_CONFIRM_WATERMARK_QA",expected_version:s.version,
      idempotency_key:key,fingerprint,
      attempt_id:a.id,artifact_id:a.artifact_id,sha256:proof.sha256,
      hold_id:s.review_hold.id,hold_owner:s.id,
      reviewer_id:actor_id,confirmed_visible:true,at:now(),
    }).session;
    if(await o.saveSessionIfVersion({output_id,expected_version:s.version,next})!==true)
      fail("WATERMARK_REVIEW_SAVE_CONFLICT","Session changed before QA was saved");
    const check=await o.readSession(output_id);
    if(JSON.stringify(next)!==JSON.stringify(check)||!watermarkReviewReceipt(proof,check,a)||
       !held(await o.readRawOutput(output_id),f,check,a))
      fail("WATERMARK_REVIEW_READBACK_FAILED",
        "Human watermark QA or the protected publication hold could not be verified",503);
    return {ok:true,replay:false,watermark_qa_confirmed:true,
      qa_method:"explicit_human_visual_review",output_id,
      session_version:next.version,review_hold_active:true,
      approved_for_publishing:false,scheduled:false,public_post_created:false};
  });
}
