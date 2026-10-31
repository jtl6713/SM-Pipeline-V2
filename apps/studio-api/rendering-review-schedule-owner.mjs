/**
 * Inactive Rendering Review adapter to the SAME atomic schedule authority used
 * by Studio. It cannot independently approve, publish, enroll, or release holds.
 * Caller must hold the shared per-output approval lease before invoking this.
 */
import {RENDER_REVIEW_OUTPUT_FIELDS as H} from './rendering-review-airtable.mjs';
import {scheduleReservationLaneEnabled} from './schedule-reservation-authority.mjs';
import {runAtomicScheduleTransaction} from './schedule-reservation-transaction.mjs';

const outputIdPattern=/^rec[A-Za-z0-9]{14}$/;
const text=value=>String(value??'').trim();
const status=value=>typeof value==='string'?value:text(value?.name);
const scheduleFields=['Scheduled_Post_Date','Studio_Scheduled_At','YouTube_Scheduled_Publish_At'];
function fail(code,message,http=409){const e=new Error(message);e.code=code;e.status=http;throw e;}
const scheduleOf=fields=>scheduleFields.map(key=>text(fields[key])).find(Boolean)||'';
function dispatchPresent(f){
  return Boolean(f.Published_At||f.Platform_Post_ID||f.Platform_Post_URL||
    f.Platform_Media_ID||f.Publish_Started_At||f.Publish_Locked_At||f.Publish_Locked_By)||
    /^(published|publishing|dispatched)$/i.test(status(f.Publish_Status))||
    /^(published|publishing|dispatched)$/i.test(status(f.Output_Status));
}
export function makeRenderingReviewAtomicScheduleHooks({
  env,readOutput,readContentItem,writeVacateUnderLane,postCommit,mutationGate=false,
  scheduleTransaction=runAtomicScheduleTransaction,
}={}){
  const supported=()=>mutationGate===true&&Boolean(text(env?.AIRTABLE_OUTPUT_TABLE_ID))&&
    typeof readOutput==='function'&&typeof readContentItem==='function'&&
    typeof writeVacateUnderLane==='function'&&typeof postCommit==='function'&&
    typeof scheduleTransaction==='function'&&Boolean(env?.STUDIO_SCHEDULE_RESERVATIONS)&&
    env?.STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED==='true';

  async function readOwned(output_id,review_hold_id,review_owner){
    if(!outputIdPattern.test(text(output_id))||
       !/^[A-Za-z0-9_-]{8,120}$/.test(text(review_hold_id))||
       !/^[A-Za-z0-9_-]{8,120}$/.test(text(review_owner)))
      fail('REVIEW_SCHEDULE_IDENTITY_INVALID','Exact owned review hold is required',400);
    const row=await readOutput(output_id);
    const f=row?.fields;
    if(row?.id!==output_id||!f)fail('REVIEW_SCHEDULE_SOURCE_UNAVAILABLE','Authoritative output unreadable',503);
    const platform=status(f.Platform),outputType=status(f.Platform_Output_Type);
    if(!platform||!outputType)
      fail('REVIEW_SCHEDULE_SCOPE_MISMATCH','Authoritative platform and output type required',403);
    const items=f.Content_Item;
    if(!Array.isArray(items)||items.length!==1||!outputIdPattern.test(items[0]))
      fail('REVIEW_SCHEDULE_CONTENT_AMBIGUOUS','Output must link to one Content Item');
    const content=await readContentItem(items[0]);
    const profiles=content?.fields?.Content_Profile;
    if(content?.id!==items[0]||!Array.isArray(profiles)||profiles.length!==1||
       !outputIdPattern.test(text(profiles[0]))||
       !scheduleReservationLaneEnabled(env,profiles[0],platform))
      fail('REVIEW_SCHEDULE_PROFILE_MISMATCH','Authoritative Content Profile lacks an atomic scheduling lane');
    if(f[H.hold_active]!==true||text(f[H.hold_id])!==review_hold_id||
       text(f[H.hold_owner])!==review_owner||
       text(f[H.session_id])!==review_owner||f.Do_Not_Publish!==true)
      fail('REVIEW_SCHEDULE_HOLD_LOST','Exact persistent review hold no longer matches');
    if(dispatchPresent(f))fail('REVIEW_SCHEDULE_DISPATCH_STARTED','Publication already owns this output');
    return {row,f,contentId:items[0],profileId:profiles[0],
      platform,outputType,previousIso:scheduleOf(f),
      finalFile:text(f.Final_File_ID||f.Final_File_URL)};
  }

  async function scheduleRevocationReady(descriptor={}){
    if(!supported()||!outputIdPattern.test(text(descriptor.output_id))||
      !/^[A-Za-z0-9_-]{8,120}$/.test(text(descriptor.review_owner)))return false;
    // An untrusted descriptor may not grant a new city/platform lane.
    // Read exact authoritative Output -> Content Item before readiness.
    const row=await readOutput(descriptor.output_id);
    const fields=row?.fields;
    const contentId=fields?.Content_Item?.length===1?fields.Content_Item[0]:'';
    if(row?.id!==descriptor.output_id||!outputIdPattern.test(contentId)||
       status(fields.Platform)!==descriptor.platform||
       status(fields.Platform_Output_Type)!==descriptor.output_type)return false;
    const content=await readContentItem(contentId);
    const profile=content?.fields?.Content_Profile;
    return content?.id===contentId&&Array.isArray(profile)&&profile.length===1&&
      outputIdPattern.test(text(profile[0]))&&
      descriptor.profile_id===profile[0]&&
      scheduleReservationLaneEnabled(env,profile[0],descriptor.platform)&&
      // Readiness runs BEFORE the review hold is written. The mandatory
      // live hold/owner readback happens separately inside readOwned/vacate.
      !dispatchPresent(fields)&&
      ((fields[H.hold_active]!==true&&!text(fields[H.hold_owner])&&
        !text(fields[H.hold_id])&&!text(fields[H.session_id]))||
       (fields[H.hold_active]===true&&fields.Do_Not_Publish===true&&
        text(fields[H.hold_owner])===descriptor.review_owner&&
        text(fields[H.session_id])===descriptor.review_owner&&
        Boolean(text(fields[H.hold_id]))));
  }

  async function revokeScheduleUnderHold({output_id,review_hold_id,review_owner}={}){
    if(!supported())
      fail('REVIEW_SCHEDULE_DISABLED','Atomic profile/platform schedule vacate is not enabled',503);
    const original=await readOwned(output_id,review_hold_id,review_owner);
    const args={
      content_profile_id:original.profileId,platform:original.platform,
      output_type:original.outputType,platform_output_record_id:output_id,
      content_item_id:original.contentId,
      owner_operation_id:'render-review-vacate:'+review_hold_id,
    };
    const transaction=await scheduleTransaction(env,args,{
      legacy:async()=>fail('REVIEW_SCHEDULE_LEGACY_DENIED','Review never uses an unfenced legacy vacate',503),
      plan:async()=>({
        action:'vacate',selectedIso:'',previousIso:original.previousIso,
        fields:{
          Scheduled_Post_Date:null,Studio_Scheduled_At:null,
          YouTube_Scheduled_Publish_At:null,
          Review_Status:'Review Sent',
          Output_Status:'Ready for Review',
          Publish_Status:'Not Ready',
        },
      }),
      write:async(plan,{signal}={})=>{
        // Re-check under the acquired MAE lane immediately before the PATCH.
        // Any changed date, owner, media, profile or dispatch state is denied.
        const latest=await readOwned(output_id,review_hold_id,review_owner);
        if(latest.previousIso!==original.previousIso||latest.contentId!==original.contentId||
           latest.profileId!==original.profileId||latest.platform!==original.platform||
           latest.outputType!==original.outputType||latest.finalFile!==original.finalFile)
          fail('REVIEW_SCHEDULE_CHANGED','Output changed while acquiring scheduling lane');
        // Canonical Worker scheduler owns the only Airtable schedule writer.
        // This standalone module may neither issue direct PATCH nor bypass
        // the supplied atomic-lane transaction and hold identity.
        return writeVacateUnderLane({
          output_id,fields:plan.fields,signal,review_hold_id,review_owner,
        });
      },
      verify:async()=>{
        const verified=await readOwned(output_id,review_hold_id,review_owner);
        if(scheduleFields.some(key=>text(verified.f[key]))||
           status(verified.f.Review_Status)!=='Review Sent'||
           status(verified.f.Output_Status)!=='Ready for Review'||
           status(verified.f.Publish_Status)!=='Not Ready')
          fail('REVIEW_SCHEDULE_READBACK_FAILED','Schedule vacate/approval revoke could not be verified');
        return '';
      },
      afterCommit:async()=>{
        const verified=await readOwned(output_id,review_hold_id,review_owner);
        await postCommit({env,output:verified.row,reason:'rendering-review-vacate'});
      },
    },{maxWaitMs:30_000});
    if(transaction?.already_committed){
      const verified=await readOwned(output_id,review_hold_id,review_owner);
      if(scheduleFields.some(key=>text(verified.f[key]))||
         status(verified.f.Review_Status)!=='Review Sent')
        fail('REVIEW_SCHEDULE_REPLAY_UNVERIFIED','Committed vacate is not reflected in Airtable');
    }
    return transaction;
  }
  return {scheduleRevocationReady,revokeScheduleUnderHold};
}
