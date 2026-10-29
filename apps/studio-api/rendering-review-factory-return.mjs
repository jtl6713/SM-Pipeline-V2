/**
 * Exact-output bridge from Factory rejection to the existing AI Producer.
 * The client cannot choose an asset, session or hold. Nothing schedules/renders.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {renderingReviewHoldPresent} from "./rendering-review-publication-hold.mjs";

const record=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const value=x=>String(x??"").trim();
const selected=x=>typeof x==="string"?x:value(x?.name);
const fail=(status,code,message)=>{const e=new Error(message);e.status=status;e.code=code;throw e;};
const drive=id=>"https://drive.google.com/file/d/"+id+"/view";
const dispatchFields=["Publish_Started_At","Publish_Locked_At","Publish_Locked_By",
  "Published_At","Platform_Post_ID","Platform_Post_URL","Platform_Media_ID"];
function validOutput(row,read,session,attempt){
  if(!row||!session||!attempt||row.id!==session.output_id ||
    selected(read(row,"Platform"))!=="Instagram" ||
    selected(read(row,"Platform_Output_Type"))!=="Instagram Reel" ||
    value(read(row,"Final_File_ID"))!==attempt.artifact_id ||
    value(read(row,"Final_File_URL"))!==drive(attempt.artifact_id) ||
    selected(read(row,"Render_Status"))!=="Rendered" ||
    dispatchFields.some(k=>Boolean(read(row,k))) ||
    ["Scheduled_Post_Date","Studio_Scheduled_At"].some(k=>Boolean(read(row,k))) ||
    /^(published|publishing|dispatched|approved for publishing)$/i.test(selected(read(row,"Output_Status"))) ||
    /^(published|publishing|dispatched)$/i.test(selected(read(row,"Publish_Status"))))
    fail(409,"FACTORY_RETURN_OUTPUT_CHANGED","Only the selected, unpublished, unscheduled revision can return to Producer");
}
function ownedHold(row,read,s){
  return read(row,"Studio_Render_Review_Hold_Active")===true &&
    value(read(row,"Studio_Render_Review_Hold_ID"))===s.review_hold.id &&
    value(read(row,"Studio_Render_Review_Hold_Owner"))===s.id &&
    value(read(row,"Studio_Render_Review_Session_ID"))===s.id &&
    read(row,"Do_Not_Publish")===true;
}
function assertAdapter(o){
  for(const method of ["withOutputLock","readSession","readRawOutput","readNormalizedOutput",
    "readField","patchOutput","saveSessionIfVersion","syncOutput"]){
    if(typeof o?.[method]!=="function")fail(503,"FACTORY_RETURN_ADAPTER",method+" unavailable");
  }
}
/**
 * Called only by authenticated Factory reviewer POST, sharing Factory's
 * per-output approval lock. Request IDs are stable across retry.
 */
export async function returnFactoryRevisionToProducer({output_id,note,client_request_id,env,operations,now=()=>new Date().toISOString()}){
  if(!record.test(value(output_id))||output_id!==env?.RENDERING_REVIEW_EXACT_OUTPUT_ID)
    fail(403,"FACTORY_RETURN_SCOPE","Only the enrolled Chicago pilot may use this bridge");
  if(typeof note!=="string"||!note.trim()||note.trim().length>3000||
    !token.test(value(client_request_id)))
    fail(400,"FACTORY_RETURN_INPUT","Enter review notes and a valid request identifier");
  assertAdapter(operations);
  const o=operations;
  return o.withOutputLock(output_id,async()=>{
    const s=await o.readSession(output_id);
    const row=await o.readRawOutput(output_id);
    const output=await o.readNormalizedOutput(output_id);
    const a=s?.attempts?.find(v=>v.id===s.current_attempt_id);
    if(!s||s.output_id!==output_id||s.profile_id!==CHICAGO_PROFILE_ID||
      s.output_type!=="Instagram Reel"||
      output?.profile_id!==CHICAGO_PROFILE_ID||output?.platform!=="Instagram"||
      output?.output_type!=="Instagram Reel"||a?.number<2||
      a?.status!=="ready_for_review"||
      !s.factory_handoff||s.factory_handoff.attempt_id!==a?.id||
      s.factory_handoff.artifact_id!==a?.artifact_id||
      !s.factory_handoff.original_artifact_id)
      fail(409,"FACTORY_RETURN_SESSION","Only a Factory-transferred accepted revision can return");
    const f=o.readField;
    validOutput(row,f,s,a);
    const key="rrfactoryreturn_"+client_request_id;
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(note.trim()));
    const fingerprint="rrfactoryfp_"+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
    // An earlier request can be replayed without adding duplicate messages.
    if(s.processed?.[key]){
      if(s.processed[key]!==fingerprint)
        fail(409,"FACTORY_RETURN_DUPLICATE_ID","Request identifier already used for different feedback");
      if(!ownedHold(row,f,s)||s.state!=="discussing"||
         s.factory_handoff.status!=="returned_for_changes")
        fail(503,"FACTORY_RETURN_REPLAY_UNVERIFIED","Saved comments exist but return hold is not verified");
      return {ok:true,replay:true,review_notes_saved:true,review_hold_active:true,
        output_id,session_version:s.version,render_queued:false,
        scheduled:false,public_post_created:false,
        message:"Request received. Continue the conversation with your Producer in Rendering Review."};
    }
    if(s.state!=="approved"||s.review_hold.active!==false||
      s.current_attempt_id!==s.approved_attempt_id||
      s.factory_handoff.status!=="ready_for_factory_approval"||
      s.original_do_not_publish!==false||
      renderingReviewHoldPresent(k=>f(row,k))||
      f(row,"Do_Not_Publish")===true||
      f(row,"Auto_Publish_Enabled")===true)
      fail(409,"FACTORY_RETURN_ALREADY_CHANGED","This revision is not in the Factory approval stage");

    // Reapply this session's preserved hold before making comments editable.
    // The output leaves Factory approval without deleting its accepted V2.
    await o.patchOutput(output_id,{
      Studio_Render_Review_Hold_Active:true,
      Studio_Render_Review_Hold_ID:s.review_hold.id,
      Studio_Render_Review_Hold_Owner:s.id,
      Studio_Render_Review_Session_ID:s.id,
      Do_Not_Publish:true,Auto_Publish_Enabled:false,
      Output_Status:"Changes Requested",
      Review_Status:"Changes Requested",
      Publish_Status:"Not Ready",
    });
    const held=await o.readRawOutput(output_id);
    if(!ownedHold(held,f,s)||value(f(held,"Final_File_ID"))!==a.artifact_id||
      dispatchFields.some(k=>Boolean(f(held,k))))
      fail(503,"FACTORY_RETURN_HOLD_READBACK","Publication hold could not be independently verified");

    const event={type:"FACTORY_REQUEST_CHANGES",expected_version:s.version,
      note:note.trim(),attempt_id:a.id,artifact_id:a.artifact_id,
      hold_id:s.review_hold.id,hold_owner:s.id,
      message_id:"rrfactorymsg_"+client_request_id,
      idempotency_key:key,fingerprint,at:now()};
    const next=applyReviewEvent(s,event).session;
    const saved=await o.saveSessionIfVersion({output_id,expected_version:s.version,next});
    if(saved!==true)fail(503,"FACTORY_RETURN_SESSION_SAVE","Review conversation version changed");
    const verify=await o.readSession(output_id);
    if(JSON.stringify(verify)!==JSON.stringify(next))
      fail(503,"FACTORY_RETURN_SESSION_READBACK","Review feedback not yet verified saved");
    const mirror=await o.syncOutput(held);
    return {ok:true,replay:false,review_notes_saved:true,review_hold_active:true,
      output_id,session_version:next.version,render_queued:false,
      scheduled:false,public_post_created:false,mirror_synced:mirror?.ok===true||mirror?.skipped===true,
      message:"Request received. Continue the conversation with your Producer in Rendering Review."};
  });
}
