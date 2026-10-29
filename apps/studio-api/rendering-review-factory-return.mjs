/** Return an accepted but unapproved Factory V2 to the SAME Producer session.
 * Durable order: reapply exact original review hold -> verify -> append notes.
 * The output remains unapproved and unscheduled. No new render or PR reset.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
const rec=/^rec[A-Za-z0-9]{14}$/;
const id=/^[A-Za-z0-9_-]{8,120}$/;
const text=x=>String(x??"").trim();
const label=x=>typeof x==="string"?x:text(x?.name);
const deny=(status,code,message)=>{const e=new Error(message);e.status=status;e.code=code;throw e;};
function safeOutput(row,session,readField) {
  const f=k=>readField(row,k);
  const blocked=["Scheduled_Post_Date","Studio_Scheduled_At","Published_At",
    "Platform_Post_ID","Platform_Post_URL","Platform_Media_ID",
    "Publish_Started_At","Publish_Locked_At","Publish_Locked_By",
    "Studio_Review_Hold_ID","Studio_Review_Hold_Owner"].some(k=>Boolean(text(f(k))));
  return row?.id===session.output_id && !blocked &&
    session.profile_id===CHICAGO_PROFILE_ID &&
    label(f("Platform"))==="Instagram" &&
    label(f("Platform_Output_Type"))==="Instagram Reel" &&
    label(f("Render_Status"))==="Rendered" &&
    label(f("Output_Status"))==="Ready for Review" &&
    label(f("Review_Status"))==="Review Sent" &&
    label(f("Publish_Status"))==="Not Ready" &&
    text(f("Final_File_ID"))===text(session.factory_handoff?.artifact_id) &&
    f("Auto_Publish_Enabled")!==true;
}
function ownedHold(row,session,f){
  return f(row,"Do_Not_Publish")===true &&
    f(row,"Studio_Render_Review_Hold_Active")===true &&
    text(f(row,"Studio_Render_Review_Hold_ID"))===session.review_hold.id &&
    text(f(row,"Studio_Render_Review_Hold_Owner"))===session.id &&
    text(f(row,"Studio_Render_Review_Session_ID"))===session.id;
}
export async function returnFactoryRevisionToProducer({output_id,note,client_request_id,
  env,operations,now=()=>new Date().toISOString()}){
  // Non-pilot outputs continue using the existing Factory production path.
  if(!rec.test(output_id)||output_id!==env?.RENDERING_REVIEW_EXACT_OUTPUT_ID)
    deny(404,"FACTORY_REVIEW_NOT_APPLICABLE","This output is not enrolled in the conversational revision pilot");
  if(!id.test(client_request_id)||!text(note)||text(note).length>3000)
    deny(400,"FACTORY_FEEDBACK_INVALID","Review notes and request identity are required (maximum 3000 characters)");
  const o=operations;
  if(!["withOutputLock","readSession","readRawOutput","readField",
    "readAttempt","patchOutput","saveSessionIfVersion","syncOutput"].every(k=>typeof o?.[k]==="function"))
    deny(503,"FACTORY_FEEDBACK_ADAPTER_MISSING","Protected review adapter unavailable");
  return o.withOutputLock(output_id,async()=>{
    const s=await o.readSession(output_id);
    if(!s||s.output_id!==output_id||s.profile_id!==CHICAGO_PROFILE_ID)
      deny(404,"FACTORY_REVIEW_NOT_APPLICABLE","No eligible conversation is recorded for this output");
    const msgId="rrfactorymsg_"+client_request_id;
    if(s.factory_return?.note_id===msgId && s.state==="discussing" &&
       s.review_hold?.active===true){
      const row=await o.readRawOutput(output_id);
      if(!ownedHold(row,s,o.readField))
        deny(409,"FACTORY_RETURN_READBACK_FAILED","Review hold is not verified");
      return {ok:true,received:true,replay:true,output_id,
        review_hold_active:true,open_page:"rendering-review"};
    }
    const a=s.attempts?.find(x=>x.id===s.current_attempt_id);
    if(s.state!=="approved"||s.review_hold?.active!==false ||
       s.approved_attempt_id!==s.current_attempt_id ||
       s.original_do_not_publish!==false ||
       !s.factory_handoff ||
       s.factory_handoff.status!=="ready_for_factory_approval" ||
       s.factory_handoff.attempt_id!==s.current_attempt_id ||
       s.factory_handoff.artifact_id!==a?.artifact_id ||
       a?.status!=="ready_for_review"||Number(a.number)<2)
      deny(409,"FACTORY_RETURN_NOT_ELIGIBLE","Only accepted, unapproved revisions can be returned");
    const raw=await o.readRawOutput(output_id),f=o.readField;
    if(!safeOutput(raw,s,f))
      deny(409,"FACTORY_RETURN_OUTPUT_CHANGED","Output is already scheduled, dispatched or changed");
    const p=(await o.readAttempt(a.id))?.fields||{};
    if(p.Artifact_File_ID!==a.artifact_id||p.Attempt_ID!==a.id||
       p.Session_ID!==s.id||p.Output_Record_ID!==output_id)
      deny(409,"FACTORY_RETURN_MEDIA_CHANGED","Accepted V2 no longer matches saved attempt");
    if(f(raw,"Do_Not_Publish")===true &&
       !ownedHold(raw,s,f))
      deny(409,"FACTORY_RETURN_OTHER_HOLD","Cannot override an unrelated publication hold");
    if(f(raw,"Studio_Render_Review_Hold_Active")===true &&
       !ownedHold(raw,s,f))
      deny(409,"FACTORY_RETURN_OTHER_HOLD","Cannot override another review hold");
    if(!ownedHold(raw,s,f)){
      await o.patchOutput(output_id,{
        Do_Not_Publish:true,
        Auto_Publish_Enabled:false,
        Studio_Render_Review_Hold_Active:true,
        Studio_Render_Review_Hold_ID:s.review_hold.id,
        Studio_Render_Review_Hold_Owner:s.id,
        Studio_Render_Review_Session_ID:s.id,
      });
    }
    const protectedRow=await o.readRawOutput(output_id);
    if(!safeOutput(protectedRow,s,f)||!ownedHold(protectedRow,s,f))
      deny(503,"FACTORY_RETURN_HOLD_UNVERIFIED","Publication hold readback failed");
    const key="rrfactoryreturn_"+client_request_id;
    const next=applyReviewEvent(s,{
      type:"FACTORY_RETURN_FOR_REVISION",expected_version:s.version,
      idempotency_key:key,fingerprint:key,
      message_id:msgId,note:text(note),
      review_hold_verified:true,hold_id:s.review_hold.id,
      hold_owner:s.id,at:now(),
    }).session;
    if((await o.saveSessionIfVersion({output_id,expected_version:s.version,next}))!==true)
      deny(409,"FACTORY_RETURN_SESSION_CONFLICT","Session changed during handoff");
    const verified=await o.readSession(output_id);
    if(verified?.version!==next.version||verified?.factory_return?.note_id!==msgId||
       verified?.review_hold?.active!==true)
      deny(503,"FACTORY_RETURN_SESSION_UNVERIFIED","Saved conversation notes were not verified");
    const sync=await o.syncOutput(protectedRow);
    return {ok:true,received:true,replay:false,output_id,
      session_version:next.version,review_hold_active:true,
      queued_for_render:false,approved_for_publishing:false,
      open_page:"rendering-review",mirror_synced:sync?.ok===true||sync?.skipped===true};
  });
}
