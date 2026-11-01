/** Human Factory acceptance of a creatively approved V2 awaiting media QA.
 * This deliberately DOES NOT release the output hold, edit Airtable Output
 * status, authorize publishing, render, or alter Content Item siblings.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
const record=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const str=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?str(x.name):str(x);
const fail=(code,message,status=409)=>{const e=new Error(message);e.code=code;e.status=status;throw e;};
const drive=id=>"https://drive.google.com/file/d/"+id+"/view";
const unsafe=["Published_At","Platform_Post_ID","Platform_Post_URL","Platform_Media_ID",
  "Publish_Started_At","Publish_Locked_At","Publish_Locked_By","Scheduled_Post_Date",
  "Studio_Scheduled_At","YouTube_Scheduled_Publish_At",
  "Studio_Review_Hold_ID","Studio_Review_Hold_Owner"];
function held(row,f,s,a){
  return row?.id===s.output_id&&
    f(row,"Studio_Render_Review_Hold_Active")===true&&
    str(f(row,"Studio_Render_Review_Hold_ID"))===s.review_hold.id&&
    str(f(row,"Studio_Render_Review_Hold_Owner"))===s.id&&
    str(f(row,"Studio_Render_Review_Session_ID"))===s.id&&
    f(row,"Do_Not_Publish")===true&&f(row,"Auto_Publish_Enabled")!==true&&
    str(f(row,"Final_File_ID"))===a.artifact_id&&
    str(f(row,"Final_File_URL"))===drive(a.artifact_id)&&
    choice(f(row,"Render_Status"))==="Rendered"&&
    choice(f(row,"Output_Status"))==="Ready for Review"&&
    choice(f(row,"Review_Status"))==="Review Sent"&&
    choice(f(row,"Publish_Status"))==="Not Ready"&&
    unsafe.every(k=>!str(f(row,k)));
}
async function digest(parts){
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(parts)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function acceptFactoryHeldCreative({
  output_id,actor_id,expected_version,client_request_id,operations,
  now=()=>new Date().toISOString(),
}){
  if(!record.test(str(output_id))||!record.test(str(actor_id)))
    fail("FACTORY_CREATIVE_SCOPE","Authorized exact record and reviewer required",403);
  if(!Number.isSafeInteger(expected_version)||expected_version<1||
     !token.test(str(client_request_id)))
    fail("FACTORY_CREATIVE_INPUT","Expected version and unique request required",400);
  const required=["withOutputLock","readSession","readRawOutput",
    "readNormalizedOutput","readField","saveSessionIfVersion"];
  for(const method of required)if(typeof operations?.[method]!=="function")
    fail("FACTORY_CREATIVE_ADAPTER","Missing protected "+method,503);
  const key="rrfactorycreative_"+client_request_id;
  const fingerprint="rrfactorycreativefp_"+await digest([output_id,actor_id,client_request_id]);
  const o=operations;
  return o.withOutputLock(output_id,async()=>{
    const s=await o.readSession(output_id);
    const a=s?.attempts?.find(x=>x.id===s.current_attempt_id);
    const row=await o.readRawOutput(output_id);
    const norm=await o.readNormalizedOutput(output_id);
    const f=o.readField;
    if(!s||s.output_id!==output_id||s.profile_id!==CHICAGO_PROFILE_ID||
       s.output_type!=="Instagram Reel"||s.state!=="approved"||
       s.review_hold?.active!==true||s.current_attempt_id!==s.approved_attempt_id||
       !a||Number(a.number)<2||a.status!=="ready_for_review"||
       norm?.id!==output_id||norm.profile_id!==CHICAGO_PROFILE_ID||
       norm.platform!=="Instagram"||norm.output_type!=="Instagram Reel"||
       !held(row,f,s,a))
      fail("FACTORY_CREATIVE_NOT_HELD","Only an approved, unpublished V2 with its exact active hold can be reviewed");
    if(s.processed?.[key]){
      if(s.processed[key]!==fingerprint||
         s.factory_review?.status!=="accepted_pending_qa"||
         s.factory_review?.attempt_id!==a.id)
        fail("FACTORY_CREATIVE_REPLAY_CHANGED","Factory creative review already changed");
      return {ok:true,replay:true,factory_creative_accepted:true,
        qa_pending:true,review_hold_active:true,publishing_authorized:false,
        scheduled:false,public_post_created:false,output_id,
        session_version:s.version};
    }
    if(s.factory_review?.status==="accepted_pending_qa")
      fail("FACTORY_CREATIVE_ALREADY_ACCEPTED","Factory creative acceptance is already saved");
    if(s.version!==expected_version)
      fail("FACTORY_CREATIVE_VERSION_CHANGED","Reload the latest review before accepting");
    const next=applyReviewEvent(s,{
      type:"FACTORY_ACCEPT_HELD_CREATIVE",
      expected_version:s.version,attempt_id:a.id,artifact_id:a.artifact_id,
      hold_id:s.review_hold.id,hold_owner:s.id,
      idempotency_key:key,fingerprint,at:now(),
    }).session;
    if(await o.saveSessionIfVersion({output_id,expected_version:s.version,next})!==true)
      fail("FACTORY_CREATIVE_SAVE_CONFLICT","Factory review state changed before saving");
    const confirmed=await o.readSession(output_id);
    const outputAfter=await o.readRawOutput(output_id);
    if(JSON.stringify(confirmed)!==JSON.stringify(next)||
       !held(outputAfter,f,next,a))
      fail("FACTORY_CREATIVE_READBACK_FAILED",
        "Factory creative acceptance or publication hold could not be verified",503);
    return {ok:true,replay:false,factory_creative_accepted:true,
      qa_pending:true,review_hold_active:true,publishing_authorized:false,
      scheduled:false,public_post_created:false,output_id,session_version:next.version,
      message:"Factory accepted V2 creative review. Publishing is held for independent QA; nothing was scheduled or posted."};
  });
}
