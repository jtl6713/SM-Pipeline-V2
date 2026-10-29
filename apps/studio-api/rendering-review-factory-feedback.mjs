/** Factory Request Changes on an accepted Rendering Review rendition.
 * Reacquire the exact output hold BEFORE reopening the original conversation.
 * No automatic render, scheduling, upload or publishing.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
const str=x=>String(x??"").trim();
const name=x=>typeof x==="string"?x:str(x?.name);
const fail=(code,message)=>{const e=new Error(message);e.status=409;e.code=code;throw e};
const rec=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const file=/^[A-Za-z0-9_-]{20,}$/;
async function hex(input){
  const bytes=new TextEncoder().encode(JSON.stringify(input));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
    .map(b=>b.toString(16).padStart(2,"0")).join("");
}
function holds(f,row,s){
  return f(row,"Do_Not_Publish")===true &&
    f(row,"Studio_Render_Review_Hold_Active")===true &&
    str(f(row,"Studio_Render_Review_Hold_ID"))===s.review_hold.id &&
    str(f(row,"Studio_Render_Review_Hold_Owner"))===s.id &&
    str(f(row,"Studio_Render_Review_Session_ID"))===s.id &&
    !f(row,"Auto_Publish_Enabled");
}
function noDispatch(f,row){
  return ["Scheduled_Post_Date","Studio_Scheduled_At","YouTube_Scheduled_Publish_At",
    "Publish_Started_At","Publish_Locked_At","Publish_Locked_By","Published_At",
    "Platform_Post_ID","Platform_Media_ID","Platform_Post_URL"].every(k=>!str(f(row,k))) &&
    name(f(row,"Publish_Status"))==="Not Ready";
}
export async function requestFactoryRevisionFeedback({
  output_id,note,client_request_id,actor,env,operations,
  now=()=>new Date().toISOString()
}){
  if(output_id!==env?.RENDERING_REVIEW_EXACT_OUTPUT_ID || !rec.test(output_id))
    fail("PILOT_SCOPE","Only a verified Rendering Review output may be sent back here");
  const text=str(note);
  if(!text||text.length>3000||!token.test(str(client_request_id))||
     !str(actor)||str(actor).length>256)
    fail("INVALID_FACTORY_FEEDBACK","A reviewer and a bounded note and retry key are required");
  for(const name of ["withOutputLock","readSession","readRawOutput",
    "readField","patchOutput","saveSessionIfVersion","syncOutput"])
    if(typeof operations?.[name]!=="function")fail("MISSING_ADAPTER","Factory revision adapter unavailable");
  const key="rrfactoryfb_"+(await hex([actor,output_id,client_request_id])).slice(0,60);
  const fingerprint="rrfp_"+await hex([actor,output_id,text]);
  return operations.withOutputLock(output_id,async()=>{
    const s=await operations.readSession(output_id),f=operations.readField;
    const row=await operations.readRawOutput(output_id);
    const current=s?.attempts?.find(x=>x.id===s.current_attempt_id);
    if(!s || s.output_id!==output_id || s.profile_id!==CHICAGO_PROFILE_ID ||
       s.output_type!=="Instagram Reel" ||
       !current || current.number<2 || !file.test(str(current.artifact_id)) ||
       row?.id!==output_id || str(f(row,"Final_File_ID"))!==current.artifact_id ||
       name(f(row,"Platform"))!=="Instagram" ||
       name(f(row,"Platform_Output_Type"))!=="Instagram Reel" ||
       !noDispatch(f,row))fail("FACTORY_REVISION_NOT_ELIGIBLE","This output cannot safely return to Rendering Review");
    // A successful but lost response is an idempotent no-write replay.
    if(s.processed?.[key]){
      if(s.processed[key]!==fingerprint || s.state!=="discussing" ||
         s.factory_handoff?.status!=="returned_for_revision" ||
         s.review_hold?.active!==true || !holds(f,row,s))
        fail("FACTORY_REVISION_REPLAY_CONFLICT","The previous request changed");
      return {ok:true,replay:true,rendering_review_reopened:true,
        output_id,session_version:s.version,note_saved:true,
        message:"Your change request has been received and saved. Continue the conversation with your AI Producer in Rendering Review."};
    }
    if(s.state!=="approved" || s.review_hold?.active!==false ||
       s.current_attempt_id!==s.approved_attempt_id ||
       s.factory_handoff?.status!=="ready_for_factory_approval" ||
       s.factory_handoff?.attempt_id!==s.current_attempt_id ||
       s.factory_handoff?.artifact_id!==current.artifact_id ||
       f(row,"Do_Not_Publish")===true ||
       f(row,"Studio_Render_Review_Hold_Active")===true ||
       str(f(row,"Studio_Render_Review_Hold_ID")) ||
       str(f(row,"Studio_Render_Review_Hold_Owner")) ||
       name(f(row,"Output_Status"))!=="Ready for Review" ||
       name(f(row,"Review_Status"))!=="Review Sent")
      fail("FACTORY_REVISION_STATE_CHANGED","Only the exact unapproved Factory V2 can reopen its review");
    // Protect the output before saving a message or transitioning the session.
    await operations.patchOutput(output_id,{
      Do_Not_Publish:true,Auto_Publish_Enabled:false,
      Studio_Render_Review_Hold_Active:true,
      Studio_Render_Review_Hold_ID:s.review_hold.id,
      Studio_Render_Review_Hold_Owner:s.id,
      Studio_Render_Review_Session_ID:s.id,
      Output_Status:"In Production",Review_Status:"Changes Requested",
      Publish_Status:"Not Ready",
    });
    const protectedRow=await operations.readRawOutput(output_id);
    if(!holds(f,protectedRow,s) || !noDispatch(f,protectedRow) ||
       str(f(protectedRow,"Final_File_ID"))!==current.artifact_id)
      fail("FACTORY_REHOLD_FAILED","The publication block was not verified");
    const next=applyReviewEvent(s,{
      type:"FACTORY_REQUEST_CHANGES",expected_version:s.version,
      idempotency_key:key,fingerprint,
      message_id:"rrfactorymsg_"+key.slice(12),
      content:text,hold_verified:true,hold_id:s.review_hold.id,hold_owner:s.id,
      at:now(),
    }).session;
    const saved=await operations.saveSessionIfVersion({
      output_id,expected_version:s.version,next,
    });
    if(saved!==true)fail("FACTORY_REOPEN_VERSION_CONFLICT","The Producer session changed during send-back");
    const confirmed=await operations.readSession(output_id);
    if(confirmed?.version!==next.version ||
       confirmed?.processed?.[key]!==fingerprint ||
       confirmed?.messages?.at(-1)?.content!==text ||
       confirmed?.review_hold?.active!==true)
      fail("FACTORY_REOPEN_READBACK_FAILED","The review note has not been durably confirmed");
    const mirror=await operations.syncOutput(protectedRow);
    return {ok:true,rendering_review_reopened:true,output_id,
      session_version:confirmed.version,note_saved:true,review_hold_active:true,
      scheduled:false,published:false,mirror_synced:mirror?.ok===true||
      mirror?.skipped===true,
      message:"Your change request has been received and saved. Continue the conversation with your AI Producer in Rendering Review."};
  });
}
