/**
 * Accepted Rendering Review -> Factory's existing Needs Eyes lane.
 * An accepted V2 is creative approval only; this handoff does NOT approve,
 * schedule, dispatch or upload to Instagram. Airtable remains write authority.
 *
 * All mutations are serialized by the SAME R2 output lease as Factory Approve.
 * The two-step output/session/hold transition is resumable after partial writes:
 * stage V2 under a hard publication hold, record the durable handoff, then
 * release ONLY the exact review-owned hold after independent readbacks.
 */
import {applyReviewEvent, CHICAGO_PROFILE_ID, REVIEW_SCHEMA} from "./rendering-review-policy.mjs";

const rec=/^rec[A-Za-z0-9]{14}$/;
const drive=/^[A-Za-z0-9_-]{20,128}$/;
const txt=x=>String(x??"").trim();
const val=x=>typeof x==="string"?x:txt(x?.name);
function deny(code,message,status=409){
  const e=new Error(message||code);e.code=code;e.status=status;throw e;
}
const present=x=>x!==null&&x!==undefined&&txt(x)!=="";
const fieldsOf=x=>x?.fields||{};
const publisherFields=[
  "Publish_Started_At","Publish_Locked_At","Publish_Locked_By","Published_At",
  "Platform_Post_ID","Platform_Post_URL","Platform_Media_ID",
  "TikTok_Draft_Publish_ID"
];
const dates=["Scheduled_Post_Date","Studio_Scheduled_At","YouTube_Scheduled_Publish_At"];
function noDispatch(f){
  return !publisherFields.some(k=>present(f[k])) &&
    !/^(published|publishing|dispatched|approved for publishing)$/i.test(val(f.Output_Status)) &&
    !/^(published|publishing|dispatched|scheduled|ready to schedule)$/i.test(val(f.Publish_Status));
}
function held(f,s){
  return f.Studio_Render_Review_Hold_Active===true &&
    txt(f.Studio_Render_Review_Hold_ID)===txt(s.review_hold?.id) &&
    txt(f.Studio_Render_Review_Hold_Owner)===s.id &&
    txt(f.Studio_Render_Review_Session_ID)===s.id &&
    f.Do_Not_Publish===true;
}
function released(f){
  return f.Studio_Render_Review_Hold_Active!==true &&
    !txt(f.Studio_Render_Review_Hold_ID) &&
    !txt(f.Studio_Render_Review_Hold_Owner) &&
    !txt(f.Studio_Render_Review_Session_ID);
}
function ready(f,artifact){
  return txt(f.Final_File_ID)===artifact &&
    val(f.Review_Status)==="Review Sent" &&
    val(f.Output_Status)==="Ready for Review" &&
    val(f.Publish_Status)==="Not Ready" &&
    val(f.Render_Status)==="Rendered" &&
    !dates.some(k=>present(f[k])) &&
    f.Auto_Publish_Enabled!==true;
}
function validate(s,row,attempt){
  if(s?.schema!==REVIEW_SCHEMA || !rec.test(txt(s.output_id)) ||
     row?.id!==s.output_id || s.profile_id!==CHICAGO_PROFILE_ID ||
     s.output_type!=="Instagram Reel" || s.state!=="approved" ||
     s.approved_attempt_id!==s.current_attempt_id || s.active_job ||
     !Array.isArray(s.attempts) || s.original_do_not_publish===true)
    deny("FACTORY_HANDOFF_SESSION_INVALID","The accepted Chicago review is not eligible for Factory");
  const f=fieldsOf(row);
  if(val(f.Platform)!=="Instagram"||val(f.Platform_Output_Type)!=="Instagram Reel"||
     !noDispatch(f)||dates.some(k=>present(f[k]))||
     val(f.Review_Status)==="Approved")
    deny("FACTORY_HANDOFF_PUBLISH_FENCE","Existing approval, scheduling or dispatch prevents handoff");
  const original=s.attempts.find(a=>a.number===1);
  const selected=s.attempts.find(a=>a.id===s.current_attempt_id);
  if(!original||!selected||selected.number<2||
     !drive.test(txt(original.artifact_id))||!drive.test(txt(selected.artifact_id))||
     original.artifact_id===selected.artifact_id||
     selected.status!=="ready_for_review"||s.latest_attempt_number!==selected.number)
    deny("FACTORY_HANDOFF_ATTEMPT_INVALID","Exact completed V2 and preserved V1 required");
  if(attempt?.session_id!==s.id||attempt.output_id!==s.output_id||
     attempt.attempt_id!==selected.id||attempt.artifact_file_id!==selected.artifact_id||
     attempt.status!=="ready_for_review")
    deny("FACTORY_HANDOFF_ATTEMPT_UNVERIFIED","Independent attempt readback disagrees with accepted V2");
  let proof;
  try{proof=JSON.parse(attempt.validation_evidence_json)}catch{
    deny("FACTORY_HANDOFF_MEDIA_UNVERIFIED","Validated MP4 receipt required");
  }
  if(proof?.mime_type!=="video/mp4"||proof.google_drive_verified!==true||
     proof.audio_verified!==true||proof.watermark_verified!==true||
     !/^[a-f0-9]{64}$/.test(txt(proof.sha256))||
     !(Number(proof.byte_count)>100000))
    deny("FACTORY_HANDOFF_MEDIA_UNVERIFIED","Approved attempt has no trusted MP4 validation");
  if(![original.artifact_id,selected.artifact_id].includes(txt(f.Final_File_ID)))
    deny("FACTORY_HANDOFF_OUTPUT_CHANGED","Live publication asset no longer matches V1 or accepted V2");
  // Other persisted publication-media authority must not silently retain V1.
  if(present(f.Publish_Asset_URL)||present(f.Platform_Publish_Response_JSON)||
     present(f.Instagram_Media_ID))
    deny("FACTORY_HANDOFF_PUBLISH_ASSET_CONFLICT","Existing provider media may reference V1");
  if(s.review_hold?.active===true&&!held(f,s))
    deny("FACTORY_HANDOFF_HOLD_LOST","Held session lacks the authoritative owned publication hold");
  if(s.review_hold?.active!==true&&!held(f,s)&&!released(f))
    deny("FACTORY_HANDOFF_HOLD_DRIFT","Unrecognized hold prevents a replay");
  return {original:original.artifact_id,selected:selected.artifact_id,
    attempt_id:selected.id,attempt_number:selected.number};
}
function nameFor(f,number){
  const original=txt(f.Final_File_Name)||"rendering-review";
  return original.replace(/\.mp4$/i,"").slice(0,130)+"-V"+number+".mp4";
}
function stageFields(f,data){
  return {
    Final_File_ID:data.selected,
    Final_File_URL:"https://drive.google.com/file/d/"+data.selected+"/view",
    Final_File_Name:nameFor(f,data.attempt_number),
    Output_Status:"Ready for Review",Review_Status:"Review Sent",
    Publish_Status:"Not Ready",Render_Status:"Rendered",
    Do_Not_Publish:true,Auto_Publish_Enabled:false,
    Scheduled_Post_Date:null,Studio_Scheduled_At:null,
    YouTube_Scheduled_Publish_At:null,Review_Decision_At:null,
  };
}
function releaseFields(){
  return {
    Studio_Render_Review_Hold_Active:false,
    Studio_Render_Review_Hold_ID:"",
    Studio_Render_Review_Hold_Owner:"",
    Studio_Render_Review_Session_ID:"",
    Do_Not_Publish:false,Auto_Publish_Enabled:false,
    Output_Status:"Ready for Review",Review_Status:"Review Sent",
    Publish_Status:"Not Ready",
  };
}
/** Returns a committed Airtable row only after all three durable checkpoints. */
export async function promoteAcceptedReviewToFactory({outputId,operations}){
  if(!rec.test(txt(outputId)))deny("FACTORY_HANDOFF_BAD_ID","Exact Platform Output ID required",400);
  for(const key of ["withOutputLock","readSession","readOutputRaw","readAttempt",
                     "patchOutput","saveSessionIfVersion"]){
    if(typeof operations?.[key]!=="function")
      deny("FACTORY_HANDOFF_ADAPTER_MISSING",key+" is required",503);
  }
  return operations.withOutputLock(outputId,async()=>{
    let session=await operations.readSession(outputId);
    let row=await operations.readOutputRaw(outputId);
    if(session?.output_id!==outputId||row?.id!==outputId||!row.fields)
      deny("FACTORY_HANDOFF_SOURCE_MISSING","Exact authoritative output or review session missing",503);
    const selected=session.attempts?.find(a=>a.id===session.current_attempt_id);
    const attempt=await operations.readAttempt(selected?.id);
    const data=validate(session,row,attempt);
    if(!ready(row.fields,data.selected)||!held(row.fields,session)&&session.review_hold.active){
      if(!held(row.fields,session))
        deny("FACTORY_HANDOFF_HOLD_LOST","Cannot change a media file without a held review");
      await operations.patchOutput(outputId,stageFields(row.fields,data));
      row=await operations.readOutputRaw(outputId);
      if(row?.id!==outputId||!ready(row.fields,data.selected)||!held(row.fields,session)||
         !noDispatch(row.fields))
        deny("FACTORY_HANDOFF_STAGE_UNVERIFIED","V2 was not independently staged under its hold",503);
    }
    if(session.review_hold.active===true){
      const event={
        type:"HANDOFF_TO_FACTORY",expected_version:session.version,
        attempt_id:data.attempt_id,artifact_id:data.selected,
        factory_handoff_verified:true,hold_id:session.review_hold.id,
        hold_owner:session.id,
        idempotency_key:"rrfactory_"+data.attempt_id,
        fingerprint:"rrfactory_fp_"+data.selected,
        at:new Date().toISOString(),
      };
      const next=applyReviewEvent(session,event).session;
      const wrote=await operations.saveSessionIfVersion({
        output_id:outputId,expected_version:session.version,next
      });
      if(wrote!==true)deny("FACTORY_HANDOFF_SESSION_RACE","Review session changed during handoff");
      session=await operations.readSession(outputId);
      if(session?.version!==next.version||session.state!=="approved"||
         session.review_hold?.active!==false||
         session.approved_attempt_id!==data.attempt_id)
        deny("FACTORY_HANDOFF_SESSION_UNVERIFIED","Factory handoff event not independently saved",503);
    }
    row=await operations.readOutputRaw(outputId);
    if(row?.id!==outputId||!ready(row.fields,data.selected)||!noDispatch(row.fields))
      deny("FACTORY_HANDOFF_PRE_RELEASE_DRIFT","Publisher state changed before releasing hold");
    if(!released(row.fields)){
      if(!held(row.fields,session))
        deny("FACTORY_HANDOFF_FOREIGN_HOLD","Only the exact original review hold may be released");
      await operations.patchOutput(outputId,releaseFields());
      row=await operations.readOutputRaw(outputId);
    }
    if(row?.id!==outputId||!released(row.fields)||!ready(row.fields,data.selected)||
       row.fields.Do_Not_Publish===true||!noDispatch(row.fields)||
       session.review_hold.active!==false)
      deny("FACTORY_HANDOFF_FINAL_UNVERIFIED","Factory readiness and no-publication state not verified",503);
    return {ok:true,ready_for_factory:true,output_id:outputId,
      attempt_id:data.attempt_id,artifact_id:data.selected,
      preserved_v1_file_id:data.original,session_version:session.version,
      publication_approved:false,scheduled:false,published:false,record:row};
  });
}
