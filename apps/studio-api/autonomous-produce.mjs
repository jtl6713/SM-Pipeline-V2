/** Pure helpers for the twice-daily Chicago autonomous produce path. */

export const AUTONOMOUS_WINDOWS = Object.freeze([8, 16]);
export const AUTONOMOUS_NEWS_FEEDS = Object.freeze([
  "https://blockclubchicago.org/feed/",
]);
export const AUTONOMOUS_YOUTUBE_QUERIES = Object.freeze([
  "Chicago",
  "Chicago news today",
  "things to do in Chicago",
]);
export const AUTONOMOUS_STANDARD_PLATFORMS = Object.freeze([
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
]);
export const AUTONOMOUS_REEL_OVERRIDES = Object.freeze({
  Instagram: "Reel",
  Facebook: "Slideshow Reel",
  TikTok: "Video Draft",
  YouTube: "Slideshow Video",
});
export const AUTONOMOUS_CAROUSEL_OVERRIDES = Object.freeze({
  Instagram: "Carousel",
  Facebook: "Multi-Image Post",
  TikTok: "Video Draft",
  YouTube: "Slideshow Video",
});

export function autonomousSlot(chicago) {
  const date = String(chicago?.date || "").trim();
  const hour = Number(chicago?.hour);
  if (!date || !Number.isFinite(hour)) return null;
  if (hour === 8) return `${date}:am`;
  if (hour === 16) return `${date}:pm`;
  return null;
}

export function autonomousInWindow(chicago, cron = "") {
  const hour = Number(chicago?.hour);
  if (hour === 8 || hour === 16) return true;
  return cron === "0 13 * * *" || cron === "0 21 * * *";
}

export function parseAutonomousLastRun(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : { notes: text };
  } catch {
    return { notes: text };
  }
}

export function observationIsRecent(publishedAt, nowMs = Date.now(), maxAgeMs = 48 * 60 * 60 * 1000) {
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= maxAgeMs;
}

export function summarizeObservations(posts, { nowMs = Date.now(), limit = 12 } = {}) {
  return (posts || [])
    .filter((row) => observationIsRecent(row.published_at, nowMs))
    .sort((a, b) => (Number(b.engagement_score || 0) - Number(a.engagement_score || 0))
      || (Date.parse(b.published_at) - Date.parse(a.published_at)))
    .slice(0, limit)
    .map((row) => ({
      source: row.source || "similar_account",
      platform: row.platform || "",
      handle: row.handle || "",
      caption: String(row.caption || "").trim().slice(0, 180),
      published_at: row.published_at,
      engagement_score: Number(row.engagement_score || 0) || 0,
    }));
}

export function parseRssItemTitles(xml, { limit = 8 } = {}) {
  const items = String(xml || "").match(/<item[\s\S]*?<\/item>/gi) || [];
  const titles = [];
  for (const item of items) {
    const match = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = String(match?.[1] || "").replace(/<[^>]+>/g, "").trim();
    if (!title) continue;
    titles.push(title.slice(0, 160));
    if (titles.length >= limit) break;
  }
  return titles;
}

export function youtubePublishedAfterIso(nowMs = Date.now(), maxAgeMs = 48 * 60 * 60 * 1000) {
  return new Date(nowMs - maxAgeMs).toISOString();
}

export function mapYoutubeSearchItems(body, { limit = 8 } = {}) {
  const rows = [];
  for (const item of body?.items || []) {
    const title = String(item?.snippet?.title || "").trim();
    if (!title) continue;
    rows.push({
      source: "youtube",
      title: title.slice(0, 160),
      channel: String(item?.snippet?.channelTitle || "").trim(),
      published_at: item?.snippet?.publishedAt || null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

export function extractJsonObject(text) {
  const raw = String(text || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Picker response was not a JSON object");
  }
  return parsed;
}

export function parseAutonomousPick(parsed) {
  if (parsed?.skip) {
    return {
      skip: true,
      reason: String(parsed.reason || parsed.skip_reason || "picker_skip").trim() || "picker_skip",
    };
  }
  const title = String(parsed?.candidate_title || parsed?.title || "").trim();
  const summary = String(parsed?.idea_summary || parsed?.summary || "").trim();
  const mediaIds = [...new Set((Array.isArray(parsed?.media_asset_ids) ? parsed.media_asset_ids : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const format = String(parsed?.suggested_format || parsed?.content_type || "Vertical Short Video").trim()
    || "Vertical Short Video";
  if (!title || !summary || mediaIds.length < 1) {
    return { skip: true, reason: "picker_incomplete" };
  }
  return {
    skip: false,
    candidate_title: title.slice(0, 80),
    idea_summary: summary.slice(0, 240),
    hook: String(parsed?.hook || "").trim().slice(0, 80),
    primary_location: String(parsed?.primary_location || "").trim().slice(0, 80),
    neighborhood_or_area: String(parsed?.neighborhood_or_area || "").trim().slice(0, 80),
    suggested_visuals: String(parsed?.suggested_visuals || "").trim().slice(0, 160),
    required_assets: String(parsed?.required_assets || "").trim().slice(0, 160),
    why_this_should_work: String(parsed?.why_this_should_work || "").trim().slice(0, 160),
    cited_trend: String(parsed?.cited_trend || "").trim().slice(0, 200),
    content_type: format === "Carousel" || format === "Photo Set" || format === "Feed Post"
      ? format
      : "Vertical Short Video",
    media_asset_ids: mediaIds.slice(0, 12),
  };
}

export function isAutonomousOrigin(text) {
  return String(text || "").includes("origin=autonomous");
}

export const AUTONOMOUS_MAX_MASTER_ASSETS = 12;

export function autonomousMasterMediaIds(assets) {
  const rows = Array.isArray(assets) ? assets : [];
  const originals = rows.filter((row) => !/__\d+x\d+__/i.test(String(row?.name || "")));
  const use = originals.length ? originals : rows;
  return [...new Set(use
    .map((row) => String(row?.media_asset_record_id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
}

export function autonomousIncomingMediaIds(existingAssets, mediaAssetIds, max = AUTONOMOUS_MAX_MASTER_ASSETS) {
  const already = new Set(autonomousMasterMediaIds(existingAssets));
  const incoming = [];
  for (const raw of mediaAssetIds || []) {
    const id = String(raw || "").trim();
    if (!/^rec[A-Za-z0-9]+$/.test(id) || already.has(id) || incoming.includes(id)) continue;
    if (already.size + incoming.length >= max) break;
    incoming.push(id);
  }
  return incoming;
}

export function autonomousPlanOverrides(contentType) {
  if (contentType === "Carousel" || contentType === "Photo Set" || contentType === "Feed Post") {
    return { ...AUTONOMOUS_CAROUSEL_OVERRIDES };
  }
  return { ...AUTONOMOUS_REEL_OVERRIDES };
}

export function buildAutonomousPickerPrompt({ profile, trends, assets, recentTitles }) {
  const profileName = profile?.name || profile?.Profile_Name || "ChicagoShining";
  const avoid = profile?.avoid_topics || profile?.Avoid_Topics || "";
  const voice = profile?.brand_voice || profile?.Brand_Voice || "";
  return `You are ChicagoShining's autonomous producer. Pick ONE idea that is both timely and shootable from the library stills listed.

Return ONLY one raw JSON object. No markdown.

Skip unless a listed library asset clearly matches a listed trend. Do not invent events, dates, prices, or rankings that are not in the harvest. Do not pick generic skyline filler.

ACTIVE PROFILE
Name: ${profileName}
Voice: ${voice}
Avoid topics: ${avoid}

TREND HARVEST (last 48 hours)
${JSON.stringify(trends, null, 2)}

LIBRARY STILLS (use only these media_asset_ids)
${JSON.stringify(assets, null, 2)}

RECENTLY PUBLISHED TITLES (do not duplicate)
${JSON.stringify(recentTitles || [], null, 2)}

If nothing is both timely and producible, return:
{"skip":true,"reason":"no_asset_backed_trend"}

Otherwise return:
{
  "candidate_title": "max 8 words",
  "idea_summary": "one sentence, max 18 words",
  "hook": "max 12 words",
  "primary_location": "max 5 words",
  "neighborhood_or_area": "max 4 words",
  "suggested_visuals": "max 14 words",
  "required_assets": "max 12 words",
  "why_this_should_work": "max 12 words",
  "cited_trend": "which harvest item this follows",
  "suggested_format": "Vertical Short Video or Carousel",
  "media_asset_ids": ["rec..."]
}`;
}
