/** Explicit authorized formal-review release. No approval or provider action. */
import {story2915ReleaseReady,story2915ReleasePatch,verifyStory2915Bytes} from "./story-expired-generation-2915.mjs";
import {factorySupabaseApprovalRows} from "./factory-supabase-approval.mjs";
import {supabaseRest} from "./supabase-pipeline-reads.mjs";
import {classifyAdminPublishingHold} from "./admin-publishing-holds.mjs";
import {evaluateReviewPackage, factoryApprovalHoldReleaseEligibility, verifyReviewImages} from "./review-package-readiness.mjs";
import {assertSupabaseNativeGalleryPublicationPackage} from "./native-gallery-package-guard.mjs";

const REC=/^rec[A-Za-z0-9]{14}$/;
const deny=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const eq=(key,v)=>key+"="+(v==null?"is.null":"eq."+encodeURIComponent(String(v)));
const noSchedule=row=>!row.scheduled_post_date&&!row.studio_scheduled_at&&!row.youtube_scheduled_publish_at&&!row.published_at&&!row.platform_post_url;
export function formalReleaseBlock(row) {
  if(!row||row.do_not_publish!==true)return "Output has no active publishing hold";
  if(row.output_status!=="Ready for Review"||!["","Review Sent","Pending Review"].includes(String(row.review_status||""))||row.publish_status!=="Not Ready")return "Output is not awaiting formal review";
  if(row.auto_publish_enabled===true||!noSchedule(row)||row.platform_publish_response)return "Existing schedule or provider evidence requires reconciliation";
  const bag=row.error_messages||{};
  if(row.publish_hold_source==="issue2915_review_and_provider_reconciliation"||bag.SM_Issue2915_Story_Audio_Repair?.new_upload_authorized===false)
    return story2915ReleaseReady(row)?null:"Corrected Story: exact expired-container recovery or corrected-media evidence is incomplete. No hold released.";
  if(bag.SM_2618_Creative_QA_Hold?.publishing_permitted===false)return "Unresolved creative QA media correction";
  const decision=classifyAdminPublishingHold(row);
  return decision.releasable?null:decision.block_reason;
}
export async function releaseFactoryHoldInSupabase(env,id,auth,{
  read=factorySupabaseApprovalRows,rest=supabaseRest,verifyImages=verifyReviewImages,verifyGallery=assertSupabaseNativeGalleryPublicationPackage,verifyStory=verifyStory2915Bytes,
}={}) {
  if(!REC.test(String(id||"")))deny("Exact platform output required",400);
  if(!auth?.authenticated||!auth.authorized||auth.permissions?.outputs_review!==true||
    !(auth.permissions.publishing_control===true||auth.permissions.tenant_admin===true)||
    !REC.test(String(auth.user?.record_id||"")))deny("Authorized reviewer with hold control required",403);
  const entry=(await read(env,[id])).get(id),row=entry?.row,actor=auth.user.record_id;
  if(!row||row.airtable_record_id!==id||!Array.isArray(auth.authorized_profile_ids)||!auth.authorized_profile_ids.includes(entry.profileId))deny("Output not available in authorized profiles",404);
  const blocker=formalReleaseBlock(row);if(blocker)deny(blocker);
  const current=entry.record,readiness=evaluateReviewPackage(current);
  const eligible=factoryApprovalHoldReleaseEligibility(current, readiness);
  if(!eligible.eligible)deny(eligible.reason);
  await verifyGallery(env,row);
  const verified=await verifyImages(readiness);
  if(verified?.readiness!=="READY")deny("Review media could not be verified; no hold released");
  if(!row.id||!row.updated_at)deny("Output revision missing");
  const storyReplacement=story2915ReleaseReady(row);
  if(storyReplacement)await verifyStory();
  const stamp=new Date().toISOString();
  const note="Factory formal-review release. No approval, schedule or publication authorized.";
  const selector="platform_outputs?"+[
    eq("id",row.id),eq("airtable_record_id",id),eq("updated_at",row.updated_at),eq("publish_hold_set_at",row.publish_hold_set_at),
    eq("output_status",row.output_status),eq("review_status",row.review_status),eq("publish_status",row.publish_status),
    "do_not_publish=eq.true",eq("auto_publish_enabled",row.auto_publish_enabled),
    "scheduled_post_date=is.null","studio_scheduled_at=is.null","youtube_scheduled_publish_at=is.null","published_at=is.null","platform_post_url=is.null",
  ].join("&");
  const changed=await rest(env,selector,{method:"PATCH",headers:{Prefer:"return=representation"},body:{
    do_not_publish:false,auto_publish_enabled:false,publish_retry_eligible:false,updated_at:stamp,
    publish_hold_release_actor:actor,publish_hold_release_note:note,
    ...(storyReplacement?story2915ReleasePatch(row,actor,stamp):{}),
  }});
  if(!Array.isArray(changed)||changed.length!==1||changed[0].airtable_record_id!==id)deny("Hold revision changed; no release confirmed");
  const after=(await read(env,[id])).get(id)?.row;
  if(!after||after.id!==row.id||after.do_not_publish!==false||after.auto_publish_enabled!==false||
    after.publish_retry_eligible!==false||!noSchedule(after)||after.output_status!==row.output_status||
    after.review_status!==row.review_status||after.publish_status!==row.publish_status||
    after.publish_hold_release_actor!==actor||!after.publish_hold_released_at||
    (storyReplacement&&(!after.error_messages?.SM_Issue2915_Story_Replacement_Generation||after.error_messages?.IG_Story_Container_ID||after.publish_asset_url!==row.studio_preview_url)))
    deny("Supabase release readback incomplete; inspect status before retrying",503);
  return {id,released:true,auto_publish_enabled:false,approved:false,scheduled:false,published:false,
    message:"Publishing hold released for formal review in Supabase. Preview and separately approve. Nothing was scheduled or published."};
}
