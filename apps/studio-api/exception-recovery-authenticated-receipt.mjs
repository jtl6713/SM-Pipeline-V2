/**
 * Stronger evidence contract for unattended status-only recovery.
 * Uses the existing profile uploader's authenticated GET adapters. Never upload,
 * finalize, publish, or infer ownership from an API-key/public lookup.
 */
export async function verifyAuthenticatedYouTubeReceipt(row, {
  settings = {}, expectedChannelId, fetcher = fetch, now = Date.now,
} = {}) {
  const at = new Date(now()).toISOString();
  const deny = (evidence, provider_diagnostic) => ({verified_public:false, ownership_verified:false,
    platform:"YouTube", evidence, checked_at:at, read_only:true,
    ...(provider_diagnostic ? {provider_diagnostic} : {})});
  const f = row?.fields || {};
  const profiles = f.Content_Profile;
  if(f.Platform !== "YouTube") return deny("provider_not_enabled");
  if(!Array.isArray(profiles) || profiles.length !== 1) return deny("ambiguous_profile");
  const id = String(f.YouTube_Video_ID || f.Platform_Post_ID || "");
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)) return deny("saved_remote_id_required");
  if(f.YouTube_Video_ID && f.Platform_Post_ID && f.YouTube_Video_ID !== f.Platform_Post_ID)
    return deny("conflicting_saved_remote_ids");
  if(!/^UC[A-Za-z0-9_-]{22}$/.test(String(expectedChannelId || "")))
    return deny("expected_profile_channel_not_configured");
  let base;
  try {
    base = new URL(settings.YOUTUBE_UPLOAD_SERVICE_URL);
    if(base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
      return deny("trusted_profile_service_required");
  } catch { return deny("profile_service_unavailable"); }
  const secret = settings.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET;
  if(!secret) return deny("profile_service_auth_missing");
  // HTTP, redirect, timeout and JSON failures must be distinguishable without
  // ever returning credentials, response headers/locations, or upstream bodies.
  let stage = "oauth_status";
  const safe = (category, http_status = null, redirect = false) =>
    ({stage, category, http_status, redirect});
  const fault = (category, status = null, redirect = false) =>
    Object.assign(new Error("authenticated_provider_read_failed"),
      {safe_diagnostic:safe(category, status, redirect)});
  const get = async (path, nextStage) => {
    stage = nextStage;
    let response;
    try {
      response = await fetcher(base.href.replace(/\/$/,"") + path, {
        method:"GET", redirect:"manual", signal:AbortSignal.timeout(10000),
        headers:{"X-SM-Pipeline-Key":secret, Accept:"application/json"},
      });
    } catch (error) {
      throw fault(["TimeoutError","AbortError"].includes(error?.name)
        ? "timeout" : "network_or_transport_error");
    }
    const status = Number.isInteger(response?.status) ? response.status : null;
    // Never follow redirects: they can cross an authentication boundary.
    if(response?.type === "opaqueredirect" || (status >= 300 && status < 400))
      throw fault("redirect_rejected",status,true);
    if(response?.ok !== true) throw fault("http_rejected",status);
    let result;
    try { result = await response.json(); }
    catch { throw fault("invalid_json",status); }
    if(!result || typeof result !== "object" || Array.isArray(result))
      throw fault("invalid_response_shape",status);
    return result;
  };
  try {
    const owner = await get("/youtube/oauth/status","oauth_status");
    if(typeof owner.refresh_ok !== "boolean" || typeof owner.channel_identity_ok !== "boolean" ||
       typeof owner.channel_id !== "string") throw fault("invalid_response_shape");
    if(owner.refresh_ok !== true || owner.channel_identity_ok !== true ||
       owner.channel_id !== expectedChannelId) return deny("authenticated_channel_mismatch");
    const result = await get("/youtube/videos/" + id,"video_details");
    if(!Array.isArray(result.items)) throw fault("invalid_response_shape");
    const video = Array.isArray(result.items) && result.items.length === 1 ? result.items[0] : null;
    if(video?.id !== id) return deny("video_missing_deleted_or_inaccessible");
    if(video.snippet?.channelId !== expectedChannelId) return deny("video_channel_mismatch");
    if(!["public","private","unlisted"].includes(video.status?.privacyStatus) || video.status?.uploadStatus !== "processed")
      return deny("upload_not_processed");
    const publicNow = video.status?.privacyStatus === "public" && !video.status?.publishAt &&
      video.snippet?.liveBroadcastContent !== "upcoming";
    const published = Date.parse(video.snippet?.publishedAt);
    if(publicNow && (!Number.isFinite(published) || published > now()))
      return deny("publication_timestamp_unverified");
    // A private, processed video is a valid Studio handoff. If Studio has
    // already recorded an explicit YouTube schedule, the provider must confirm
    // the same publishAt; successful upload alone cannot prove scheduling.
    const expectedSchedule=Date.parse(f.YouTube_Scheduled_Publish_At||"");
    const providerSchedule=Date.parse(video.status?.publishAt||"");
    if(!publicNow && Number.isFinite(expectedSchedule) && (
      !Number.isFinite(providerSchedule) ||
      Math.abs(providerSchedule-expectedSchedule)>1000))
      return deny("scheduled_handoff_mismatch");
    if(Number.isFinite(providerSchedule) && providerSchedule<=now() && !publicNow)
      return deny("provider_scheduled_release_overdue");
    return {platform:"YouTube", verified_public:publicNow, verified_delivery:true, ownership_verified:true,
      profile_id:profiles[0], channel_id:expectedChannelId, remote_id:id,
      permalink:"https://www.youtube.com/watch?v=" + id,
      published_at:publicNow?new Date(published).toISOString():null,
      scheduled_at:video.status?.publishAt||null, checked_at:new Date(now()).toISOString(),
      evidence:publicNow?"oauth_owned_channel_exact_public_processed_video":
        "oauth_owned_channel_exact_processed_delivery", read_only:true,
      summary:{privacy_status:video.status.privacyStatus,upload_status:video.status.uploadStatus,
        scheduled_at:video.status?.publishAt||null,channel_id:expectedChannelId}};
  } catch (error) {
    return deny("authenticated_provider_unavailable",error?.safe_diagnostic || safe("unexpected_failure"));
  }
}



/**
 * Exact published Instagram feed post, proven as a member of the configured
 * profile's IG Business account media edge. A saved media/container ID or
 * permalink on its own is NOT publication or account-ownership proof.
 * This adapter has no Graph mutation capability.
 */
export async function verifyAuthenticatedInstagramReceipt(row, {
  settings = {}, expectedAccountId, fetcher = fetch, now = Date.now,
} = {}) {
  const at = new Date(now()).toISOString();
  const deny = evidence => ({
    platform:"Instagram",verified_public:false,verified_delivery:false,
    ownership_verified:false,checked_at:at,evidence,read_only:true,
  });
  const f = row?.fields || {};
  if(f.Platform !== "Instagram") return deny("provider_not_enabled");
  if(!Array.isArray(f.Content_Profile) || f.Content_Profile.length !== 1)
    return deny("ambiguous_profile");
  const type = String(f.Platform_Output_Type || f.Studio_Output_Type || "");
  if(/story/i.test(type)) return deny("instagram_story_membership_adapter_not_enabled");
  const candidates = [f.Platform_Post_ID,f.IG_Carousel_Published_Media_ID]
    .filter(Boolean).map(x => String(x).trim());
  const ids = [...new Set(candidates)];
  if(ids.length !== 1 || !/^\d{6,35}$/.test(ids[0]))
    return deny("exact_published_media_id_required");
  const id=ids[0], account=String(expectedAccountId || "").trim();
  if(!/^\d{6,35}$/.test(account)) return deny("profile_instagram_account_not_configured");
  const token=String(settings.META_GRAPH_API_ACCESS_TOKEN || "").trim();
  if(!token) return deny("profile_instagram_token_not_configured");
  const version=/^v\d{1,2}\.\d$/.test(String(settings.META_GRAPH_API_VERSION||""))
    ?String(settings.META_GRAPH_API_VERSION):"v26.0";
  const seen=new Set();
  let cursor="";
  for(let page=0;page<5;page++){
    const url=new URL("https://graph.facebook.com/"+version+"/"+account+"/media");
    url.searchParams.set("fields","id,permalink,timestamp,media_type");
    url.searchParams.set("limit","100");
    if(cursor) url.searchParams.set("after",cursor);
    let response,data;
    try {
      response=await fetcher(url.href,{method:"GET",redirect:"manual",
        signal:AbortSignal.timeout(10000),
        headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
      if(response?.ok!==true || response?.status>=300 && response.status<400)
        return deny("authenticated_account_media_read_rejected");
      data=await response.json();
    } catch { return deny("authenticated_account_media_unavailable"); }
    if(!Array.isArray(data?.data) || data?.error)
      return deny("authenticated_account_media_invalid");
    const matches=data.data.filter(x=>String(x?.id||"")===id);
    if(matches.length>1) return deny("ambiguous_account_media_membership");
    if(matches.length===1) {
      const media=matches[0];
      let permalink;
      try {
        permalink=new URL(String(media.permalink||""));
        if(permalink.protocol!=="https:" ||
          !["instagram.com","www.instagram.com"].includes(permalink.hostname.toLowerCase()) ||
          !/^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(permalink.pathname) ||
          permalink.username || permalink.password || permalink.port)
          return deny("provider_public_permalink_invalid");
      } catch {return deny("provider_public_permalink_invalid");}
      const timestamp=Date.parse(String(media.timestamp||""));
      if(!Number.isFinite(timestamp) || timestamp>now())
        return deny("provider_publication_timestamp_invalid");
      return {platform:"Instagram",verified_public:true,verified_delivery:true,
        ownership_verified:true,profile_id:f.Content_Profile[0],remote_id:id,
        account_id:account,permalink:permalink.href,
        published_at:new Date(timestamp).toISOString(),checked_at:new Date(now()).toISOString(),
        evidence:"account_scoped_graph_media_membership_exact_id_permalink_timestamp",
        read_only:true,summary:{media_type:String(media.media_type||""),account_id:account}};
    }
    const next=String(data.paging?.cursors?.after||"");
    if(!next) return deny("published_media_not_in_account");
    if(next.length>1024 || seen.has(next))
      return deny("account_media_pagination_invalid");
    seen.add(next);cursor=next;
  }
  return deny("published_media_not_within_bounded_account_window");
}
