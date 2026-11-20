/** Supabase-only, no-provider-write classification for approved past-due outputs.
 * A recovery group is NOT proof that an output is safe to publish.
 */
const str=(v)=>String(v??"").trim();
const field=(record,name,snake)=> record?.fields?.[name] ?? record?.[snake] ?? record?.error_messages?.[name] ?? null;
const dateMs=(value)=>{const ms=Date.parse(str(value));return Number.isFinite(ms)?ms:null;};
const truth=(value)=>value===true || value===1 || value==="true";
const identity=(row,key)=>str(field(row,key,key.toLowerCase()));

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
  const hasRemote=Boolean(videoId||mediaId||postId||draftId||containerId);
  const stage=str(read("FB_Slideshow_Status","fb_slideshow_status"));
  const fbStatus=str(read("FB_Publish_Status","fb_publish_status"));
  const storyStatus=str(read("IG_Story_Status","ig_story_status"));
  const out={
    record_id:str(row?.id || row?.airtable_record_id),
    output_id:read("Output_ID","output_number")??null, platform, output_type:outputType,
    publish_status:publish, attempts, has_saved_remote_identity:hasRemote,
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
  if(!retryEligible) return assign("G. Retry prohibited or unconfirmed","User + Studio","Investigate denied/null retry gate without re-enabling automatically");
  if(retryAt!==null&&retryAt>nowMs) return assign("H. Cooling down","Studio","Wait until existing retry time; do not shorten");
  if(attempts>=8) return assign("I. Attempts exhausted","Studio","Investigate and reconcile before resetting any attempt cap");
  if(platform==="Facebook"&&outputType==="Facebook Photo Set"&&fbStatus==="Ready for Assets") return assign("J. Facebook photo-package defect","Studio + User","Verify unique ordered slide media and stage readiness; no Graph POST");
  if(platform==="Instagram"&&outputType==="Instagram Story"&&["Failed","Publishing"].includes(storyStatus)) return assign("K. Instagram Story stage repair","Studio","Existing-container/status audit; no new container without proof");
  if(platform==="Facebook"&&outputType==="Facebook Reel"&&stage==="Video Ready") return assign("L. Facebook Reel staging","Studio","Check staged public MP4 and Meta post receipt before resume");
  if(platform==="Instagram"&&outputType==="Instagram Carousel") return assign("M. Instagram carousel repair","Studio","Check child/parent container identities and previous Graph results");
  if(hasRemote) return assign("N. Existing remote identity","Studio","Authenticated owner-scoped provider readback before any retry");
  if(publish==="Failed") return assign("O. Failed publishing stage","Studio","Root-cause and repair failed stage; no blanket retry");
  if(publish==="Ready to Schedule") return assign("P. Overdue scheduling","Studio","Check duplicate/publication state; schedule only if never published");
  return assign("Q. Duplicate-safe publication preflight","Studio","Provider and source verification needed before new publish");
}
