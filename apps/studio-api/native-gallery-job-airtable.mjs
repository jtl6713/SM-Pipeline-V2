/**
 * #1495 Dedicated Airtable SoR for native image/gallery generation intents.
 *
 * Real table: Studio Native Gallery Revision Jobs. No reuse of Reel outbox.
 * A single Worker-owned R2 output lock serializes *all* writes; the Runner
 * can claim only through future protected Worker operations, never Airtable.
 * Fail closed on missing publisher fence, source rights/branding, hold, or
 * unexpected Airtable response. No publishing, original-media or MAE writes.
 */
export const NATIVE_GALLERY_JOBS_TABLE="tbl5sq9xBrF6bgPph";
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[0-9a-f]{64}$/;
const S=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?S(x.name):S(x);
function deny(code,status=409){throw Object.assign(new Error(code),{code,status});}
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest(
  "SHA-256",new TextEncoder().encode(JSON.stringify(value))
))].map(b=>b.toString(16).padStart(2,"0")).join("");
export function nativeGalleryJobsEnabled(env){
  return env?.NATIVE_GALLERY_JOB_WRITE_ENABLED==="true"&&
    env?.NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED==="true"&&
    env?.NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED==="true"&&
    env?.NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED==="true"&&
    env?.NATIVE_GALLERY_MEDIA_RENDER_VERIFIED==="true";
}
function required(adapter){
  if(["airtableFetch","listRecords","withOutputLock","verifySource"].some(
    x=>typeof adapter?.[x]!=="function"))deny("NATIVE_GALLERY_JOB_ADAPTER_MISSING",503);
}
async function getOwned({env,adapter,output_id,profile_id,content_item_id}){
  const row=await adapter.airtableFetch(env,env.AIRTABLE_OUTPUT_TABLE_ID,output_id);
  const f=row?.fields;
  if(row?.id!==output_id||!f||!Array.isArray(f.Content_Item)||
     f.Content_Item.length!==1||f.Content_Item[0]!==content_item_id||
     f.Do_Not_Publish!==true||
     f.Studio_Render_Review_Hold_Active!==true||
     !TOKEN.test(S(f.Studio_Render_Review_Hold_ID))||
     !TOKEN.test(S(f.Studio_Render_Review_Hold_Owner))||
     !TOKEN.test(S(f.Studio_Render_Review_Session_ID))||
     S(f.Studio_Render_Review_Hold_Owner)!==S(f.Studio_Render_Review_Session_ID))
    deny("NATIVE_GALLERY_OUTPUT_HOLD_NOT_VERIFIED");
  if(!/(?:image|photo|carousel|gallery|picture)/i.test(choice(f.Platform_Output_Type)))
    deny("NATIVE_GALLERY_NOT_IMAGE_OUTPUT");
  if(f.Published_At||f.Platform_Post_ID||f.Platform_Post_URL||
     f.Platform_Media_ID||f.Publish_Started_At||f.Publish_Locked_At||
     f.Publish_Locked_By||/^(published|publishing|dispatched)$/i.test(
       choice(f.Publish_Status))||
     f.Scheduled_Post_Date||f.Studio_Scheduled_At||
     f.YouTube_Scheduled_Publish_At)
    deny("NATIVE_GALLERY_OUTPUT_DISPATCH_OR_SCHEDULE_PRESENT");
  const content=await adapter.airtableFetch(env,"tblwzN9AXWvmKVKPs",content_item_id);
  if(content?.id!==content_item_id||!Array.isArray(content?.fields?.Content_Profile)||
     content.fields.Content_Profile.length!==1||
     content.fields.Content_Profile[0]!==profile_id)
    deny("NATIVE_GALLERY_CONTENT_PROFILE_CHANGED",403);
  return {hold_id:S(f.Studio_Render_Review_Hold_ID),
    hold_owner:S(f.Studio_Render_Review_Hold_Owner)};
}
async function findJobs(env,adapter,output_id){
  const found=await adapter.listRecords(env,NATIVE_GALLERY_JOBS_TABLE,{
    limit:31,filterFormula:'{Output_Record_ID}="'+output_id+'"',
    fields:["Job_ID","Output_Record_ID","Profile_Record_ID",
      "Content_Item_Record_ID","Actor_Record_ID","Client_Request_ID",
      "Request_Fingerprint","Original_Manifest_SHA256","Plan_SHA256",
      "Job_State","Row_Version","Hold_ID","Hold_Owner","Lease_Fence",
      "Lease_Owner","Total_Slides","Completed_Slides","Created_At_UTC",
      "Plan_JSON","Original_Manifest_JSON"],
  });
  if(!Array.isArray(found)||found.length>=31||
     found.some(r=>!RECORD.test(S(r?.id))||
       S(r.fields?.Output_Record_ID)!==output_id||
       !TOKEN.test(S(r.fields?.Job_ID)))||
     new Set(found.map(r=>S(r.fields.Job_ID))).size!==found.length)
    deny("NATIVE_GALLERY_JOB_LEDGER_INVALID",503);
  return found;
}
function compareStored(row,expected,plan,original){
  const f=row?.fields;
  if(!f||Object.entries(expected).some(([key,val])=>f[key]!==val)||
     choice(f.Job_State)!=="held_queued"||
     f.Row_Version!==1||f.Lease_Fence!==0||
     f.Completed_Slides!==0||
     f.Plan_JSON!==JSON.stringify(plan)||
     f.Original_Manifest_JSON!==JSON.stringify(original)||
     !Number.isSafeInteger(f.Total_Slides)||
     f.Total_Slides<1)deny("NATIVE_GALLERY_JOB_READBACK_CONFLICT",503);
}
export async function createNativeGalleryJobIntent({
  env,actor_id,output_id,client_request_id,proposal,adapter,
  now=()=>new Date().toISOString(),
}={}){
  if(!nativeGalleryJobsEnabled(env))
    deny("NATIVE_GALLERY_JOB_WRITES_DISABLED",405);
  if(!RECORD.test(S(actor_id))||!RECORD.test(S(output_id))||
     !TOKEN.test(S(client_request_id))||
     proposal?.ok!==true||proposal?.output_id!==output_id||
     proposal.client_request_id!==client_request_id||
     !RECORD.test(S(proposal.profile_id))||
     !RECORD.test(S(proposal.content_item_id))||
     !SHA.test(S(proposal.proposal_sha256))||
     !Array.isArray(proposal.selected)||proposal.selected.length<1||
     proposal.selected.length>20||!Array.isArray(proposal.unchanged)||
     proposal.selected.some(x=>!RECORD.test(S(x.slide_id))||
       !Number.isSafeInteger(x.order)||x.blockers?.length||
       typeof x.instruction!=="string"||
       x.instruction.trim().length<8||x.instruction.length>3000))
    deny("NATIVE_GALLERY_JOB_INPUT_INVALID",400);
  required(adapter);
  return adapter.withOutputLock(output_id,async()=>{
    const hold=await getOwned({env,adapter,output_id,
      profile_id:proposal.profile_id,content_item_id:proposal.content_item_id});
    // Unlike metadata-only inventory, verification is freshly loaded inside
    // the canonical lock and cannot be asserted by the browser or proposal.
    const evidence=await adapter.verifySource({
      output_id,profile_id:proposal.profile_id,
      content_item_id:proposal.content_item_id,
      selected:proposal.selected,original_proposal_sha256:proposal.proposal_sha256,
    });
    if(evidence?.output_id!==output_id||
       evidence?.profile_id!==proposal.profile_id||
       evidence?.content_item_id!==proposal.content_item_id||
       evidence?.sources_byte_verified!==true||
       evidence?.source_rights_verified!==true||
       evidence?.original_artifact_watermark_verified!==true||
       evidence?.shared_watermark_asset_verified!==true||
       evidence?.publication_hold_verified!==true||
       evidence?.hold_id!==hold.hold_id||
       !SHA.test(S(evidence.original_manifest_sha256))||
       !Array.isArray(evidence.original_artifacts)||
       evidence.original_artifacts.length!==proposal.selected.length+
         proposal.unchanged.length)
      deny("NATIVE_GALLERY_ORIGINAL_MEDIA_NOT_CERTIFIED");
    const plan={schema:"studio.native-gallery.job.1",output_id,
      content_item_id:proposal.content_item_id,profile_id:proposal.profile_id,
      selected:proposal.selected.map(x=>({slide_id:x.slide_id,order:x.order,
        instruction:x.instruction})),unchanged:proposal.unchanged,
      original_manifest_sha256:evidence.original_manifest_sha256,
      allow_public_publish:false,auto_approve:false,
      mutate_original_production_request:false,
      mutate_sibling_outputs:false,human_intent:"explicit_button"};
    const plan_hash=await sha(plan);
    const fingerprint=await sha([actor_id,output_id,client_request_id,plan_hash,
      hold.hold_id,hold.hold_owner]);
    const job_id="ngjob_"+(await sha(["native-gallery-job-v1",output_id,
      actor_id,client_request_id])).slice(0,48);
    const expected={Job_ID:job_id,Output_Record_ID:output_id,
      Content_Item_Record_ID:proposal.content_item_id,
      Profile_Record_ID:proposal.profile_id,Actor_Record_ID:actor_id,
      Client_Request_ID:client_request_id,Request_Fingerprint:fingerprint,
      Original_Manifest_SHA256:evidence.original_manifest_sha256,
      Plan_SHA256:plan_hash,Hold_ID:hold.hold_id,Hold_Owner:hold.hold_owner};
    const existing=await findJobs(env,adapter,output_id);
    const same=existing.filter(r=>r.fields.Job_ID===job_id);
    if(same.length===1){
      compareStored(same[0],expected,plan,evidence.original_artifacts);
      return {ok:true,replay:true,job_id,output_id,
        state:"held_queued",durable:true,hold_verified:true,
        source_bytes_verified:true,publication_authorized:false};
    }
    // Another job for the output may be under creative review, stalled in
    // rendering, or ambiguously launched. Never silently queue over it.
    if(existing.length)deny("NATIVE_GALLERY_OUTPUT_ALREADY_HAS_JOB");
    const stamp=now();
    if(typeof stamp!=="string"||!/^\d{4}-\d\d-\d\dT/.test(stamp))
      deny("NATIVE_GALLERY_CLOCK_UNAVAILABLE",503);
    await adapter.airtableFetch(env,NATIVE_GALLERY_JOBS_TABLE,"",{
      method:"POST",body:JSON.stringify({typecast:false,fields:{
        ...expected,Original_Manifest_JSON:JSON.stringify(evidence.original_artifacts),
        Plan_JSON:JSON.stringify(plan),Job_State:"held_queued",
        Row_Version:1,Lease_Owner:"",Lease_Fence:0,
        Total_Slides:evidence.original_artifacts.length,
        Completed_Slides:0,Progress_Stage:"held_queued",
        Event_History_JSON:JSON.stringify([{
          event:"native_gallery_job_created",fingerprint,at:stamp,
          publication_authorized:false}]),
        Created_At_UTC:stamp,Updated_At_UTC:stamp,
      }}),
    });
    const read=await findJobs(env,adapter,output_id);
    if(read.length!==1)deny("NATIVE_GALLERY_JOB_READBACK_MISSING",503);
    compareStored(read[0],expected,plan,evidence.original_artifacts);
    const holdAfter=await getOwned({env,adapter,output_id,
      profile_id:proposal.profile_id,content_item_id:proposal.content_item_id});
    if(holdAfter.hold_id!==hold.hold_id||holdAfter.hold_owner!==hold.hold_owner)
      deny("NATIVE_GALLERY_HOLD_CHANGED_AFTER_WRITE");
    return {ok:true,replay:false,job_id,output_id,
      state:"held_queued",durable:true,hold_verified:true,
      source_bytes_verified:true,publication_authorized:false};
  });
}
