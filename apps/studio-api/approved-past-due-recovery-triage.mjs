/** Supabase-only, no-provider-write classification for approved past-due outputs.
 * A recovery group is NOT proof that an output is safe to publish.
 */
const str=(v)=>String(v??"").trim();
const field=(record,name,snake)=> record?.fields?.[name] ?? record?.[snake] ?? record?.error_messages?.[name] ?? null;
const dateMs=(value)=>{const ms=Date.parse(str(value));return Number.isFinite(ms)?ms:null;};
const truth=(value)=>value===true || value===1 || value==="true";
import { assessFreshSupabasePublish } from "./approved-publish-flow.mjs";

// #3096: evidence is independent of the display/retry label. In particular,
// a dispatch timestamp before the current slot is NOT proof of non-delivery.
const REMOTE_KEYS=[
  "YouTube_Video_ID","YouTube_Upload_Job_ID","Platform_Media_ID","Platform_Post_ID",
  "TikTok_Draft_Publish_ID","IG_Story_Container_ID","IG_Story_Post_ID",
  "Instagram_Reel_Container_ID","IG_Carousel_Parent_Container_ID",
  "IG_Carousel_Published_Media_ID","FB_Slideshow_Meta_Video_ID",
];
const NATIVE_COUNTERS=[
  "Publish_Attempt_Count","IG_Story_Attempt_Count",
  "IG_Carousel_Parent_Poll_Attempt_Count","TikTok_Draft_Poll_Attempt_Count",
  "FB_Slideshow_Attempt_Count","IG_Carousel_Publish_Attempt_Count",
];
const hasCount=v=>str(v)!=="" && (!Number.isFinite(Number(v)) || Number(v)!==0);
const hasResponse=v=>{
  if(v==null || v===false) return false;
  if(typeof v==="object") return Object.keys(v).length>0;
  return !["","null","{}","[]"].includes(str(v));
};
function dispatchEvidence(row,nowMs) {
  const read=name=>field(row,name,name.toLowerCase());
  const remote=REMOTE_KEYS.some(name=>Boolean(str(read(name))));
  const native=NATIVE_COUNTERS.some(name=>hasCount(read(name)))
    || ["Last_Publish_Attempt_At","Publish_Started_At","IG_Story_Last_Attempt_At","Publish_Locked_By","Publish_Locked_At"]
      .some(name=>Boolean(str(read(name))))
    || hasResponse(read("Platform_Publish_Response"))
    || hasResponse(read("Platform_Publish_Response_JSON"))
    || ["FB_Slideshow_Response_JSON","IG_Story_Response_JSON","IG_Carousel_Parent_Response_JSON",
      "IG_Carousel_Publish_Response_JSON","TikTok_Draft_Response_JSON","YouTube_Response_JSON"]
      .some(name=>hasResponse(read(name)));
  const dispatchAt=dateMs(read("Studio_Publish_Dispatch_At"));
  const scheduledAt=dateMs(read("Scheduled_Post_Date"));
  const dispatchPresent=Boolean(str(read("Studio_Publish_Dispatch_At")))
    || hasCount(read("Studio_Publish_Dispatch_Count"))
    || Boolean(str(read("Studio_Publish_Dispatch_Note")));
  const note=str(read("Studio_Publish_Dispatch_Note"));
  const heldUntil=/^held until (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/i.exec(note);
  const approvalAt=dateMs(read("Review_Decision_At"));
  const explicitEarlyHold=!remote&&!native
    && Number(read("Studio_Publish_Dispatch_Count"))===1
    && dispatchAt!==null&&scheduledAt!==null&&dispatchAt<scheduledAt&&scheduledAt<=nowMs
    && approvalAt!==null&&dispatchAt>=approvalAt&&dispatchAt-approvalAt<=30000
    && str(read("Review_Status"))==="Approved"&&str(read("Output_Status"))==="Approved for Publishing"
    && !["Test_Run_ID","Published_At","Platform_Post_URL","Manual_Published_URL",
      "Publish_Error_Stage","Publish_Error_Message"].some(name=>str(read(name)))
    && heldUntil!==null&&dateMs(heldUntil[1])===scheduledAt;
  let evidence_state="no_saved_attempt_evidence";
  if(remote) evidence_state="saved_remote_identity";
  else if(native) evidence_state="native_attempt_or_response";
  else if(explicitEarlyHold) evidence_state="explicit_early_hold_requires_audit";
  else if(dispatchPresent) evidence_state="ambiguous_dispatch";
  return {evidence_state,remote,native,dispatchAt,scheduledAt};
}

export function classifyApprovedPastDueOutput(row,{nowMs=Date.now()}={}) {
  const read=(name,snake)=>field(row,name,snake);
  const platform=str(read("Platform","platform"));
  const outputType=str(read("Platform_Output_Type","platform_output_type"));
  const publish=str(read("Publish_Status","publish_status"));
  const dispatchNote=str(read("Studio_Publish_Dispatch_Note","studio_publish_dispatch_note"));
  const errorStage=str(read("Publish_Error_Stage","publish_error_stage"));
  const nativeErrors=[dispatchNote,read("FB_Slideshow_Response_JSON","fb_slideshow_response_json"),
    read("IG_Story_Response_JSON","ig_story_response_json"),read("Publish_Error_Message","publish_error_message")]
    .map(v=>typeof v==="object"?JSON.stringify(v):str(v)).join(" ");
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
  const evidence=dispatchEvidence(row,nowMs);
  const hasRemote=evidence.remote;
  const firstPublish=assessFreshSupabasePublish(row,{nowMs});
  const stage=str(read("FB_Slideshow_Status","fb_slideshow_status"));
  const fbStatus=str(read("FB_Publish_Status","fb_publish_status"));
  const storyStatus=str(read("IG_Story_Status","ig_story_status"));
  const out={
    record_id:str(row?.id || row?.airtable_record_id),
    output_id:read("Output_ID","output_number")??null, platform, output_type:outputType,
    publish_status:publish, attempts, has_saved_remote_identity:hasRemote,
    hold_active:held,auto_publish_enabled:auto,retry_eligible:retryEligible,
    evidence_state:evidence.evidence_state,
    native_attempt_evidence:evidence.native,
    dispatch_at:evidence.dispatchAt===null?null:new Date(evidence.dispatchAt).toISOString(),
    scheduled_at:evidence.scheduledAt===null?null:new Date(evidence.scheduledAt).toISOString(),
    first_publish_gate_reason:firstPublish.reason,
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
  if(/RATE_LIMIT/i.test(errorStage)||/limit how often|request limit reached/i.test(nativeErrors)) return assign("E. Platform cooldown/rate restriction","Studio + User","Honor provider cooldown and check current connection state");
  if(/session has been invalidated|log in to www\.facebook\.com|Page Access Token|subject does not have permission to post videos|error validating access token/i.test(nativeErrors)) return assign("F. Meta authentication","User","Reconnect/validate impacted Page and Instagram permissions");
  if(retryAt!==null&&retryAt>nowMs) return assign("H. Cooling down","Studio","Wait until existing retry time; do not shorten");
  if(hasRemote) return assign("N. Existing remote identity","Studio","Authenticated owner-scoped provider readback before any retry");
  // Retry=false/null does not disqualify a genuinely untouched first publish.
  // Reuse the real admission check; never treat this diagnostic as a claim,
  // provider non-delivery proof, or permission to invoke the provider.
  if(firstPublish.eligible && evidence.evidence_state==="no_saved_attempt_evidence")
    return assign("R. Fresh due candidate","Studio","Check approved media and account in the normal fenced first-publish path; no forced retry");
  if(evidence.evidence_state==="explicit_early_hold_requires_audit")
    return assign("S. Historical scheduled hold","Studio","Audit exact original slot and provider history; use existing per-output proof path only after verification");

  if(!retryEligible && (evidence.native || evidence.evidence_state==="ambiguous_dispatch"))
    return assign("T. Ambiguous historical attempt","Studio","Reconcile exact account, provider and dispatch history before any reschedule or retry");
  if(!retryEligible)
    return assign("U. First-publish preflight incomplete","Studio","Resolve the first-publish gate reason; retry eligibility is not a first-attempt requirement");
  if(attempts>=8) return assign("I. Attempts exhausted","Studio","Investigate and reconcile before resetting any attempt cap");
  if(platform==="Facebook"&&outputType==="Facebook Photo Set"&&fbStatus==="Ready for Assets") return assign("J. Facebook photo-package defect","Studio + User","Verify unique ordered slide media and stage readiness; no Graph POST");
  if(platform==="Instagram"&&outputType==="Instagram Story"&&["Failed","Publishing"].includes(storyStatus)) return assign("K. Instagram Story stage repair","Studio","Existing-container/status audit; no new container without proof");
  if(platform==="Facebook"&&outputType==="Facebook Reel"&&stage==="Video Ready") return assign("L. Facebook Reel staging","Studio","Check staged public MP4 and Meta post receipt before resume");
  if(platform==="Instagram"&&outputType==="Instagram Carousel") return assign("M. Instagram carousel repair","Studio","Check child/parent container identities and previous Graph results");
  if(evidence.native||evidence.evidence_state==="ambiguous_dispatch")
    return assign("T. Ambiguous historical attempt","Studio","Reconcile exact account, provider and dispatch history before any reschedule or retry");
  if(publish==="Failed") return assign("O. Failed publishing stage","Studio","Root-cause and repair failed stage; no blanket retry");
  if(publish==="Ready to Schedule") return assign("P. Overdue scheduling","Studio","Check duplicate/publication state; schedule only if never published");
  return assign("Q. Duplicate-safe publication preflight","Studio","Provider and source verification needed before new publish");
}
