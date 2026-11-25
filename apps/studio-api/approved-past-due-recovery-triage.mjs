/** Supabase-only, no-provider-write classification for approved past-due outputs.
 * A recovery group is NOT proof that an output is safe to publish.
 */
import { assessFreshSupabasePublish } from "./approved-publish-flow.mjs";

const str=(v)=>String(v??"").trim();
const field=(record,name,snake)=> record?.fields?.[name] ?? record?.[snake] ?? record?.error_messages?.[name] ?? null;
const dateMs=(value)=>{const ms=Date.parse(str(value));return Number.isFinite(ms)?ms:null;};
const truth=(value)=>value===true || value===1 || value==="true";
const identity=(row,key)=>str(field(row,key,key.toLowerCase()));
const nonemptyResponse=value=>{
  if(value==null) return false;
  if(typeof value==="object") return Object.keys(value).length>0;
  return !["","{}","[]","null"].includes(str(value));
};
const validZero=value=>value==null || str(value)==="" || (Number.isFinite(Number(value)) && Number(value)===0);

export function classifyApprovedPastDueOutput(row,{nowMs=Date.now()}={}) {
  const read=(name,snake)=>field(row,name,snake);
  const platform=str(read("Platform","platform"));
  const outputType=str(read("Platform_Output_Type","platform_output_type"));
  const publish=str(read("Publish_Status","publish_status"));
  const dispatchNote=str(read("Studio_Publish_Dispatch_Note","studio_publish_dispatch_note"));
  const errorStage=str(read("Publish_Error_Stage","publish_error_stage"));
  const videoId=str(read("YouTube_Video_ID","youtube_video_id"));
  const mediaId=str(read("Platform_Media_ID","platform_media_id"));
  const postId=str(read("Platform_Post_ID","platform_post_id"));
  const draftId=str(read("TikTok_Draft_Publish_ID","tiktok_draft_publish_id"));
  const containerId=str(read("IG_Story_Container_ID","ig_story_container_id"));
  const attempts=Math.max(0,Number(read("Studio_Publish_Dispatch_Count","studio_publish_dispatch_count"))||0);
  const retryAt=dateMs(read("Publish_Next_Retry_At","publish_next_retry_at"));
  const held=truth(read("Do_Not_Publish","do_not_publish"));
  const auto=truth(read("Auto_Publish_Enabled","auto_publish_enabled"));
  const retryEligible=truth(read("Publish_Retry_Eligible","publish_retry_eligible"));
  const hasRemote=Boolean(videoId||mediaId||postId||draftId||containerId||
    ["IG_Story_Post_ID","Instagram_Reel_Container_ID","IG_Carousel_Parent_Container_ID",
     "IG_Carousel_Published_Media_ID","FB_Slideshow_Meta_Video_ID","YouTube_Upload_Job_ID"]
      .some(key=>identity(row,key)));
  const nativeCountNames=["Publish_Attempt_Count","IG_Story_Attempt_Count",
    "FB_Slideshow_Attempt_Count","IG_Carousel_Parent_Poll_Attempt_Count","TikTok_Draft_Poll_Attempt_Count"];
  const priorNative=nativeCountNames.some(key=>!validZero(read(key,key.toLowerCase())))||
    ["Last_Publish_Attempt_At","Publish_Started_At","IG_Story_Last_Attempt_At","Publish_Locked_By","Publish_Locked_At"]
      .some(key=>identity(row,key))||
    nonemptyResponse(read("Platform_Publish_Response_JSON","platform_publish_response"))||
    nonemptyResponse(read("YouTube_Response_JSON","youtube_response_json"));
  const dispatchAt=dateMs(read("Studio_Publish_Dispatch_At","studio_publish_dispatch_at"));
  const dueAt=dateMs(read("Scheduled_Post_Date","scheduled_post_date"));
  const approvalAt=dateMs(read("Review_Decision_At","review_decision_at"));
  const holdMatch=/^held until (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/i.exec(dispatchNote);
  // The original exact schedule-only note + approval clock is positive source
  // evidence, not proof of an external outcome. Missing/blank notes remain
  // ambiguous. The admin census never writes an audited admission marker.
  const explicitEarlyHold=attempts===1&&!priorNative&&!hasRemote&&!errorStage&&
    str(read("Review_Status","review_status"))==="Approved"&&
    str(read("Output_Status","output_status"))==="Approved for Publishing"&&
    !identity(row,"Test_Run_ID")&&
    !identity(row,"Published_At")&&!identity(row,"Platform_Post_URL")&&!identity(row,"Manual_Published_URL")&&
    !identity(row,"Publish_Error_Message")&&holdMatch&&dueAt!==null&&dueAt<=nowMs&&
    dispatchAt!==null&&approvalAt!==null&&dispatchAt>=approvalAt&&dispatchAt-approvalAt<=30000&&
    dispatchAt<dueAt&&dateMs(holdMatch[1])===dueAt;
  const priorDispatch=attempts>0||identity(row,"Studio_Publish_Dispatch_At")||
    !validZero(read("Studio_Publish_Dispatch_Count","studio_publish_dispatch_count"));
  const fresh=assessFreshSupabasePublish(row,{nowMs});
  const dispatchEvidence=hasRemote?"saved_remote_identity":priorNative?"native_attempt_or_lock":
    explicitEarlyHold?"explicit_pre_schedule_hold_candidate":
    priorDispatch?"ambiguous_prior_dispatch":"no_saved_attempt";
  const stage=str(read("FB_Slideshow_Status","fb_slideshow_status"));
  const fbStatus=str(read("FB_Publish_Status","fb_publish_status"));
  const storyStatus=str(read("IG_Story_Status","ig_story_status"));
  const out={
    record_id:str(row?.id || row?.airtable_record_id),
    output_id:read("Output_ID","output_number")??null, platform, output_type:outputType,
    publish_status:publish, attempts, has_saved_remote_identity:hasRemote,
    dispatch_evidence:dispatchEvidence, first_publish_preflight_reason:fresh.reason,
    explicit_early_hold_candidate:Boolean(explicitEarlyHold),
    hold_active:held,auto_publish_enabled:auto,retry_eligible:retryEligible,
    retry_at:retryAt!=null?new Date(retryAt).toISOString():null,
    action_group:"", owner:"Studio", next_action:"",
    // No category, missing ID, or absence of a saved remote ID authorizes Graph POST.
    public_publish_authorized:false, can_repost:false,
  };
  const assign=(group,owner,action)=>Object.assign(out,{action_group:group,owner,next_action:action});
  if(held) return assign("A. Explicit publication hold","User","Review hold separately; do not release automatically");
  if(!auto) return assign("B. Automatic publishing disabled","User","Confirm intended publishing mode or manual handoff");
  if(platform==="TikTok"&&draftId) return assign("C. Existing TikTok draft","User","Check TikTok inbox and exact saved draft; never duplicate delivery");
  if(publish==="Publishing"||(platform==="YouTube"&&videoId)) return assign("D. Existing platform processing","Studio","Authenticated provider readback; reconcile existing upload only");
  if(/RATE_LIMIT/i.test(errorStage)||/limit how often|request limit reached/i.test(dispatchNote)) return assign("E. Platform cooldown/rate restriction","Studio + User","Honor provider cooldown and check current connection state");
  if(/session has been invalidated|log in to www\.facebook\.com|Page Access Token/i.test(dispatchNote)) return assign("F. Meta authentication","User","Reconnect/validate impacted Page and Instagram permissions");
  if(retryAt!==null&&retryAt>nowMs) return assign("H. Cooling down","Studio","Wait until existing retry time; do not shorten");
  if(hasRemote) return assign("N. Existing remote identity","Studio","Authenticated owner-scoped provider readback before any retry");
  if(fresh.eligible && !priorNative && (!priorDispatch||explicitEarlyHold||
      fresh.reason==="audited_pre_schedule_hold_first_publish"))
    return assign("S. Fenced first-publish candidate","Studio","Normal governed due-time publisher must re-read identity, approved media and one-shot fence; no retry flag change");
  if(explicitEarlyHold && !held && auto)
    return assign("R. Historical schedule-only stamp","Studio","Verify original account and media, then use exact audited historical-hold admission; never reset dispatch history");
  if(!retryEligible && (priorDispatch||priorNative))
    return assign("T. Prior dispatch requires reconciliation","Studio","Reconcile original operation/account before any new dispatch; retry eligibility is not proof of delivery");
  if(!retryEligible && !priorDispatch && !priorNative)
    return assign("U. First-publish preflight incomplete","Studio","Resolve first-publish preflight reason; retry flag is not a first-attempt requirement");
  if(attempts>=8) return assign("I. Attempts exhausted","Studio","Investigate and reconcile before resetting any attempt cap");
  if(platform==="Facebook"&&outputType==="Facebook Photo Set"&&fbStatus==="Ready for Assets") return assign("J. Facebook photo-package defect","Studio + User","Verify unique ordered slide media and stage readiness; no Graph POST");
  if(platform==="Instagram"&&outputType==="Instagram Story"&&["Failed","Publishing"].includes(storyStatus)) return assign("K. Instagram Story stage repair","Studio","Existing-container/status audit; no new container without proof");
  if(platform==="Facebook"&&outputType==="Facebook Reel"&&stage==="Video Ready") return assign("L. Facebook Reel staging","Studio","Check staged public MP4 and Meta post receipt before resume");
  if(platform==="Instagram"&&outputType==="Instagram Carousel") return assign("M. Instagram carousel repair","Studio","Check child/parent container identities and previous Graph results");
  if(priorDispatch||priorNative) return assign("T. Prior dispatch requires reconciliation","Studio","Reconcile original operation/account before any new dispatch");
  if(publish==="Failed") return assign("O. Failed publishing stage","Studio","Root-cause and repair failed stage; no blanket retry");
  if(publish==="Ready to Schedule") return assign("P. Overdue scheduling","Studio","Check duplicate/publication state; schedule only if never published");
  return assign("Q. Duplicate-safe publication preflight","Studio","Provider and source verification needed before new publish");
}
