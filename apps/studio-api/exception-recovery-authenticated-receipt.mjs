/**
 * Stronger evidence contract for unattended status-only recovery.
 * Uses the existing profile uploader's authenticated GET adapters. Never upload,
 * finalize, publish, or infer ownership from an API-key/public lookup.
 */
export async function verifyAuthenticatedYouTubeReceipt(row, {
  settings = {}, expectedChannelId, fetcher = fetch, now = Date.now,
} = {}) {
  const at = new Date(now()).toISOString();
  const deny = evidence => ({verified_public:false, ownership_verified:false,
    platform:"YouTube", evidence, checked_at:at, read_only:true});
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
  const get = async path => {
    const response = await fetcher(base.href.replace(/\/$/,"") + path, {
      method:"GET", redirect:"error", signal:AbortSignal.timeout(10000),
      headers:{"X-SM-Pipeline-Key":secret, Accept:"application/json"},
    });
    if(!response.ok) throw new Error("provider_readback_rejected");
    return response.json();
  };
  try {
    const owner = await get("/youtube/oauth/status");
    if(owner.refresh_ok !== true || owner.channel_identity_ok !== true ||
       owner.channel_id !== expectedChannelId) return deny("authenticated_channel_mismatch");
    const result = await get("/youtube/videos/" + id);
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
  } catch { return deny("authenticated_provider_unavailable"); }
}

