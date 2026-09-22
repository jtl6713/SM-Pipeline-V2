const NULLISH = new Set([null, undefined, ""]);

export const ANALYTICS_SCHEMA_VERSION = 2;

export function nullableNumber(value) {
  if (NULLISH.has(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function analyticsAgeHours(publishedAt, measuredAt = new Date().toISOString()) {
  const published = Date.parse(String(publishedAt || ""));
  const measured = Date.parse(String(measuredAt || ""));
  if (!Number.isFinite(published) || !Number.isFinite(measured) || measured < published) return null;
  return (measured - published) / 3600000;
}

export function analyticsCadenceForAgeHours(ageHours) {
  const age = Number(ageHours);
  if (!Number.isFinite(age) || age < 0) return { bucketHours: 4, refreshHours: 4, label: "unknown" };
  if (age < 6) return { bucketHours: 2, refreshHours: 2, label: "first-6h" };
  if (age < 24) return { bucketHours: 4, refreshHours: 4, label: "first-24h" };
  if (age < 48) return { bucketHours: 8, refreshHours: 8, label: "first-48h" };
  if (age < 168) return { bucketHours: 24, refreshHours: 24, label: "days-3-7" };
  if (age < 336) return { bucketHours: 48, refreshHours: 48, label: "days-8-14" };
  if (age < 720) return { bucketHours: 96, refreshHours: 96, label: "days-15-30" };
  return { bucketHours: 720, refreshHours: 720, label: "mature" };
}

export function analyticsMeasurementBucket(publishedAt, measuredAt = new Date().toISOString()) {
  const age = analyticsAgeHours(publishedAt, measuredAt);
  const cadence = analyticsCadenceForAgeHours(age);
  if (age === null) return `${cadence.label}:unknown`;
  const start = Math.floor(age / cadence.bucketHours) * cadence.bucketHours;
  return `${cadence.label}:h${start}`;
}

export function analyticsNextSyncAt(publishedAt, measuredAt = new Date().toISOString()) {
  const age = analyticsAgeHours(publishedAt, measuredAt);
  const cadence = analyticsCadenceForAgeHours(age);
  const base = Date.parse(measuredAt);
  if (!Number.isFinite(base)) return null;
  return new Date(base + cadence.refreshHours * 3600000).toISOString();
}

function sumKnown(values) {
  const known = values.map(nullableNumber).filter((v) => v !== null);
  return known.length ? known.reduce((sum, v) => sum + v, 0) : null;
}

export function normalizeAnalyticsSnapshot(platform, raw = {}, context = {}) {
  const likes = nullableNumber(raw.likes ?? raw.like_count);
  const comments = nullableNumber(raw.comments ?? raw.comment_count);
  const shares = nullableNumber(raw.shares ?? raw.share_count);
  const saves = nullableNumber(raw.saves ?? raw.saved);
  const totalInteractions = nullableNumber(raw.total_interactions) ?? sumKnown([likes, comments, shares, saves]);
  const measuredAt = context.measuredAt || new Date().toISOString();
  const publishedAt = context.publishedAt || raw.published_at || raw.timestamp || null;
  return {
    schema_version: ANALYTICS_SCHEMA_VERSION,
    platform: String(platform || "").trim(),
    source: context.source || raw.source || String(platform || "").toLowerCase(),
    native_post_id: String(context.nativePostId || raw.id || "").trim() || null,
    published_at: publishedAt,
    fetched_at: measuredAt,
    age_hours: analyticsAgeHours(publishedAt, measuredAt),
    measurement_bucket: analyticsMeasurementBucket(publishedAt, measuredAt),
    next_sync_at: analyticsNextSyncAt(publishedAt, measuredAt),
    views: nullableNumber(raw.views ?? raw.view_count),
    reach: nullableNumber(raw.reach),
    likes,
    comments,
    shares,
    saves,
    total_interactions: totalInteractions,
    engaged_views: nullableNumber(raw.engaged_views ?? raw.engagedViews),
    watch_time_sec: nullableNumber(raw.watch_time_sec),
    average_view_duration_sec: nullableNumber(raw.average_view_duration_sec ?? raw.averageViewDuration),
    average_percentage_viewed: nullableNumber(raw.average_percentage_viewed ?? raw.averageViewPercentage),
    audience_gained: nullableNumber(raw.audience_gained ?? raw.followers_gained ?? raw.subscribersGained ?? raw.follows),
    audience_lost: nullableNumber(raw.audience_lost ?? raw.followers_lost ?? raw.subscribersLost),
    duration_sec: nullableNumber(raw.duration_sec ?? raw.duration),
    platform_metrics: raw.platform_metrics && typeof raw.platform_metrics === "object" ? raw.platform_metrics : raw,
  };
}

export function nativePlatformId(platform, fields = {}) {
  const name = String(platform || fields.Platform || "").toLowerCase();
  if (name === "youtube") return String(fields.YouTube_Video_ID || fields.Platform_Post_ID || fields.Platform_Media_ID || "").trim() || null;
  if (name === "instagram") return String(fields.Platform_Media_ID || fields.Platform_Post_ID || fields.IG_Carousel_Published_Media_ID || fields.IG_Story_Post_ID || "").trim() || null;
  if (name === "facebook") return String(fields.FB_Slideshow_Meta_Video_ID || fields.Platform_Post_ID || fields.Platform_Media_ID || "").trim() || null;
  if (name === "tiktok") {
    const direct = String(fields.Platform_Post_ID || fields.Platform_Media_ID || fields.Manual_Published_URL || "").trim();
    if (/^\d{8,}$/.test(direct)) return direct;
    try {
      const parsed = JSON.parse(String(fields.TikTok_Draft_Public_Post_IDs_JSON || "[]"));
      const first = Array.isArray(parsed) ? parsed.find((x) => /^\d{8,}$/.test(String(x))) : null;
      if (first) return String(first);
    } catch {}
    const match = direct.match(/video\/(\d{8,})/);
    return match ? match[1] : null;
  }
  return String(fields.Platform_Post_ID || fields.Platform_Media_ID || "").trim() || null;
}

export function sanitizeAnalyticsError(error) {
  let message = String(error?.message || error || "Analytics sync failed");
  message = message
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return message.slice(0, 500);
}

async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error?.code || (body?.error && typeof body.error === "string")) {
    const msg = body?.error?.message || body?.error_description || body?.error || `HTTP ${response.status}`;
    const error = new Error(String(msg));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function metaGet(path, { token, version = "v26.0", params = {}, fetchImpl = fetch }) {
  if (!token) throw new Error("Meta analytics token is missing");
  const url = new URL(`https://graph.facebook.com/${String(version).replace(/^\/+|\/+$/g, "")}/${String(path).replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  return readJsonResponse(await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }));
}

function insightValue(item) {
  const value = item?.total_value?.value ?? item?.values?.[0]?.value ?? item?.value;
  return nullableNumber(value);
}

function insightMap(body) {
  const map = {};
  for (const item of body?.data || []) {
    if (!item?.name) continue;
    map[item.name] = insightValue(item);
  }
  return map;
}

async function metaInsightMetrics(path, metrics, options) {
  if (!metrics.length) return {};
  try {
    return insightMap(await metaGet(path, { ...options, params: { ...(options.params || {}), metric: metrics.join(",") } }));
  } catch (groupError) {
    const out = {};
    for (const metric of metrics) {
      try {
        Object.assign(out, insightMap(await metaGet(path, { ...options, params: { ...(options.params || {}), metric } })));
      } catch {}
    }
    if (!Object.keys(out).length) throw groupError;
    return out;
  }
}

export async function fetchInstagramOwnedMediaAnalytics({ postId, token, version = "v26.0", fetchImpl = fetch }) {
  const id = String(postId || "").trim();
  if (!id) throw new Error("Instagram media ID is missing");
  const base = await metaGet(id, {
    token, version, fetchImpl,
    params: { fields: "id,timestamp,media_type,media_product_type,like_count,comments_count,permalink" },
  });
  const common = await metaInsightMetrics(`${id}/insights`,
    ["views", "reach", "saved", "shares", "total_interactions", "follows", "reposts"],
    { token, version, fetchImpl }
  ).catch(() => ({}));
  const isReel = String(base.media_product_type || base.media_type || "").toUpperCase().includes("REEL");
  let reel = {};
  if (isReel) {
    reel = await metaInsightMetrics(`${id}/insights`,
      ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"],
      { token, version, fetchImpl }
    ).catch(() => ({}));
  }
  return {
    id,
    published_at: base.timestamp || null,
    views: common.views,
    reach: common.reach,
    likes: nullableNumber(base.like_count),
    comments: nullableNumber(base.comments_count),
    shares: common.shares,
    saves: common.saved,
    total_interactions: common.total_interactions,
    audience_gained: common.follows,
    watch_time_sec: reel.ig_reels_video_view_total_time === null || reel.ig_reels_video_view_total_time === undefined ? null : reel.ig_reels_video_view_total_time / 1000,
    average_view_duration_sec: reel.ig_reels_avg_watch_time === null || reel.ig_reels_avg_watch_time === undefined ? null : reel.ig_reels_avg_watch_time / 1000,
    source: "instagram-graph-owned-media",
    platform_metrics: { ...common, ...reel, media_type: base.media_type || null, media_product_type: base.media_product_type || null, permalink: base.permalink || null },
  };
}

export async function fetchFacebookOwnedPostAnalytics({ postId, token, version = "v26.0", fetchImpl = fetch }) {
  const id = String(postId || "").trim();
  if (!id) throw new Error("Facebook post ID is missing");
  const base = await metaGet(id, {
    token, version, fetchImpl,
    params: { fields: "id,created_time,permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares" },
  });
  const media = await metaInsightMetrics(`${id}/insights`,
    ["post_media_view", "post_total_media_view_unique"],
    { token, version, fetchImpl, params: { period: "lifetime" } }
  ).catch(() => ({}));
  const likes = nullableNumber(base.reactions?.summary?.total_count);
  const comments = nullableNumber(base.comments?.summary?.total_count);
  const shares = nullableNumber(base.shares?.count);
  return {
    id,
    published_at: base.created_time || null,
    views: media.post_media_view,
    reach: media.post_total_media_view_unique,
    likes,
    comments,
    shares,
    total_interactions: sumKnown([likes, comments, shares]),
    source: "facebook-page-owned-post",
    platform_metrics: { ...media, permalink_url: base.permalink_url || null },
  };
}

async function serviceJson(url, { secret, method = "GET", body, fetchImpl = fetch }) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(secret ? { "X-Studio-Secret": secret, "X-Pipeline-Secret": secret, Authorization: `Bearer ${secret}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return readJsonResponse(response);
}

export async function fetchYouTubeOwnedVideoAnalytics({ serviceBaseUrl, serviceSecret, videoId, publishedAt, fetchImpl = fetch }) {
  const base = String(serviceBaseUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("YouTube analytics service URL is missing");
  const id = String(videoId || "").trim();
  if (!id) throw new Error("YouTube video ID is missing");
  return serviceJson(`${base}/youtube/analytics`, {
    secret: serviceSecret,
    method: "POST",
    fetchImpl,
    body: { videoId: id, publishedAt: publishedAt || null },
  });
}

export async function fetchTikTokOwnedVideoAnalytics({ workerBaseUrl, pipelineSecret, videoIds = [], fetchImpl = fetch }) {
  const base = String(workerBaseUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("TikTok auth worker URL is missing");
  const ids = [...new Set((videoIds || []).map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 20);
  return serviceJson(`${base}/tiktok/analytics/videos`, {
    secret: pipelineSecret,
    method: "POST",
    fetchImpl,
    body: { video_ids: ids },
  });
}

export function analyticsObservationKey({ platform, profileId, nativePostId, publishedAt, measuredAt }) {
  const bucket = analyticsMeasurementBucket(publishedAt, measuredAt);
  return ["first_party", String(platform || "").toLowerCase(), profileId || "profile", nativePostId || "post", bucket]
    .map((x) => String(x).replace(/[^A-Za-z0-9_.:-]+/g, "_"))
    .join(":")
    .slice(0, 240);
}
