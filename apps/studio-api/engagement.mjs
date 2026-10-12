/**
 * Social Engagement Automation — pure helpers + capability matrix.
 * Worker owns Airtable/HTTP; this module stays side-effect free for tests.
 */

export const ENGAGEMENT_SCHEMA = "studio.engagement.1";
export const ENGAGEMENT_STORE_SETTING = "ENGAGEMENT_STORE_V1";
export const ENGAGEMENT_SETTINGS_SETTING = "ENGAGEMENT_SETTINGS_V1";
export const ENGAGEMENT_DISCOVERY_LAST_SETTING = "ENGAGEMENT_DISCOVERY_LAST_RUN";
export const ENGAGEMENT_DISCOVERY_CRON_TTL_MS = 24 * 60 * 60 * 1000;

export const ENGAGEMENT_PROFILES = Object.freeze(["chicago", "nyc", "la", "miami"]);
export const ENGAGEMENT_PLATFORMS = Object.freeze(["instagram", "facebook", "tiktok", "youtube"]);

/** Official API capability matrix (see docs/engagement-capability-matrix.md). */
export const PLATFORM_CAPABILITIES = Object.freeze({
  instagram: {
    discover: "partial",
    read_public: "partial",
    like: "partial",
    comment: "unsupported",
    history: "partial",
    notes:
      "business_discovery needs Meta permission #10 (currently blocked). Third-party comments unsupported. Likes need Instagram Login user_likes + app review.",
    stage_b_like: false,
    stage_b_comment: false,
    manual_open_post: true,
  },
  facebook: {
    discover: "unsupported",
    read_public: "unsupported",
    like: "unsupported",
    comment: "unsupported",
    history: "partial",
    notes: "No official third-party discover/like/comment path for arbitrary creators. Open Post only.",
    stage_b_like: false,
    stage_b_comment: false,
    manual_open_post: true,
  },
  tiktok: {
    discover: "unsupported",
    read_public: "unsupported",
    like: "unsupported",
    comment: "unsupported",
    history: "partial",
    notes: "Content Posting API is for our drafts only. All third-party engagement is manual Open Post.",
    stage_b_like: false,
    stage_b_comment: false,
    manual_open_post: true,
  },
  youtube: {
    discover: "supported",
    read_public: "supported",
    like: "supported",
    comment: "supported",
    history: "partial",
    notes:
      "search.list for discovery (API key). videos.rate + commentThreads.insert via uploader OAuth (youtube.force-ssl). Quota-aware; approval required.",
    stage_b_like: true,
    stage_b_comment: true,
    manual_open_post: true,
  },
});

export const DEFAULT_PROFILE_TOPICS = Object.freeze({
  chicago: {
    label: "ChicagoShining",
    keywords: [
      "chicago architecture",
      "chicago river",
      "chicago bridges",
      "chicago skyline",
      "chicago tourism",
      "chicago street photography",
      "downtown chicago",
      "chicago photography",
    ],
    hashtags: ["#chicago", "#chicagogram", "#architecture", "#skyline", "#streetphotography"],
    locations: ["Chicago", "Chicago River", "Millennium Park", "Downtown Chicago"],
    exclusions: ["politics", "nsfw", "onlyfans", "giveaway", "follow4follow"],
    youtube_queries: [
      "Chicago architecture photography",
      "Chicago skyline drone",
      "Chicago river bridges",
      "Chicago street photography",
      "things to do Chicago downtown",
    ],
  },
  nyc: {
    label: "New York Shining",
    keywords: [
      "nyc architecture",
      "manhattan",
      "brooklyn",
      "nyc subway",
      "nyc ferry",
      "nyc photography",
      "new york tourism",
      "nyc neighborhood",
    ],
    hashtags: ["#nyc", "#newyork", "#manhattan", "#brooklyn", "#architecture"],
    locations: ["New York", "Manhattan", "Brooklyn", "NYC"],
    exclusions: ["politics", "nsfw", "onlyfans", "giveaway", "follow4follow"],
    youtube_queries: [
      "NYC architecture photography",
      "Manhattan skyline photography",
      "Brooklyn bridge photography",
      "NYC subway ferry travel",
      "New York neighborhood walk",
    ],
  },
  la: {
    label: "Los Angeles Shining",
    keywords: [
      "la architecture",
      "los angeles beach",
      "coastal photography",
      "downtown la",
      "los angeles travel",
      "california landmarks",
      "la photography",
    ],
    hashtags: ["#losangeles", "#dtla", "#california", "#beach", "#architecture"],
    locations: ["Los Angeles", "LA", "DTLA", "Downtown LA", "Hollywood", "Santa Monica", "Venice Beach"],
    exclusions: ["politics", "nsfw", "onlyfans", "giveaway", "follow4follow"],
    youtube_queries: [
      "Los Angeles architecture photography",
      "LA beach coastal photography",
      "Downtown LA photography",
      "California landmarks travel",
      "Los Angeles travel vlog",
    ],
  },
  miami: {
    label: "Miami Shining",
    keywords: [
      "miami architecture",
      "art deco",
      "south beach",
      "wynwood",
      "miami travel",
      "miami photography",
      "miami beach",
    ],
    hashtags: ["#miami", "#southbeach", "#artdeco", "#wynwood", "#miamiarchitecture"],
    locations: ["Miami", "South Beach", "Wynwood", "Miami Beach"],
    exclusions: ["politics", "nsfw", "onlyfans", "giveaway", "follow4follow"],
    youtube_queries: [
      "Miami Art Deco architecture",
      "South Beach photography",
      "Wynwood walls Miami",
      "Miami travel photography",
      "Miami Beach architecture",
    ],
  },
});

export const SENSITIVE_TOPIC_PATTERN =
  /\b(suicide|self[-\s]?harm|massacre|terror|gore|porn|onlyfans|nsfw|hate\s*speech|genocide|school\s*shooting)\b/i;

export const GENERIC_PRAISE_PATTERN =
  /^(nice(!|\.)?|cool(!|\.)?|amazing(!|\.)?|great(!|\.)?|love this(!|\.)?|awesome(!|\.)?|wow(!|\.)?)$/i;

export function normalizeEngagementProfile(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "la" || raw === "los angeles" || raw === "losangeles" || raw === "los-angeles" || raw === "los angeles shining") return "la";
  if (raw === "nyc" || raw === "new york" || raw === "newyork" || raw === "new-york" || raw === "new york shining") return "nyc";
  if (raw === "miami" || raw === "miami shining" || raw === "miamishining") return "miami";
  return "chicago";
}

export function engagementProfileLabel(profile) {
  return DEFAULT_PROFILE_TOPICS[normalizeEngagementProfile(profile)]?.label || "ChicagoShining";
}

export function normalizeEngagementPlatform(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (ENGAGEMENT_PLATFORMS.includes(raw)) return raw;
  return "";
}

export function capabilityFor(platform) {
  const key = normalizeEngagementPlatform(platform);
  return key ? PLATFORM_CAPABILITIES[key] : null;
}

export function actionSupported(platform, actionType) {
  const cap = capabilityFor(platform);
  if (!cap) return false;
  if (actionType === "like") return cap.stage_b_like === true;
  if (actionType === "comment") return cap.stage_b_comment === true;
  return false;
}

export function defaultEngagementSettings(profile = "chicago") {
  const theme = normalizeEngagementProfile(profile);
  const topics = DEFAULT_PROFILE_TOPICS[theme];
  return {
    schema_version: ENGAGEMENT_SCHEMA,
    profile: theme,
    enabled: true,
    platforms: {
      youtube: true,
      instagram: true,
      facebook: true,
      tiktok: true,
    },
    keywords: [...topics.keywords],
    hashtags: [...topics.hashtags],
    locations: [...topics.locations],
    exclusions: [...topics.exclusions],
    creator_allowlist: [],
    creator_blocklist: [],
    relevance_threshold: 0.45,
    discovery_schedule: "daily",
    max_candidates_per_run: 20,
    max_comment_suggestions: 3,
    daily_like_limit: 10,
    daily_comment_limit: 5,
    require_approval: true,
    ai_provider_preference: "primary",
    stage: "A",
    stage_b_enabled: false,
    min_hours_between_creator_comments: 72,
  };
}

export function mergeEngagementSettings(raw, profile = "chicago") {
  const base = defaultEngagementSettings(profile);
  const incoming = raw && typeof raw === "object" ? raw : {};
  const platforms = { ...base.platforms, ...(incoming.platforms || {}) };
  return {
    ...base,
    ...incoming,
    profile: normalizeEngagementProfile(incoming.profile || profile),
    platforms,
    keywords: uniqueStrings(incoming.keywords ?? base.keywords),
    hashtags: uniqueStrings(incoming.hashtags ?? base.hashtags),
    locations: uniqueStrings(incoming.locations ?? base.locations),
    exclusions: uniqueStrings(incoming.exclusions ?? base.exclusions),
    creator_allowlist: uniqueStrings(incoming.creator_allowlist ?? base.creator_allowlist),
    creator_blocklist: uniqueStrings(incoming.creator_blocklist ?? base.creator_blocklist),
    relevance_threshold: clampNumber(incoming.relevance_threshold ?? base.relevance_threshold, 0.1, 0.95, 0.45),
    max_candidates_per_run: clampNumber(incoming.max_candidates_per_run ?? base.max_candidates_per_run, 1, 20, 20),
    max_comment_suggestions: clampNumber(incoming.max_comment_suggestions ?? base.max_comment_suggestions, 1, 3, 3),
    daily_like_limit: clampNumber(incoming.daily_like_limit ?? base.daily_like_limit, 0, 50, 10),
    daily_comment_limit: clampNumber(incoming.daily_comment_limit ?? base.daily_comment_limit, 0, 30, 5),
    require_approval: incoming.require_approval !== false,
    stage_b_enabled: incoming.stage_b_enabled === true,
    min_hours_between_creator_comments: clampNumber(
      incoming.min_hours_between_creator_comments ?? base.min_hours_between_creator_comments,
      1,
      720,
      72
    ),
  };
}

export function emptyEngagementStore() {
  return {
    schema_version: ENGAGEMENT_SCHEMA,
    updated_at: null,
    targets: [],
    actions: [],
    suspended: {},
  };
}

export function parseEngagementStore(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    if (!parsed || typeof parsed !== "object") return emptyEngagementStore();
    return {
      schema_version: ENGAGEMENT_SCHEMA,
      updated_at: parsed.updated_at || null,
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      suspended: parsed.suspended && typeof parsed.suspended === "object" ? parsed.suspended : {},
    };
  } catch {
    return emptyEngagementStore();
  }
}

export function parseEngagementSettingsMap(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const profile of ENGAGEMENT_PROFILES) {
      if (parsed[profile]) out[profile] = mergeEngagementSettings(parsed[profile], profile);
    }
    return out;
  } catch {
    return {};
  }
}

export function engagementDedupeKey(platform, postId, creatorId = "") {
  return [
    normalizeEngagementPlatform(platform) || "unknown",
    String(postId || "").trim().toLowerCase(),
    String(creatorId || "").trim().toLowerCase(),
  ].join(":");
}

const PROFILE_PLACE_TERMS = Object.freeze({
  chicago: ["Chicago"],
  nyc: ["New York", "NYC", "Manhattan", "Brooklyn"],
  la: ["Los Angeles", "LA", "DTLA", "Hollywood", "Santa Monica", "Venice Beach"],
  miami: ["Miami", "South Beach", "Wynwood"],
});

export function engagementTermMatches(haystack, term) {
  const needle = String(term || "").trim().toLowerCase().replace(/^#/, "");
  if (!needle) return false;
  if (needle.length <= 3) {
    const dotted = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split("").join("\\.?");
    return new RegExp(`(?:^|[^a-z0-9])${dotted}(?:[^a-z0-9]|$)`, "i").test(haystack);
  }
  return haystack.includes(needle);
}

export function scorePostRelevance(post, settings) {
  const haystack = [
    post?.caption,
    post?.title,
    post?.description,
    post?.creator_name,
    post?.channel_title,
    post?.handle,
    post?.location,
    ...(Array.isArray(post?.hashtags) ? post.hashtags : []),
  ].filter(Boolean).join(" ").toLowerCase();

  if (!haystack.trim()) return { score: 0, reason: "Empty content", matched: [] };

  for (const exclusion of settings.exclusions || []) {
    if (engagementTermMatches(haystack, exclusion)) {
      return { score: 0, reason: `Excluded term: ${exclusion}`, matched: [] };
    }
  }
  if (SENSITIVE_TOPIC_PATTERN.test(haystack)) {
    return { score: 0, reason: "Sensitive subject filtered", matched: [] };
  }

  const creatorKey = String(post?.creator_id || post?.channel_id || post?.handle || "").toLowerCase();
  if ((settings.creator_blocklist || []).some((row) => String(row).toLowerCase() === creatorKey || engagementTermMatches(haystack, row))) {
    return { score: 0, reason: "Creator blocked", matched: [] };
  }

  let score = 0;
  const matched = [];
  for (const keyword of settings.keywords || []) {
    if (engagementTermMatches(haystack, keyword)) {
      score += 0.18;
      matched.push(keyword);
    }
  }
  for (const tag of settings.hashtags || []) {
    if (engagementTermMatches(haystack, tag)) {
      score += 0.1;
      matched.push(tag);
    }
  }
  const placeTerms = [
    ...(settings.locations || []),
    ...(PROFILE_PLACE_TERMS[normalizeEngagementProfile(settings.profile)] || []),
  ];
  const seenPlaces = new Set();
  let primaryPlace = false;
  for (const loc of placeTerms) {
    const key = String(loc || "").trim().toLowerCase();
    if (!key || seenPlaces.has(key) || !engagementTermMatches(haystack, loc)) continue;
    seenPlaces.add(key);
    score += primaryPlace ? 0.08 : 0.5;
    primaryPlace = true;
    matched.push(loc);
  }
  if ((settings.creator_allowlist || []).some((row) => String(row).toLowerCase() === creatorKey)) {
    score += 0.25;
    matched.push("allowlisted creator");
  }

  // Prefer original creators: slightly boost when title/caption looks first-person photography/travel.
  if (/\b(i (shot|captured|photographed)|my (photo|shot|walk)|original)\b/i.test(haystack)) {
    score += 0.08;
    matched.push("original-creator cues");
  }

  score = Math.min(1, Math.round(score * 100) / 100);
  const reason = matched.length
    ? `Matched: ${matched.slice(0, 6).join(", ")}`
    : "Below topical relevance";
  return { score, reason, matched };
}

export function filterAndRankCandidates(posts, settings, existingTargets = []) {
  const threshold = Number(settings.relevance_threshold) || 0.45;
  const seen = new Set(
    (existingTargets || []).map((row) => row.dedupe_key || engagementDedupeKey(row.platform, row.post_id, row.creator_id))
  );
  const ranked = [];
  for (const post of posts || []) {
    const platform = normalizeEngagementPlatform(post.platform);
    if (!platform) continue;
    if (settings.platforms && settings.platforms[platform] === false) continue;
    const dedupe = engagementDedupeKey(platform, post.post_id || post.external_post_id, post.creator_id || post.channel_id || post.handle);
    if (seen.has(dedupe)) continue;
    const { score, reason, matched } = scorePostRelevance(post, settings);
    if (score < threshold) continue;
    seen.add(dedupe);
    ranked.push({
      ...post,
      platform,
      dedupe_key: dedupe,
      relevance_score: score,
      recommend_reason: reason,
      matched_terms: matched,
    });
  }
  ranked.sort((a, b) => b.relevance_score - a.relevance_score || String(b.published_at || "").localeCompare(String(a.published_at || "")));
  return ranked.slice(0, Math.max(1, Number(settings.max_candidates_per_run) || 20));
}

export function buildCommentGenerationPrompt(post, settings, maxSuggestions = 3) {
  const profileLabel = engagementProfileLabel(settings.profile);
  const caption = String(post.caption || post.title || "").slice(0, 1200);
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(" ") : String(post.hashtags || "");
  return [
    `You write short authentic engagement comments for the ${profileLabel} social brand.`,
    "Return JSON: { \"comments\": [string, ...], \"skip_reason\": string|null }",
    `Generate up to ${maxSuggestions} candidate comments.`,
    "Rules:",
    "- Short, natural, specific to the authorized caption/metadata only.",
    "- Never invent visual details you cannot verify from the text.",
    "- Never claim you visited a place.",
    "- Never impersonate the creator.",
    "- No promotional links, hashtags spam, or engagement bait.",
    "- Avoid generic repeated praise.",
    "- If the post is irrelevant or sensitive, set comments to [] and explain in skip_reason.",
    "- Do not publish; suggestions only.",
    "",
    `Platform: ${post.platform}`,
    `Creator: ${post.creator_name || post.handle || post.channel_title || "unknown"}`,
    `Location: ${post.location || "unknown"}`,
    `Caption/title: ${caption}`,
    `Hashtags: ${hashtags}`,
    `Why recommended: ${post.recommend_reason || ""}`,
  ].join("\n");
}

export function sanitizeCommentSuggestion(text) {
  let value = String(text || "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  if (value.length > 220) value = value.slice(0, 217).trimEnd() + "…";
  if (GENERIC_PRAISE_PATTERN.test(value)) return "";
  if (/https?:\/\/|www\./i.test(value)) return "";
  if ((value.match(/#/g) || []).length > 1) return "";
  if (/\b(follow me|link in bio|check out my|subscribe|dm me)\b/i.test(value)) return "";
  if (/\bI (was|went|visited|lived) (there|here|in)\b/i.test(value)) return "";
  return value;
}

export function normalizeGeneratedComments(parsed, maxSuggestions = 3) {
  const list = Array.isArray(parsed?.comments) ? parsed.comments : Array.isArray(parsed) ? parsed : [];
  const cleaned = [];
  const seen = new Set();
  for (const item of list) {
    const text = sanitizeCommentSuggestion(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length >= maxSuggestions) break;
  }
  return {
    comments: cleaned,
    skip_reason: cleaned.length ? null : String(parsed?.skip_reason || "No safe comment suggestions").slice(0, 240),
  };
}

/** Deterministic fallback when AI is unavailable — still specific to caption tokens. */
export function fallbackCommentSuggestions(post, maxSuggestions = 3) {
  const caption = String(post?.caption || post?.title || "").trim();
  const tokens = caption
    .replace(/#[\w]+/g, "")
    .split(/[\s,.;:!?\-/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 3 && !/^(this|that|with|from|your|have|been|they|what|when|where|just|really)$/i.test(part));
  const subject = tokens.slice(0, 4).join(" ").slice(0, 48) || "this shot";
  const cityCue = (post?.matched_terms || []).find((term) => /chicago|nyc|york|miami|angeles|beach|architecture|skyline|river/i.test(term));
  const candidates = [
    `Love how you framed ${subject}. Really strong composition.`,
    cityCue
      ? `Fantastic perspective — ${cityCue} comes through clearly in this piece.`
      : `Great eye for detail on ${subject}. Beautifully captured.`,
    `The mood in this one stands out. Thanks for sharing such a thoughtful frame.`,
  ];
  return normalizeGeneratedComments({ comments: candidates }, maxSuggestions);
}

export function nearIdenticalComment(a, b) {
  const left = String(a || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const right = String(b || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length > 20 && right.includes(left.slice(0, Math.floor(left.length * 0.8)))) return true;
  if (right.length > 20 && left.includes(right.slice(0, Math.floor(right.length * 0.8)))) return true;
  return false;
}

export function creatorRecentlyEngaged(actions, creatorId, platform, minHours = 72) {
  const key = String(creatorId || "").toLowerCase();
  if (!key) return false;
  const cutoff = Date.now() - minHours * 3600000;
  return (actions || []).some((action) => {
    if (String(action.creator_id || "").toLowerCase() !== key) return false;
    if (normalizeEngagementPlatform(action.platform) !== normalizeEngagementPlatform(platform)) return false;
    if (!["comment", "like"].includes(action.action_type)) return false;
    // Only real publishes count. Stage A Approve must not block Stage B Comment.
    if (action.execution_status !== "published") return false;
    const ts = Date.parse(action.executed_at || action.approved_at || action.created_at || "");
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

export function dailyActionCount(actions, profile, platform, actionType, dayIso = new Date().toISOString().slice(0, 10)) {
  return (actions || []).filter((action) => {
    if (normalizeEngagementProfile(action.profile) !== normalizeEngagementProfile(profile)) return false;
    if (platform && normalizeEngagementPlatform(action.platform) !== normalizeEngagementPlatform(platform)) return false;
    if (action.action_type !== actionType) return false;
    // Count only API publishes toward daily limits — not Approve/queue rows.
    if (action.execution_status !== "published") return false;
    const stamp = String(action.executed_at || action.approved_at || action.created_at || "").slice(0, 10);
    return stamp === dayIso;
  }).length;
}

export function makeIdempotencyKey(profile, platform, actionType, postId) {
  return [
    normalizeEngagementProfile(profile),
    normalizeEngagementPlatform(platform),
    String(actionType || "").toLowerCase(),
    String(postId || "").trim().toLowerCase(),
  ].join(":");
}

export function findDuplicateAction(actions, idempotencyKey) {
  return (actions || []).find((action) => {
    if (action.idempotency_key !== idempotencyKey) return false;
    // Approve writes the same idempotency key with pending/queued. Only block
    // when an API attempt already published or returned ambiguous.
    return ["published", "ambiguous"].includes(action.execution_status);
  }) || null;
}

export function classifyEngagementFailure(errorOrAction) {
  const text = String(
    errorOrAction?.error ||
      errorOrAction?.message ||
      errorOrAction?.error_details ||
      errorOrAction ||
      ""
  );
  const lower = text.toLowerCase();
  if (/duplicate|already commented|idempotenc/i.test(text)) {
    return { kind: "engagement_duplicate", heal: "none", guidance: "Duplicate engagement blocked. Do not retry; open history." };
  }
  if (/near[-\s]?identical|repeated comment/i.test(text)) {
    return { kind: "engagement_repeated_comment", heal: "none", guidance: "Near-identical comment rejected. Edit to be specific or skip." };
  }
  if (/unsupported|manual open post|not supported/i.test(text)) {
    return { kind: "engagement_unsupported", heal: "none", guidance: "Use Open Post for manual engagement. Do not mark automated success." };
  }
  if (/permission|oauth|unauthorized|401|403.*scope|expired/i.test(text)) {
    return { kind: "engagement_permission", heal: "none", guidance: "Permission expired or missing. Re-authorize the profile; do not blind-retry." };
  }
  if (/quota|rate limit|429|userRateLimitExceeded|dailyLimitExceeded/i.test(text)) {
    return { kind: "engagement_quota", heal: "none", guidance: "Quota exhausted. Back off until reset; do not raise configurable limits to bypass spam protections." };
  }
  if (/ambiguous|unknown publish|maybe created/i.test(text)) {
    return { kind: "engagement_ambiguous", heal: "none", guidance: "Ambiguous publish result. Verify whether the comment exists before any retry." };
  }
  if (/deleted|notFound|404|video not found/i.test(text)) {
    return { kind: "engagement_post_deleted", heal: "none", guidance: "Post no longer available. Mark target Expired; do not retry." };
  }
  if (/wrong profile|profile mismatch|incorrect profile/i.test(text)) {
    return { kind: "engagement_wrong_profile", heal: "none", guidance: "Action blocked for profile isolation. Switch to the correct brand profile." };
  }
  if (/irrelevant|inappropriate|sensitive/i.test(text)) {
    return { kind: "engagement_irrelevant_ai", heal: "none", guidance: "Suggestion rejected as irrelevant/inappropriate. Skip or regenerate with stricter filters." };
  }
  if (/fail|error|500|502|503/i.test(lower)) {
    return { kind: "engagement_failed_comment", heal: "none", guidance: "Provider failure logged. Inspect error details; never blind-retry." };
  }
  return { kind: "engagement_failed_comment", heal: "none", guidance: "Engagement failure logged. Inspect details; never blind-retry." };
}

export function backoffMs(attempt = 0) {
  const n = Math.max(0, Math.min(8, Number(attempt) || 0));
  return Math.min(15 * 60 * 1000, 1000 * 2 ** n);
}

export function shouldSuspendProfilePlatform(errorText) {
  return /permission|oauth|unauthorized|abuse|spam|suspended|app.?review/i.test(String(errorText || ""));
}

/** Keep all three comment options while trimming ledger size for Airtable. */
export const ENGAGEMENT_COMMENT_OPTIONS = 3;

function slimEngagementTarget(target) {
  if (!target || typeof target !== "object") return target;
  const comments = Array.isArray(target.suggested_comments) ? target.suggested_comments : [];
  return {
    ...target,
    caption: String(target.caption || "").slice(0, 320),
    content_summary: String(target.content_summary || "").slice(0, 180),
    recommend_reason: String(target.recommend_reason || "").slice(0, 180),
    // Ledger shrink must not drop Use #1/#2/#3 — keep up to three short options.
    suggested_comments: comments
      .slice(0, ENGAGEMENT_COMMENT_OPTIONS)
      .map((row) => String(row || "").slice(0, 200))
      .filter(Boolean),
    selected_comment: String(target.selected_comment || comments[0] || "").slice(0, 200),
    matched_terms: Array.isArray(target.matched_terms) ? target.matched_terms.slice(0, 6) : [],
    hashtags: Array.isArray(target.hashtags) ? target.hashtags.slice(0, 6) : [],
    preview_url: String(target.preview_url || "").slice(0, 300),
  };
}

/**
 * Restore missing Use #2 / Use #3 options on cards that were over-slimmed to one comment.
 * Preserves existing suggestions and pads with fallback phrasing.
 */
export function ensureThreeCommentSuggestions(target, maxSuggestions = ENGAGEMENT_COMMENT_OPTIONS) {
  const max = Math.max(1, Math.min(ENGAGEMENT_COMMENT_OPTIONS, Number(maxSuggestions) || ENGAGEMENT_COMMENT_OPTIONS));
  const existing = Array.isArray(target?.suggested_comments)
    ? target.suggested_comments.map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  if (existing.length >= max) {
    return {
      ...target,
      suggested_comments: existing.slice(0, max),
      selected_comment: String(target?.selected_comment || existing[0] || "").trim() || existing[0] || "",
    };
  }
  const fallback = fallbackCommentSuggestions({
    caption: target?.caption || target?.content_summary || "",
    title: target?.content_summary || "",
    matched_terms: target?.matched_terms || [],
  }, max);
  const merged = [...existing];
  for (const candidate of fallback.comments || []) {
    if (merged.length >= max) break;
    if (merged.some((row) => nearIdenticalComment(row, candidate))) continue;
    merged.push(candidate);
  }
  return {
    ...target,
    suggested_comments: merged.slice(0, max),
    selected_comment: String(target?.selected_comment || merged[0] || "").trim() || merged[0] || "",
  };
}

/** Airtable long text rejects Setting_Value above 100,000 characters. */
export const ENGAGEMENT_STORE_CHAR_BUDGET = 80000;

export function pruneEngagementStore(store, limits = {}) {
  const maxChars = limits.maxChars || ENGAGEMENT_STORE_CHAR_BUDGET;
  const keepPerProfile = limits.keepPerProfile || 8;
  const sortedTargets = [...(store.targets || [])]
    .map(slimEngagementTarget)
    .sort((a, b) => String(b.discovered_at || "").localeCompare(String(a.discovered_at || "")));
  const seen = new Map();
  const protectedTargets = [];
  const extraTargets = [];
  for (const target of sortedTargets) {
    const key = String(target.profile || "");
    const count = seen.get(key) || 0;
    if (count < keepPerProfile) {
      seen.set(key, count + 1);
      protectedTargets.push(target);
    } else {
      extraTargets.push(target);
    }
  }
  let targets = [...protectedTargets, ...extraTargets].slice(0, limits.maxTargets || 80);
  let actions = [...(store.actions || [])]
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, limits.maxActions || 200);
  const pack = () => ({
    ...store,
    targets,
    actions,
    updated_at: new Date().toISOString(),
  });
  let next = pack();
  while (JSON.stringify(next).length > maxChars && targets.length > protectedTargets.length) {
    targets = targets.slice(0, targets.length - 1);
    next = pack();
  }
  while (JSON.stringify(next).length > maxChars && actions.length > 15) {
    actions = actions.slice(0, actions.length - 10);
    next = pack();
  }
  return next;
}

export function buildTargetRecord(post, settings, comments) {
  const now = new Date().toISOString();
  const targetId = `et_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    target_id: targetId,
    profile: normalizeEngagementProfile(settings.profile),
    platform: normalizeEngagementPlatform(post.platform),
    creator_id: String(post.creator_id || post.channel_id || post.handle || "").trim(),
    creator_name: String(post.creator_name || post.channel_title || post.handle || "").trim(),
    post_id: String(post.post_id || post.external_post_id || "").trim(),
    post_url: String(post.post_url || post.url || "").trim(),
    discovered_at: now,
    content_summary: String(post.content_summary || post.caption || post.title || "").slice(0, 180),
    caption: String(post.caption || post.title || "").slice(0, 320),
    relevance_score: Number(post.relevance_score) || 0,
    recommend_reason: String(post.recommend_reason || "").slice(0, 500),
    eligibility_status: comments.length ? "Suggested" : "Ineligible",
    suggested_comments: comments,
    selected_comment: comments[0] || "",
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : String(post.hashtags || "").split(/\s+/).filter(Boolean),
    location: String(post.location || "").trim(),
    preview_url: String(post.preview_url || post.thumbnail_url || "").trim(),
    dedupe_key: post.dedupe_key || engagementDedupeKey(post.platform, post.post_id || post.external_post_id, post.creator_id || post.channel_id),
    approval_status: "pending",
    matched_terms: post.matched_terms || [],
  };
}

export function buildActionRecord({ target, actionType, comment, approvalStatus = "pending", executionStatus = "pending", error = null, publishedId = null }) {
  const now = new Date().toISOString();
  const postUrl = String(target.post_url || "").trim()
    || (String(target.platform || "").toLowerCase() === "youtube" ? youtubePostUrl(target.post_id) : "");
  return {
    action_id: `ea_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    target_id: target.target_id,
    profile: target.profile,
    platform: target.platform,
    creator_id: target.creator_id,
    creator_name: String(target.creator_name || "").trim(),
    post_id: target.post_id,
    post_url: postUrl,
    action_type: actionType,
    suggested_comment: target.selected_comment || (target.suggested_comments || [])[0] || "",
    edited_comment: comment || "",
    approval_status: approvalStatus,
    execution_status: executionStatus,
    published_comment_id: publishedId,
    error_details: error,
    idempotency_key: makeIdempotencyKey(target.profile, target.platform, actionType, target.post_id),
    created_at: now,
    approved_at: approvalStatus === "approved" ? now : null,
    executed_at: executionStatus === "published" ? now : null,
    classification: error ? classifyEngagementFailure(error) : null,
  };
}

/** Fill channel + post link on history rows (legacy actions may omit them). */
export function enrichEngagementHistory(actions, targets = []) {
  const byId = new Map((targets || []).map((row) => [row.target_id, row]));
  return (actions || []).map((action) => {
    const target = byId.get(action.target_id) || {};
    const creator_name = String(action.creator_name || target.creator_name || "").trim();
    let post_url = String(action.post_url || target.post_url || "").trim();
    if (!post_url && String(action.platform || target.platform || "").toLowerCase() === "youtube") {
      post_url = youtubePostUrl(action.post_id || target.post_id);
    }
    return {
      ...action,
      creator_name: creator_name || String(action.creator_id || target.creator_id || "").trim(),
      post_url,
    };
  });
}

export function computeEngagementInsights(store, profile = null) {
  const theme = profile ? normalizeEngagementProfile(profile) : null;
  const targets = (store.targets || []).filter((row) => !theme || row.profile === theme);
  const actions = (store.actions || []).filter((row) => !theme || row.profile === theme);
  const published = actions.filter((row) => row.execution_status === "published");
  const approved = actions.filter((row) => row.approval_status === "approved" || row.execution_status === "published");
  const failed = actions.filter((row) => row.execution_status === "failed" || row.approval_status === "rejected");
  const byPlatform = {};
  const byProfile = {};
  const creatorNameByKey = new Map();
  for (const target of targets) {
    const id = String(target.creator_id || "").trim();
    const name = String(target.creator_name || "").trim();
    if (!id || !name) continue;
    creatorNameByKey.set(`${target.platform}:${id}`, name);
  }
  const creatorCounts = {};
  for (const action of published) {
    byPlatform[action.platform] = (byPlatform[action.platform] || 0) + 1;
    byProfile[action.profile] = (byProfile[action.profile] || 0) + 1;
    const platform = String(action.platform || "unknown");
    const creatorId = String(action.creator_id || "").trim();
    const groupKey = creatorId
      ? `${platform}:${creatorId}`
      : `${platform}:name:${String(action.creator_name || "unknown").trim()}`;
    const displayName = String(action.creator_name || "").trim()
      || creatorNameByKey.get(`${platform}:${creatorId}`)
      || creatorId
      || "unknown";
    if (!creatorCounts[groupKey]) {
      creatorCounts[groupKey] = { platform, creator: displayName, creator_id: creatorId || null, count: 0 };
    }
    creatorCounts[groupKey].count += 1;
    if (String(action.creator_name || "").trim()) {
      creatorCounts[groupKey].creator = String(action.creator_name).trim();
    }
  }
  const topCreators = Object.values(creatorCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return {
    schema_version: ENGAGEMENT_SCHEMA,
    profile: theme,
    discovered: targets.length,
    suggestions_generated: targets.reduce((sum, row) => sum + (row.suggested_comments || []).length, 0),
    comments_approved: approved.filter((row) => row.action_type === "comment").length,
    likes_completed: published.filter((row) => row.action_type === "like").length,
    comments_published: published.filter((row) => row.action_type === "comment").length,
    by_platform: byPlatform,
    by_profile: byProfile,
    top_creators: topCreators,
    failure_rate: actions.length ? Math.round((failed.length / actions.length) * 1000) / 10 : 0,
    rejection_rate: actions.length
      ? Math.round((actions.filter((row) => row.approval_status === "rejected" || row.approval_status === "skipped").length / actions.length) * 1000) / 10
      : 0,
    note: "Counts reflect provider-confirmed or Studio-ledger actions only. Follower growth is not attributed to engagement automation.",
  };
}

export function youtubePostUrl(videoId) {
  const id = String(videoId || "").trim();
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : "";
}

export function mapYoutubeSearchItem(item) {
  const videoId = String(item?.id?.videoId || item?.id || "").trim();
  if (!videoId) return null;
  const title = String(item?.snippet?.title || "").trim();
  const description = String(item?.snippet?.description || "").trim();
  return {
    platform: "youtube",
    post_id: videoId,
    external_post_id: videoId,
    post_url: youtubePostUrl(videoId),
    caption: title,
    title,
    description,
    content_summary: `${title} — ${description}`.slice(0, 400),
    creator_id: String(item?.snippet?.channelId || "").trim(),
    creator_name: String(item?.snippet?.channelTitle || "").trim(),
    channel_id: String(item?.snippet?.channelId || "").trim(),
    channel_title: String(item?.snippet?.channelTitle || "").trim(),
    published_at: item?.snippet?.publishedAt || null,
    preview_url: item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || "",
    thumbnail_url: item?.snippet?.thumbnails?.medium?.url || "",
    hashtags: (description.match(/#[\w]+/g) || []).slice(0, 12),
    location: "",
  };
}

export function capabilityMatrixResponse() {
  return {
    ok: true,
    schema_version: ENGAGEMENT_SCHEMA,
    matrix: PLATFORM_CAPABILITIES,
    stages: {
      A: "Discovery + AI suggestions only (no external writes).",
      B: "Approved like/comment only where stage_b_* is true (YouTube).",
      C: "Scheduled daily discovery; still requires human approval before publish.",
    },
    documentation: "docs/engagement-capability-matrix.md",
  };
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
