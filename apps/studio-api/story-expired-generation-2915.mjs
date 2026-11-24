/** Exact, revision-bound expired Story replacement. Release prepares a new
 * operational generation; it does not approve, schedule or publish. The old
 * attempt evidence and original R2 fence are never deleted. */
export const STORY_2915_ID="rec1Zg5eEJjQKzUDO";
const UUID="f68a570b-98e2-4537-97a5-d8516653ca95";
const CONTENT="d1ad9498-36fd-4e28-b398-d0a8aa4a6c54";
const PROFILE="65e9071a-d2fd-4898-88a4-111bf8a3bfb5";
const OLD="18116418158139610";
const SHA="e9f4ad61913fe88aad28bcf6df5643bd8586c74c34ab0b2fe1c9b2d37c3a747f";
const URL="https://media.chicagoshining.com/studio/previews/repairs/issue2915/miami-1018/po5628-e9f4ad61913fe88a.mp4";
const DRIVE="https://drive.google.com/file/d/1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV/view";
const KEY="SM_Issue2915_Story_Replacement_Generation";
const REC=/^rec[A-Za-z0-9]{14}$/;
const oldKeys=["IG_Story_Status","IG_Story_Asset_URL","IG_Story_Locked_At","IG_Story_Locked_By","IG_Story_Container_ID","IG_Story_Attempt_Count","IG_Story_Last_Attempt_At","IG_Story_Error_Message","IG_Story_Response_JSON","Publish_Error_Stage","Publish_Error_Message","Studio_Publish_Dispatch_At","Studio_Publish_Dispatch_Note","Studio_Publish_Dispatch_Count"];
const unsafe=["IG_Story_Post_ID","Platform_Post_ID","Platform_Media_ID","Publish_Started_At","Publish_Locked_At","Publish_Locked_By","Last_Publish_Attempt_At","Publish_Attempt_Count","Manual_Published_URL","Replace_Transaction_ID","Instagram_Reel_Container_ID","IG_Carousel_Parent_Container_ID","Factory_Review_Handoff_Safety_Hold_At","Studio_Render_Review_Hold_Active","Legal_Hold","Copyright_Hold","SM_2618_Creative_QA_Hold","SM_Factory_Held_Review_Receipt"];
export function story2915ReleaseReady(row) {
 const b=row?.error_messages||{},p=b.SM_Issue2915_Story_Provider_Reconciliation,a=b.SM_Issue2915_Story_Audio_Repair;
 return row?.id===UUID&&row.airtable_record_id===STORY_2915_ID&&row.output_number===5628&&row.content_item_id===CONTENT&&row.content_profile_id===PROFILE&&row.platform==="Instagram"&&row.platform_output_type==="Instagram Story"
 &&row.publish_hold_source==="issue2915_review_and_provider_reconciliation"&&row.do_not_publish===true&&row.auto_publish_enabled===false&&row.publish_retry_eligible===false&&row.output_status==="Ready for Review"&&row.review_status==="Review Sent"&&row.publish_status==="Not Ready"&&row.render_status==="Rendered"&&!row.test_run_id&&!row.published_at&&!row.platform_post_url&&!row.platform_publish_response&&!row.scheduled_post_date&&!row.studio_scheduled_at&&!row.youtube_scheduled_publish_at&&!row.publish_next_retry_at
 &&row.studio_preview_url===URL&&row.final_file_url===DRIVE&&!row.publish_asset_url
 &&a?.candidate_sha256===SHA&&a.candidate_bytes===8368028&&a.candidate_drive_id==="1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV"&&a.provider_container_preserved===OLD&&a.new_upload_authorized===false
 &&p?.account_owned===true&&p.account_username==="miamishining"&&p.original_container_id===OLD&&p.original_container_status==="EXPIRED"&&p.current_story_scan_complete===true&&p.current_story_count===0&&p.candidate_sha256===SHA&&p.provider_writes===0&&p.new_upload_authorized===false
 &&(p.historical_nonpublication_proven===true||p.owner_previously_reported_not_published===true)
 &&Number.isFinite(Date.parse(p.verified_at))&&b.IG_Story_Container_ID===OLD&&b.IG_Story_Status==="Failed"&&b.Studio_Publish_Dispatch_Count===2&&b.IG_Story_Attempt_Count===2&&!b[KEY]&&!unsafe.some(k=>!!b[k]);
}
// Exact owner-directed reconciliation of the already-authenticated held review.
// It is NOT a new Factory click. Only this pinned incident, revision and review
// receipt can enter this alternate generation. The recovery audit is retained.
const HELD_AT="2026-11-24T13:19:27.223Z";
const AUTH_REF="https://github.com/jtl6713/SM-Pipeline-V2/issues/2915#issuecomment-7132839239";
const OWNER="recaKAksAFrEv21RO";
export function story2915HeldApprovalRecoveryReady(row) {
 const b=row?.error_messages||{},h=b.SM_Factory_Held_Review_Receipt;
 if(row?.output_status!=="Approved for Publishing"||row.review_status!=="Approved"||
    h?.decision!=="approve"||h.at!==HELD_AT||!String(h.actor||"").includes("@")||
    h.publishing_authorized!==false||h.publishing_hold_preserved!==true||
    h.incident_creative_only!==false||h.publish_state_at_decision!=="Not Ready"||
    b.SM_Factory_Supabase_Approval_Receipt||b.SM_Issue2915_Held_Approval_Recovery)return false;
 const withoutReceipt={...b};delete withoutReceipt.SM_Factory_Held_Review_Receipt;
 return story2915ReleaseReady({...row,output_status:"Ready for Review",review_status:"Review Sent",error_messages:withoutReceipt});
}
export function story2915HeldRecoveryReceiptValid(record) {
 if(!story2915GenerationValid(record))return false;
 const f=record.fields||record.error_messages||{},g=f[KEY],h=f.SM_Factory_Held_Review_Receipt,
  a=f.SM_Factory_Supabase_Approval_Receipt,r=f.SM_Issue2915_Held_Approval_Recovery;
 return h?.decision==="approve"&&h.at===HELD_AT&&typeof h.actor==="string"&&h.actor.includes("@")&&
  h.publishing_authorized===false&&h.publishing_hold_preserved===true&&h.incident_creative_only===false&&h.publish_state_at_decision==="Not Ready"&&
  r?.authorization_ref===AUTH_REF&&r.authority==="owner_directed_recovery"&&r.actor_record_id===OWNER&&r.original_held_review_at===HELD_AT&&
  r.asset_sha256===SHA&&r.original_container_id===OLD&&r.reconciled_at===g.released_at&&r.no_new_factory_submission===true&&
  g.release_actor===OWNER&&g.release_actor_provenance==="owner_directed_recovery"&&
  a?.actor_provenance==="authenticated_held_review_owner_directed_recovery"&&a.approval_actor_record_id===OWNER&&
  a.original_held_review_at===HELD_AT&&a.approved_at===r.reconciled_at&&
  a.request_id==="issue2915-held-review-recovery-5628"&&a.profile_record_id==="recpNlNn6U6eq0M9r";
}
export async function verifyStory2915Bytes(fetchImpl=fetch) {
 const res=await fetchImpl(URL,{method:"GET",redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!res.ok||!/^video\/mp4(?:;|$)/i.test(res.headers.get("content-type")||"")||Number(res.headers.get("content-length"))!==8368028)throw Error("Corrected Story media verification failed");
 const bytes=await res.arrayBuffer();
 if(bytes.byteLength!==8368028)throw Error("Corrected Story media size changed");
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
 if(digest!==SHA)throw Error("Corrected Story media hash changed");
}
export function story2915ReleasePatch(row,actor,at) {
 if(!story2915ReleaseReady(row)||!REC.test(actor)||!Number.isFinite(Date.parse(at)))throw Error("Exact expired Story recovery proof unavailable");
 const bag={...row.error_messages},previous={};
 for(const k of oldKeys)if(Object.hasOwn(bag,k)){previous[k]=bag[k];delete bag[k];}
 // The old provider attempt remains immutable audit evidence; only the new
 // operational generation is clean. Do not discard historical counters.
 bag[KEY]={version:1,output_record_id:STORY_2915_ID,output_number:5628,generation:"vizcaya-"+SHA,asset_sha256:SHA,asset_url:URL,original_container_id:OLD,original_attempts:previous,release_actor:actor,released_at:at,provider_proof_at:bag.SM_Issue2915_Story_Provider_Reconciliation.verified_at,owner_reported_not_published:bag.SM_Issue2915_Story_Provider_Reconciliation.owner_previously_reported_not_published===true,historical_nonpublication_proven:bag.SM_Issue2915_Story_Provider_Reconciliation.historical_nonpublication_proven===true,approval_required:true};
 bag.IG_Story_Status="Ready";bag.IG_Story_Asset_URL=URL;
 return {error_messages:bag,publish_asset_url:URL};
}
export function story2915GenerationValid(record) {
 const f=record?.fields||record?.error_messages||{},g=f[KEY],p=f.SM_Issue2915_Story_Provider_Reconciliation;
 if(!g)return false;
 return (record.id===STORY_2915_ID||record.airtable_record_id===STORY_2915_ID)&&g.output_record_id===STORY_2915_ID&&g.output_number===5628&&g.version===1&&g.generation==="vizcaya-"+SHA&&g.asset_sha256===SHA&&g.asset_url===URL&&g.original_container_id===OLD&&g.original_attempts?.IG_Story_Container_ID===OLD&&g.original_attempts?.Studio_Publish_Dispatch_Count===2&&g.original_attempts?.IG_Story_Attempt_Count===2&&REC.test(g.release_actor||"")&&Number.isFinite(Date.parse(g.released_at))&&g.approval_required===true&&p?.account_owned===true&&p.account_username==="miamishining"&&p.original_container_status==="EXPIRED"&&p.candidate_sha256===SHA&&p.verified_at===g.provider_proof_at&&(g.owner_reported_not_published===true||g.historical_nonpublication_proven===true)
 &&(record.fields?.Publish_Asset_URL??record.publish_asset_url)===URL&&(record.fields?.Studio_Preview_URL??record.studio_preview_url)===URL&&(record.fields?.Final_File_URL??record.final_file_url)===DRIVE;
}
export function story2915NewApprovalValid(record,actor,submittedAt) {
 const g=(record?.fields||record?.error_messages||{})[KEY];
 return story2915GenerationValid(record)&&REC.test(actor||"")&&Number.isFinite(Date.parse(submittedAt))&&Date.parse(submittedAt)>=Date.parse(g.released_at);
}
export function story2915DispatchFence(record) {
 if(!story2915GenerationValid(record))throw Error("Expired Story generation invalid");
 const f=record.fields,g=f[KEY],a=f.SM_Factory_Supabase_Approval_Receipt;
 if(a?.authority!=="supabase"||a.output_record_id!==STORY_2915_ID||a.output_number!==5628||(a.actor_provenance!=="authenticated_factory_submission"&&!story2915HeldRecoveryReceiptValid(record))||a.scheduled!==true||!REC.test(a.approval_actor_record_id||"")||!(Date.parse(a.approved_at)>=Date.parse(g.released_at))||Date.parse(a.scheduled_for)!==Date.parse(f.Scheduled_Post_Date))throw Error("Fresh authenticated Story approval/schedule required");
 return "studio/state/initial-publish-fence/v1/"+STORY_2915_ID+"/"+g.generation+".json";
}
