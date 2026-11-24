/** #2873: one protected resume of the exact Pilsen native siblings.
 * Future owner-uploaded galleries are completed in the normal producer.
 * This recovery reuses that producer, not a second repair writer.
 */
export const PILSEN_REQUEST = "recWBnwtDCy49LTxv";
const EXACT = new Map([[11157,"recaQyj12CzOHjIQp"],[11158,"recFmEG6KLrEHvyHk"],[11159,"rec5QpFiGL7IzkPuy"]]);
const KEY = "SM_Studio_Native_Gallery_2873";
const originalReceiptKey = "studio/recovery/2873/pilsen-native-companions-v1.json";
const retryReceiptKey = "studio/recovery/2873/pilsen-native-companions-v2-exact-duplicates.json";
const safe = row => row?.output_status==="Ready for Review" && row.render_status==="Native Photo Route"
  && ["","Review Sent","Pending","Pending Review"].includes(row.review_status||"")
  && ["","Not Ready"].includes(row.publish_status||"")
  && row.do_not_publish===false && row.auto_publish_enabled!==true
  && !row.test_run_id && !row.studio_scheduled_at && !row.youtube_scheduled_publish_at
  && !row.published_at && !row.platform_post_url && !row.platform_publish_response
  && !["Studio_Render_Review_Hold_Active","Factory_Review_Handoff_Safety_Hold_At","SM_2618_Creative_QA_Hold",
    "Publish_Locked_At","Publish_Started_At","Platform_Post_ID","Platform_Media_ID","IG_Carousel_Parent_Container_ID",
    "Publish_Attempt_Count","Studio_Publish_Attempt_Count","Studio_Publish_Dispatch_Count"].some(k=>row.error_messages?.[k]);

export async function resumePilsenNativeCompanions({read,bucket,runnerReady,resume,clock=()=>new Date()}={}) {
  if(!bucket?.get||!bucket?.put||typeof read!=="function"||typeof runnerReady!=="function"||typeof resume!=="function")
    return {skipped:"recovery_not_configured"};
  if(!await runnerReady())return {skipped:"new_runner_not_verified"};
  const requests=await read("production_requests?airtable_record_id=eq."+PILSEN_REQUEST+
    "&select=airtable_record_id,promoted_content_item_id,request_status,variant_status,variant_manifest,production_job&limit=2");
  const req=requests?.length===1?requests[0]:null;
  const job=req?.production_job;
  const retry=job?.step==="blocked" && job.job_id==="spj-ca8542b8795e" && job.error==="Native gallery contains duplicate final images";
  const receiptKey=retry?retryReceiptKey:originalReceiptKey;
  if(await bucket.get(receiptKey))return {skipped:"one_shot_receipt_exists"};
  if(retry && !await bucket.get(originalReceiptKey))return {skipped:"original_resume_receipt_missing"};
  if(req?.airtable_record_id!==PILSEN_REQUEST||req.request_status!=="Promoted"||req.variant_status!=="Ready"
      ||req.variant_manifest?.complete!==true||req.variant_manifest?.ready_count!==38
      ||(job?.step!=="done"&&!retry)||!req.promoted_content_item_id)return {skipped:"exact_production_not_ready"};
  const rows=await read("platform_outputs?content_item_id=eq."+encodeURIComponent(req.promoted_content_item_id)
    +"&select=airtable_record_id,output_number,content_item_id,content_profile_id,platform,platform_output_type,output_status,render_status,"
    +"review_status,publish_status,do_not_publish,auto_publish_enabled,test_run_id,studio_scheduled_at,youtube_scheduled_publish_at,"
    +"published_at,platform_post_url,platform_publish_response,error_messages,selected_clip_count,selected_assets&limit=4");
  if(!Array.isArray(rows)||rows.length!==3||new Set(rows.map(r=>r.content_profile_id)).size!==1
    ||rows.some(r=>EXACT.get(r.output_number)!==r.airtable_record_id||r.content_item_id!==req.promoted_content_item_id
      ||!safe(r)||r.selected_clip_count!==19||r.selected_assets?.authority!=="studio_owner_uploaded_exact_source"
      ||r.selected_assets?.production_request_record_id!==PILSEN_REQUEST||r.error_messages?.[KEY]))
    return {skipped:"exact_unapproved_siblings_changed"};
  const slides=await read("carousel_slides?deleted_from_carousel=eq.false&or=(fields->PO_Output_ID.cs.%5B11158%5D,fields->PO_Output_ID.cs.%5B11159%5D)&select=airtable_record_id&limit=1");
  if(!Array.isArray(slides)||slides.length!==0)return {skipped:"existing_slide_revision_requires_reconciliation"};
  const receipt={signature:"QA-PRODUCTION-NATIVE-GALLERY-MISSING-LINKS-v1",request_id:PILSEN_REQUEST,
    output_numbers:[11158,11159],revision:retry?2:1,at:clock().toISOString(),status:"reserved",approval_actions:0,schedule_actions:0,publish_actions:0};
  if(!await bucket.put(receiptKey,JSON.stringify(receipt),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}}))
    return {skipped:"already_reserved"};
  try {
    const result=await resume(PILSEN_REQUEST);
    const accepted=result?.payload?.accepted===true || result?.accepted===true;
    const outcome={...receipt,status:accepted?"producer_accepted":"resume_not_accepted"};
    await bucket.put(receiptKey,JSON.stringify(outcome),{httpMetadata:{contentType:"application/json"}});
    return outcome;
  } catch {
    const outcome={...receipt,status:"uncertain_no_automatic_repeat"};
    await bucket.put(receiptKey,JSON.stringify(outcome),{httpMetadata:{contentType:"application/json"}}).catch(()=>{});
    return outcome;
  }
}
