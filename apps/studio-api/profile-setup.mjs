export const PROFILE_SETUP_VERSION = 1;

export const PROFILE_SETUP_DEFAULT_FORMATS = Object.freeze([
  "Vertical Short Video",
  "Story",
  "Carousel",
  "Feed Post",
  "Longform Video",
  "Thumbnail / Promo Still",
  "Photo Set",
]);

export const PROFILE_SETUP_DEFAULT_THEMES = Object.freeze([
  "History",
  "Architecture",
  "Sites and Sounds",
  "Events",
  "Parks",
  "Museums",
  "Hidden Gems",
  "Neighborhoods",
  "Transportation",
  "Food",
  "Restaurants",
  "Seasonal",
  "Education",
  "Tourist Tips",
  "Nature",
]);

export const PROFILE_SETUP_PLATFORMS = Object.freeze({
  instagram: Object.freeze({
    key: "instagram",
    label: "Instagram",
    create_url: "https://www.instagram.com/accounts/emailsignup/",
    help_url: "https://help.instagram.com/",
    identity_label: "Instagram professional account ID",
  }),
  tiktok: Object.freeze({
    key: "tiktok",
    label: "TikTok",
    create_url: "https://www.tiktok.com/signup",
    help_url: "https://support.tiktok.com/",
    identity_label: "TikTok handle",
  }),
  youtube: Object.freeze({
    key: "youtube",
    label: "YouTube",
    create_url: "https://www.youtube.com/",
    help_url: "https://support.google.com/youtube/answer/1646861",
    identity_label: "YouTube channel ID",
  }),
  facebook: Object.freeze({
    key: "facebook",
    label: "Facebook",
    create_url: "https://www.facebook.com/pages/create/",
    help_url: "https://www.facebook.com/help/pages/",
    identity_label: "Facebook Page ID",
  }),
});

const PLATFORM_KEYS = Object.freeze(Object.keys(PROFILE_SETUP_PLATFORMS));

function compactText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

export function profileSetupSlug(value) {
  return compactText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function profileSetupShortCode(value) {
  const explicit = compactText(value, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return explicit.slice(0, 8);
}

export function profileSetupSettingName(profileId) {
  return `PROFILE_SETUP_V${PROFILE_SETUP_VERSION}_${String(profileId || "").trim()}`;
}

export function profileDestinationSettingName(profileId, settingName) {
  return `PROFILE_${String(profileId || "").trim()}_${String(settingName || "").trim()}`;
}

export function profileSetupPlatformKey(value) {
  const key = compactText(value, 40).toLowerCase();
  return PLATFORM_KEYS.includes(key) ? key : "";
}

function normalizeStringArray(value, allowed = null, max = 30) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    const text = compactText(item, 120);
    if (!text || seen.has(text)) continue;
    if (allowed && !allowed.includes(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizePlatformState(key, input = {}, prior = {}) {
  const enabled = input.enabled === undefined ? Boolean(prior.enabled) : Boolean(input.enabled);
  const deferred = input.deferred === undefined ? Boolean(prior.deferred) : Boolean(input.deferred);
  const modeRaw = compactText(input.setup_mode === undefined ? prior.setup_mode : input.setup_mode, 20).toLowerCase();
  const setupMode = ["existing", "create"].includes(modeRaw) ? modeRaw : "existing";
  return {
    key,
    enabled,
    setup_mode: setupMode,
    deferred,
    desired_handle: compactText(
      input.desired_handle === undefined ? prior.desired_handle : input.desired_handle,
      120,
    ).replace(/^@/, ""),
    account_creation_opened_at: compactText(
      input.account_creation_opened_at === undefined ? prior.account_creation_opened_at : input.account_creation_opened_at,
      40,
    ) || null,
    credentials_saved: input.credentials_saved === undefined
      ? Boolean(prior.credentials_saved)
      : Boolean(input.credentials_saved),
    last_verified_at: compactText(
      input.last_verified_at === undefined ? prior.last_verified_at : input.last_verified_at,
      40,
    ) || null,
    last_status: compactText(
      input.last_status === undefined ? prior.last_status : input.last_status,
      40,
    ) || "not_configured",
    last_error: compactText(
      input.last_error === undefined ? prior.last_error : input.last_error,
      500,
    ) || null,
  };
}

export function normalizeProfileSetupState(input = {}, prior = {}) {
  const city = compactText(input.city === undefined ? prior.city : input.city, 120);
  const profileName = compactText(
    input.profile_name === undefined ? prior.profile_name : input.profile_name,
    160,
  ) || (city ? `${city} Shining` : "");
  const brandName = compactText(
    input.brand_name === undefined ? prior.brand_name : input.brand_name,
    160,
  ) || profileName;
  const slug = profileSetupSlug(
    input.slug === undefined ? (prior.slug || city) : input.slug,
  );
  const shortCode = profileSetupShortCode(
    input.short_code === undefined ? prior.short_code : input.short_code,
  );
  const platformInput = input.platforms && typeof input.platforms === "object"
    ? input.platforms
    : {};
  const priorPlatforms = prior.platforms && typeof prior.platforms === "object"
    ? prior.platforms
    : {};
  const platforms = {};
  for (const key of PLATFORM_KEYS) {
    platforms[key] = normalizePlatformState(key, platformInput[key] || {}, priorPlatforms[key] || {});
  }

  const hashtagsRaw = compactText(
    input.default_hashtags === undefined ? prior.default_hashtags : input.default_hashtags,
    2000,
  );
  const brandHashtag = compactText(
    input.brand_hashtag === undefined ? prior.brand_hashtag : input.brand_hashtag,
    120,
  ).replace(/^#?/, "#");

  return {
    version: PROFILE_SETUP_VERSION,
    profile_id: compactText(input.profile_id === undefined ? prior.profile_id : input.profile_id, 40) || null,
    brand_record_id: compactText(
      input.brand_record_id === undefined ? prior.brand_record_id : input.brand_record_id,
      40,
    ) || null,
    lifecycle: compactText(
      input.lifecycle === undefined ? prior.lifecycle : input.lifecycle,
      24,
    ) || "setup",
    city,
    state_region: compactText(
      input.state_region === undefined ? prior.state_region : input.state_region,
      120,
    ),
    country: compactText(
      input.country === undefined ? (prior.country || "United States") : input.country,
      120,
    ) || "United States",
    timezone: compactText(
      input.timezone === undefined ? prior.timezone : input.timezone,
      120,
    ),
    profile_name: profileName,
    brand_name: brandName,
    slug,
    short_code: shortCode,
    website_url: compactText(
      input.website_url === undefined ? prior.website_url : input.website_url,
      500,
    ),
    brand_hashtag: brandHashtag === "#" ? "" : brandHashtag,
    default_hashtags: hashtagsRaw,
    primary_audience: compactText(
      input.primary_audience === undefined ? prior.primary_audience : input.primary_audience,
      5000,
    ),
    brand_voice: compactText(
      input.brand_voice === undefined ? prior.brand_voice : input.brand_voice,
      5000,
    ),
    local_context: compactText(
      input.local_context === undefined ? prior.local_context : input.local_context,
      10000,
    ),
    priority_locations: compactText(
      input.priority_locations === undefined ? prior.priority_locations : input.priority_locations,
      10000,
    ),
    avoid_topics: compactText(
      input.avoid_topics === undefined ? prior.avoid_topics : input.avoid_topics,
      5000,
    ),
    asset_filter_tag: compactText(
      input.asset_filter_tag === undefined ? prior.asset_filter_tag : input.asset_filter_tag,
      120,
    ) || slug,
    background_color: compactText(
      input.background_color === undefined ? prior.background_color : input.background_color,
      20,
    ),
    default_formats: normalizeStringArray(
      input.default_formats === undefined ? (prior.default_formats || PROFILE_SETUP_DEFAULT_FORMATS) : input.default_formats,
      PROFILE_SETUP_DEFAULT_FORMATS,
      PROFILE_SETUP_DEFAULT_FORMATS.length,
    ),
    content_themes: normalizeStringArray(
      input.content_themes === undefined ? (prior.content_themes || PROFILE_SETUP_DEFAULT_THEMES) : input.content_themes,
      PROFILE_SETUP_DEFAULT_THEMES,
      PROFILE_SETUP_DEFAULT_THEMES.length,
    ),
    platforms,
    created_at: compactText(prior.created_at || input.created_at, 40) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    activated_at: compactText(input.activated_at === undefined ? prior.activated_at : input.activated_at, 40) || null,
  };
}

export function profileSetupSelectedPlatformLabels(state) {
  return PLATFORM_KEYS
    .filter((key) => state?.platforms?.[key]?.enabled)
    .map((key) => PROFILE_SETUP_PLATFORMS[key].label);
}

export function profileSetupChecklist(state, connections = {}) {
  const basicsComplete = Boolean(
    state?.profile_id
      && state?.city
      && state?.profile_name
      && state?.brand_name
      && state?.timezone
      && state?.state_region
      && state?.country
  );
  const strategyComplete = Boolean(
    state?.local_context
      && state?.priority_locations
      && state?.default_hashtags
      && Array.isArray(state?.content_themes)
      && state.content_themes.length
  );
  const selected = PLATFORM_KEYS.filter((key) => state?.platforms?.[key]?.enabled);
  const platformItems = selected.map((key) => {
    const saved = state?.platforms?.[key] || {};
    const connection = connections?.[key] || {};
    const connected = connection.status === "connected";
    const deferred = Boolean(saved.deferred);
    return {
      key,
      label: PROFILE_SETUP_PLATFORMS[key].label,
      ok: connected || deferred,
      connected,
      deferred,
      status: connected ? "connected" : deferred ? "deferred" : (connection.status || saved.last_status || "not_configured"),
      error: connection.error || saved.last_error || null,
    };
  });
  const platformsComplete = platformItems.every((item) => item.ok);
  const selectedAny = selected.length > 0;
  const canActivate = basicsComplete && strategyComplete && selectedAny && platformsComplete;
  return {
    basics: { ok: basicsComplete, label: "City profile basics" },
    strategy: { ok: strategyComplete, label: "Content strategy and seed context" },
    platforms: { ok: selectedAny && platformsComplete, label: "Selected platform setup" },
    selected_platform_count: selected.length,
    platform_items: platformItems,
    can_activate: canActivate,
  };
}

export function profileSetupPublicPlatformDescriptors() {
  return Object.fromEntries(
    Object.entries(PROFILE_SETUP_PLATFORMS).map(([key, value]) => [key, { ...value }]),
  );
}
