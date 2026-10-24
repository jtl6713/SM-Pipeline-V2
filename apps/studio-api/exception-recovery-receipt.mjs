/**
 * Live read-only publication evidence. Never trust a saved platform ID as proof
 * of public visibility. No Graph create/publish calls and no Airtable writes.
 * Secrets are only passed to the provider and never exposed to API callers.
 */
const txt = (row, name) => String(row?.fields?.[name] ?? row?.[name] ?? "").trim();
const facebookId = /^\d{6,30}(?:_\d{6,30})?$/;
const numericId = /^\d{6,35}$/;
const youtubeId = /^[A-Za-z0-9_-]{11}$/;
const FACEBOOK_HOST = /^(?:www\.|m\.)?facebook\.com$/i;
const INSTAGRAM_HOST = /^(?:www\.)?instagram\.com$/i;
function trustedUrl(s, hostTest) {
  try {
    const url = new URL(String(s || ""));
    return url.protocol === "https:" && hostTest.test(url.hostname) ? url.href : null;
  } catch { return null; }
}
const unreadable = (platform, reason, at) => ({
  status: "unavailable", platform, verified_public: false,
  remote_id: null, permalink: null, evidence: reason, checked_at: at,
  read_only: true,
});
export async function verifyExistingProviderReceipt(record, { settings = {}, fetcher = fetch, at = new Date().toISOString() } = {}) {
  const platform = txt(record, "Platform");
  const saved = txt(record,"Platform_Post_ID");
  const media = txt(record,"Platform_Media_ID");
  const youtube = txt(record,"YouTube_Video_ID") || saved;
  if (platform === "Facebook" || platform === "Instagram") {
    const id = platform === "Instagram" ? media || saved : saved;
    if (!numericId.test(id) && !(platform === "Facebook" && facebookId.test(id)))
      return unreadable(platform,"valid_existing_remote_id_required",at);
    const token = String(settings.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
    if (!token) return unreadable(platform,"provider_access_not_configured",at);
    const version = /^v\d{1,2}\.\d$/.test(String(settings.FACEBOOK_GRAPH_API_VERSION || ""))
      ? String(settings.FACEBOOK_GRAPH_API_VERSION) : "v26.0";
    const url = new URL("https://graph.facebook.com/" + version + "/" + id);
    url.searchParams.set("fields",platform === "Facebook"
      ? "id,permalink_url,is_published" : "id,permalink,media_type");
    url.searchParams.set("access_token",token);
    let response, data;
    try {
      response = await fetcher(url.href,{method:"GET",signal:AbortSignal.timeout(10000)});
      data = await response.json();
    } catch {
      return unreadable(platform,"provider_request_unavailable",at);
    }
    if (!response.ok || data?.error) return unreadable(platform,"provider_readback_rejected",at);
    if (String(data?.id || "") !== id) return unreadable(platform,"provider_remote_id_mismatch",at);
    const permalink = platform === "Facebook"
      ? trustedUrl(data.permalink_url,FACEBOOK_HOST) : trustedUrl(data.permalink,INSTAGRAM_HOST);
    if (!permalink) return unreadable(platform,"public_permalink_not_confirmed",at);
    // Meta IG /media ID is a published media object. The returned /media ID and
    // permalink are both required, but link accessibility cannot be guaranteed.
    const publicState = platform === "Facebook" ? data.is_published === true : true;
    return {
      status: publicState ? "verified_existing_post" : "pending_or_private",
      platform, verified_public: publicState, remote_id:id, permalink,
      evidence: platform === "Facebook" ? "graph_exact_post_id_published_permalink"
        : "graph_exact_published_media_id_permalink",
      checked_at:at, read_only:true,
    };
  }
  if (platform === "YouTube") {
    if (!youtubeId.test(youtube)) return unreadable(platform,"valid_existing_remote_id_required",at);
    const key = String(settings.YOUTUBE_API_KEY || "").trim();
    if (!key) return unreadable(platform,"provider_access_not_configured",at);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part","status");
    url.searchParams.set("id",youtube);
    url.searchParams.set("key",key);
    let res,data;
    try {
      res = await fetcher(url.href,{method:"GET",signal:AbortSignal.timeout(10000)});
      data = await res.json();
    } catch { return unreadable(platform,"provider_request_unavailable",at); }
    if (!res.ok || data?.error) return unreadable(platform,"provider_readback_rejected",at);
    const found = Array.isArray(data?.items) && data.items.length === 1 ? data.items[0] : null;
    if (found?.id !== youtube) return unreadable(platform,"provider_remote_id_not_publicly_readable",at);
    const publicState = found.status?.privacyStatus === "public";
    return {
      status:publicState ? "verified_existing_post" : "pending_or_private",
      platform,verified_public:publicState,remote_id:youtube,
      permalink: publicState ? "https://www.youtube.com/watch?v="+youtube : null,
      evidence:"youtube_videos_list_exact_id_privacy",
      checked_at:at,read_only:true,
    };
  }
  return unreadable(platform || "Unknown","provider_readback_not_supported",at);
}
