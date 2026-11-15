/**
 * Engagement orchestration used by the Studio Worker.
 * Persistence defaults to Pipeline Settings JSON (fast, consistent with watchlists)
 * and optionally mirrors rows into Engagement Targets / Actions / Settings tables.
 */

import {
  ENGAGEMENT_STORE_SETTING,
  ENGAGEMENT_SETTINGS_SETTING,
  ENGAGEMENT_DISCOVERY_LAST_SETTING,
  ENGAGEMENT_DISCOVERY_CRON_TTL_MS,
  ENGAGEMENT_PROFILES,
  DEFAULT_PROFILE_TOPICS,
  PLATFORM_CAPABILITIES,
  PLACE_REVIEW_STORE_SETTING,
  PLACE_REVIEW_WEEKLY_CAP,
  capabilityMatrixResponse,
  parseEngagementStore,
  parseEngagementSettingsMap,
  mergeEngagementSettings,
  defaultEngagementSettings,
  normalizeEngagementProfile,
  normalizeEngagementPlatform,
  filterAndRankCandidates,
  buildCommentGenerationPrompt,
  normalizeGeneratedComments,
  fallbackCommentSuggestions,
  buildTargetRecord,
  buildActionRecord,
  enrichEngagementHistory,
  actionSupported,
  findDuplicateAction,
  makeIdempotencyKey,
  creatorRecentlyEngaged,
  dailyActionCount,
  sanitizeCommentSuggestion,
  classifyEngagementFailure,
  shouldSuspendProfilePlatform,
  pruneEngagementStore,
  ensureThreeCommentSuggestions,
  computeEngagementInsights,
  mapYoutubeSearchItem,
  nearIdenticalComment,
  parsePlaceReviewStore,
  emptyPlaceReviewStore,
  prunePlaceReviewStore,
  aggregateVisitedPlaces,
  buildPlaceReviewTargetRecord,
  buildPlaceReviewActionRecord,
  buildPlaceReviewGenerationPrompt,
  normalizePlaceReviewDrafts,
  fallbackPlaceReviewDrafts,
  sanitizePlaceReviewDraft,
  weeklyPlaceReviewCount,
  placeReviewDedupeKey,
  placeReviewLabel,
  normalizePlaceKey,
} from "./engagement.mjs";

export const ENGAGEMENT_TARGETS_TABLE = "tblhE7YHDnj2lxJPC";
export const ENGAGEMENT_ACTIONS_TABLE = "tbl1bjkyC2jAgt3tl";
export const ENGAGEMENT_SETTINGS_TABLE = "tblY1wDxmrf5khAYy";

export {
  ENGAGEMENT_STORE_SETTING,
  ENGAGEMENT_SETTINGS_SETTING,
  ENGAGEMENT_DISCOVERY_LAST_SETTING,
  ENGAGEMENT_DISCOVERY_CRON_TTL_MS,
  PLACE_REVIEW_STORE_SETTING,
  PLACE_REVIEW_WEEKLY_CAP,
  capabilityMatrixResponse,
  PLATFORM_CAPABILITIES,
};

export async function studioLoadEngagementStore(env, deps) {
  const row = await deps.studioSettingsByName(env, ENGAGEMENT_STORE_SETTING).catch(() => null);
  return parseEngagementStore(row?.fields?.Setting_Value || row?.fields?.Value || "{}");
}

export async function studioSaveEngagementStore(env, store, deps) {
  const pruned = pruneEngagementStore(store);
  await deps.studioUpsertSetting(
    env,
    ENGAGEMENT_STORE_SETTING,
    JSON.stringify(pruned),
    "Social Engagement targets and actions ledger (Stage A/B/C)."
  );
  return pruned;
}

export async function studioLoadEngagementSettings(env, profile, deps) {
  const theme = normalizeEngagementProfile(profile);
  const row = await deps.studioSettingsByName(env, ENGAGEMENT_SETTINGS_SETTING).catch(() => null);
  const map = parseEngagementSettingsMap(row?.fields?.Setting_Value || row?.fields?.Value || "{}");
  return map[theme] || defaultEngagementSettings(theme);
}

export async function studioSaveEngagementSettings(env, settings, deps) {
  const theme = normalizeEngagementProfile(settings.profile);
  const row = await deps.studioSettingsByName(env, ENGAGEMENT_SETTINGS_SETTING).catch(() => null);
  const map = parseEngagementSettingsMap(row?.fields?.Setting_Value || row?.fields?.Value || "{}");
  map[theme] = mergeEngagementSettings(settings, theme);
  await deps.studioUpsertSetting(
    env,
    ENGAGEMENT_SETTINGS_SETTING,
    JSON.stringify(map),
    "Per-profile Social Engagement settings."
  );
  await mirrorSettingsRow(env, map[theme], deps).catch((error) => console.warn("engagement settings mirror failed", error));
  return map[theme];
}

async function mirrorSettingsRow(env, settings, deps) {
  if (!deps.airtableFetch || !deps.listRecords) return;
  const name = `ENGAGEMENT_${settings.profile.toUpperCase()}`;
  const existing = await deps.listRecords(env, ENGAGEMENT_SETTINGS_TABLE, {
    filterFormula: `{Setting_Name}="${name}"`,
    limit: 1,
  }).catch(() => []);
  const fields = {
    Setting_Name: name,
    Brand_Profile: settings.profile,
    Platform: "all",
    Settings_JSON: JSON.stringify(settings),
    Enabled: settings.enabled !== false,
    Updated_At: new Date().toISOString(),
  };
  if (existing[0]?.id) {
    await deps.airtableFetch(env, ENGAGEMENT_SETTINGS_TABLE, existing[0].id, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
  } else {
    await deps.airtableFetch(env, ENGAGEMENT_SETTINGS_TABLE, "", {
      method: "POST",
      body: JSON.stringify({ fields, typecast: true }),
    });
  }
}

async function mirrorTargetRow(env, target, deps) {
  if (!deps.airtableFetch) return;
  await deps.airtableFetch(env, ENGAGEMENT_TARGETS_TABLE, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Target_ID: target.target_id,
        Brand_Profile: target.profile,
        Platform: target.platform,
        Creator_ID: target.creator_id,
        Creator_Name: target.creator_name,
        Post_ID: target.post_id,
        Post_URL: target.post_url || undefined,
        Discovered_At: target.discovered_at,
        Content_Summary: target.content_summary,
        Caption: target.caption,
        Relevance_Score: target.relevance_score,
        Recommend_Reason: target.recommend_reason,
        Eligibility_Status: target.eligibility_status,
        Suggested_Comments_JSON: JSON.stringify(target.suggested_comments || []),
        Hashtags: (target.hashtags || []).join(" "),
        Location: target.location || "",
        Preview_URL: target.preview_url || undefined,
        Dedupe_Key: target.dedupe_key,
      },
      typecast: true,
    }),
  }).catch((error) => console.warn("engagement target mirror failed", error));
}

async function mirrorActionRow(env, action, deps) {
  if (!deps.airtableFetch) return;
  await deps.airtableFetch(env, ENGAGEMENT_ACTIONS_TABLE, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Action_ID: action.action_id,
        Target_ID: action.target_id,
        Brand_Profile: action.profile,
        Platform: action.platform,
        Action_Type: action.action_type,
        Suggested_Comment: action.suggested_comment || "",
        Edited_Comment: action.edited_comment || "",
        Approval_Status: action.approval_status,
        Execution_Status: action.execution_status,
        Published_Comment_ID: action.published_comment_id || "",
        Error_Details: action.error_details || "",
        Idempotency_Key: action.idempotency_key,
        Created_At: action.created_at,
        Approved_At: action.approved_at || "",
        Executed_At: action.executed_at || "",
      },
      typecast: true,
    }),
  }).catch((error) => console.warn("engagement action mirror failed", error));
}

export async function studioDiscoverYoutubeEngagementPosts(env, settings, deps) {
  const pipelineSettings = await deps.studioActivePipelineSettings(env, ["YOUTUBE_API_KEY"]).catch(() => ({}));
  const youtubeKey = pipelineSettings.YOUTUBE_API_KEY || env.YOUTUBE_API_KEY;
  if (!youtubeKey) {
    return { ok: false, status: "needs_key", posts: [], message: "Add YOUTUBE_API_KEY to discover YouTube engagement candidates." };
  }
  const topics = DEFAULT_PROFILE_TOPICS[settings.profile] || DEFAULT_PROFILE_TOPICS.chicago;
  const queries = (topics.youtube_queries || settings.keywords || [])
    .map((query) => String(query || "").trim())
    .filter(Boolean);
  const picked = (queries.length ? queries : [`${settings.profile} photography`]).slice(0, 4);
  const maxResults = Math.min(10, Math.max(5, Number(settings.max_candidates_per_run) || 20));
  const seen = new Set();
  const posts = [];
  const errors = [];
  for (const query of picked) {
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=${encodeURIComponent(String(maxResults))}` +
      `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(youtubeKey)}`;
    const response = await fetch(searchUrl);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      errors.push(String(body?.error?.message || `YouTube search HTTP ${response.status}`).slice(0, 200));
      continue;
    }
    for (const post of (body.items || []).map(mapYoutubeSearchItem).filter(Boolean)) {
      if (seen.has(post.post_id)) continue;
      seen.add(post.post_id);
      posts.push(post);
    }
  }
  const query = picked.join(" | ");
  if (!posts.length && errors.length) {
    return { ok: false, status: "error", posts: [], query, message: errors[0] };
  }
  return { ok: true, status: "ok", posts, query, message: `Found ${posts.length} YouTube video(s) for ${settings.profile}.` };
}

export async function studioGenerateEngagementComments(env, post, settings, deps) {
  const maxSuggestions = Math.max(1, Math.min(3, Number(settings.max_comment_suggestions) || 3));
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) {
    return fallbackCommentSuggestions(post, maxSuggestions);
  }
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const prompt = buildCommentGenerationPrompt(post, settings, maxSuggestions);
  try {
    const response = await fetch(runnerUrl + "/jobs/autonomous-pick", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      body: JSON.stringify({ prompt }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return fallbackCommentSuggestions(post, maxSuggestions);
    const parsed = body?.parsed && typeof body.parsed === "object" ? body.parsed : body;
    const normalized = normalizeGeneratedComments(parsed, maxSuggestions);
    if (!normalized.comments.length) return fallbackCommentSuggestions(post, maxSuggestions);
    return normalized;
  } catch {
    return fallbackCommentSuggestions(post, maxSuggestions);
  }
}

function engagementDiscoveryMessage(profile, addedCount, scanned, platformNotes) {
  if (addedCount) return `Queued ${addedCount} engagement recommendation(s) for ${profile}.`;
  const youtube = (platformNotes || []).find((row) => row.platform === "youtube");
  if (youtube && youtube.ok === false && youtube.message) return youtube.message;
  if (!scanned) return `No YouTube posts found for ${profile}. Instagram, Facebook, and TikTok discovery are not available yet.`;
  return `Scanned ${scanned} YouTube post(s) for ${profile}; none matched this profile closely enough to queue.`;
}

function discoveryLastSettingName(profile) {
  return `${ENGAGEMENT_DISCOVERY_LAST_SETTING}_${normalizeEngagementProfile(profile).toUpperCase()}`;
}

export async function studioRunEngagementDiscovery(env, options, deps) {
  const profile = normalizeEngagementProfile(options.profile || "chicago");
  const scheduled = options.scheduled === true;
  const force = options.force === true;
  if (scheduled && !force) {
    const lastRow = await deps.studioSettingsByName(env, discoveryLastSettingName(profile)).catch(() => null);
    const lastRaw = String(lastRow?.fields?.Setting_Value || lastRow?.fields?.Value || "").trim();
    const lastMs = Date.parse(lastRaw);
    if (Number.isFinite(lastMs) && Date.now() - lastMs < ENGAGEMENT_DISCOVERY_CRON_TTL_MS) {
      return {
        ok: true,
        status: "throttled",
        profile,
        added: [],
        message: `Engagement discovery throttled for ${profile}. Last run ${new Date(lastMs).toISOString()}.`,
      };
    }
  }

  const settings = await studioLoadEngagementSettings(env, profile, deps);
  if (settings.enabled === false) {
    return { ok: true, status: "disabled", profile, added: [], message: "Engagement discovery disabled for this profile." };
  }

  const store = await studioLoadEngagementStore(env, deps);
  const collected = [];
  const platformNotes = [];

  if (settings.platforms.youtube !== false && PLATFORM_CAPABILITIES.youtube.discover === "supported") {
    const yt = await studioDiscoverYoutubeEngagementPosts(env, settings, deps);
    platformNotes.push({ platform: "youtube", ...yt, posts: undefined, count: (yt.posts || []).length });
    collected.push(...(yt.posts || []));
  }
  for (const platform of ["instagram", "facebook", "tiktok"]) {
    if (settings.platforms[platform] === false) continue;
    const cap = PLATFORM_CAPABILITIES[platform];
    platformNotes.push({
      platform,
      ok: false,
      status: cap.discover,
      count: 0,
      message:
        platform === "instagram"
          ? "Instagram discovery paused pending Meta business_discovery permission #10. Use Open Post / watchlist creators manually."
          : `${platform} third-party discovery is unsupported via official APIs. Recommendations use Open Post only when manually sourced later.`,
    });
  }

  const ranked = filterAndRankCandidates(collected, settings, store.targets);
  const added = [];
  for (const post of ranked) {
    if (creatorRecentlyEngaged(store.actions, post.creator_id || post.channel_id, post.platform, settings.min_hours_between_creator_comments)) {
      continue;
    }
    const generated = await studioGenerateEngagementComments(env, post, settings, deps);
    const comments = generated.comments || [];
    if (!comments.length) continue;
    const target = buildTargetRecord(post, settings, comments);
    store.targets.unshift(target);
    added.push(target);
    await mirrorTargetRow(env, target, deps);
    if (added.length >= (settings.max_candidates_per_run || 20)) break;
  }

  store.updated_at = new Date().toISOString();
  await studioSaveEngagementStore(env, store, deps);
  await deps.studioUpsertSetting(
    env,
    discoveryLastSettingName(profile),
    store.updated_at,
    `Last Social Engagement discovery run for ${profile} (cron throttled to once per day).`
  ).catch((error) => console.warn("engagement discovery stamp failed", error));

  return {
    ok: true,
    status: "ok",
    profile,
    stage: settings.stage_b_enabled ? "B" : "A",
    added,
    added_count: added.length,
    scanned: collected.length,
    platforms: platformNotes,
    message: engagementDiscoveryMessage(profile, added.length, collected.length, platformNotes),
  };
}

export async function studioListEngagementRecommendations(env, options, deps) {
  const profile = normalizeEngagementProfile(options.profile || "chicago");
  const platform = normalizeEngagementPlatform(options.platform || "");
  const store = await studioLoadEngagementStore(env, deps);
  const settings = await studioLoadEngagementSettings(env, profile, deps);
  let dirty = false;
  // Repair cards that the ledger shrink over-slimmed to a single comment option.
  store.targets = (store.targets || []).map((row) => {
    const open = !["Skipped", "Blocked Creator", "Engaged"].includes(String(row?.eligibility_status || ""));
    const pending = String(row?.approval_status || "pending").toLowerCase() === "pending";
    const count = Array.isArray(row?.suggested_comments) ? row.suggested_comments.length : 0;
    if (!open || !pending || count >= 3) return row;
    dirty = true;
    return ensureThreeCommentSuggestions(row, settings.max_comment_suggestions || 3);
  });
  if (dirty) {
    await studioSaveEngagementStore(env, store, deps).catch((error) => {
      console.warn("engagement comment-option repair save failed", error);
    });
  }
  let rows = store.targets.filter((row) => row.profile === profile);
  if (platform) rows = rows.filter((row) => row.platform === platform);
  if (options.status) {
    const status = String(options.status).toLowerCase();
    rows = rows.filter((row) => String(row.approval_status || row.eligibility_status || "").toLowerCase() === status
      || String(row.eligibility_status || "").toLowerCase() === status);
  } else {
    rows = rows.filter((row) => !["Skipped", "Blocked Creator", "Engaged"].includes(row.eligibility_status));
  }
  rows.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
  return {
    ok: true,
    profile,
    settings,
    capabilities: PLATFORM_CAPABILITIES,
    recommendations: rows.slice(0, 100),
    history: enrichEngagementHistory(
      store.actions.filter((row) => row.profile === profile).slice(0, 100),
      store.targets
    ),
  };
}

// The Engagement resolver uses per-profile destinations, but its batched
// Airtable lookup can omit an active legacy key. Recover a missing key using
// the same active-only single-setting lookup used elsewhere in Studio. This
// never invents a key, changes a stored credential, or posts on its own.
async function resolveEngagementYoutubeUploader(env, deps, profile) {
  const settings = await deps.studioActivePipelineSettings(env, [
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
  ]).catch(() => ({}));
  const base = String(settings.YOUTUBE_UPLOAD_SERVICE_URL || "").trim().replace(/\/+$/, "");
  let secret = String(settings.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || env?.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || "").trim();
  if (!secret && typeof deps.studioSettingsByName === "function") {
    // Try a profile-specific legacy key before the shared key. If neither
    // exists, fail closed rather than issuing an unauthenticated action.
    const prefix = { nyc: "NYC_", la: "LA_", miami: "MIAMI_" }[String(profile || "").toLowerCase()] || "";
    for (const name of [
      ...(prefix ? [`${prefix}YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET`] : []),
      "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
    ]) {
      const row = await deps.studioSettingsByName(env, name).catch(() => null);
      secret = String(row?.fields?.Setting_Value || row?.fields?.Value || "").trim();
      if (secret) break;
    }
  }
  return { base, secret };
}

// Read-only check before lifting a permission suspension. Never retry a write
// automatically: only a fresh, explicit Comment/Like click can execute one.
async function probeYoutubeEngagementConnection(env, deps, profile) {
  const { base, secret } = await resolveEngagementYoutubeUploader(env, deps, profile);
  if (!base) return { ok: false, error: "This profile has no YouTube uploader URL configured" };
  if (!secret) return { ok: false, error: "This profile has no uploader service key configured" };
  try {
    const response = await fetch(base + "/youtube/oauth/status", {
      method: "GET",
      headers: { Accept: "application/json", "X-SM-Pipeline-Key": secret },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      return { ok: false, error: "Uploader Unauthorized (401): Studio and uploader shared keys do not match" };
    }
    if (!response.ok) return { ok: false, error: `Uploader connection check returned HTTP ${response.status}` };
    if (!body.refresh_ok) return { ok: false, error: "YouTube OAuth refresh is not healthy for this profile" };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Uploader connection check failed: ${String(error?.message || error).slice(0, 140)}` };
  }
}

async function executeYoutubeAction(env, target, actionType, comment, deps) {
  const { base, secret } = await resolveEngagementYoutubeUploader(env, deps, target.profile);
  if (!base) {
    return { ok: false, status: "needs_authorization", error: "YouTube uploader service is not configured for this profile." };
  }
  if (!secret) {
    return { ok: false, status: "needs_authorization", error: "This profile has no uploader service key available to Studio. No action was sent." };
  }
  // Health is public. Engage routes sit behind the shared secret, so a missing
  // route looks like 404 only after auth. Detect stale builds up front.
  try {
    const health = await fetch(`${base}/health`, { method: "GET", headers: { Accept: "application/json" } });
    const healthBody = await health.json().catch(() => ({}));
    const version = String(healthBody?.version || "");
    if (health.ok && version && !/engagement/i.test(version)) {
      return {
        ok: false,
        status: "unsupported",
        error: `YouTube uploader is stale (${version}); needs engagement build. Companion/Deploy-SMService this profile's youtube-uploader, then retry.`,
      };
    }
  } catch {
    // Fall through to the engage call; network errors surface there.
  }
  const path = actionType === "like" ? "/youtube/engage/like" : "/youtube/engage/comment";
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(secret ? { "X-SM-Pipeline-Key": secret } : {}),
    },
    body: JSON.stringify({
      video_id: target.post_id,
      comment: comment || "",
      idempotency_key: makeIdempotencyKey(target.profile, target.platform, actionType, target.post_id),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    return {
      ok: false,
      status: "needs_authorization",
      error: "Unauthorized (401): This profile's YouTube uploader rejected Studio's shared key. No comment was sent. Repair the uploader key before retrying.",
    };
  }
  if (response.status === 404) {
    return {
      ok: false,
      status: "unsupported",
      error: "YouTube uploader build lacks /youtube/engage endpoints. Deploy uploader, then retry once.",
    };
  }
  const publishedId = body?.comment_id || body?.id || null;
  if (!response.ok || body?.ok === false || (actionType === "comment" && !publishedId)) {
    const ambiguous = Boolean(body?.ambiguous || body?.upstream?.ambiguous);
    return {
      ok: false,
      status: ambiguous ? "ambiguous" : "failed",
      error: String(
        body?.error
        || body?.message
        || (actionType === "comment" && response.ok
          ? "YouTube did not return a comment id. Nothing was published."
          : `YouTube engage HTTP ${response.status}`)
      ).slice(0, 400),
      published_id: publishedId,
      ambiguous,
    };
  }
  return {
    ok: true,
    status: "published",
    published_id: publishedId || (actionType === "like" ? "liked" : null),
    message: body?.message || null,
  };
}

export async function studioApplyEngagementAction(env, payload, deps) {
  const profile = normalizeEngagementProfile(payload.profile || "chicago");
  const actionType = String(payload.action || payload.action_type || "").trim().toLowerCase();
  const targetId = String(payload.target_id || "").trim();
  if (!targetId) throw new Error("target_id is required");
  if (!["approve", "edit", "like", "comment", "skip", "block_creator", "open_post"].includes(actionType)) {
    throw new Error("Unsupported engagement action");
  }

  const store = await studioLoadEngagementStore(env, deps);
  let settings = await studioLoadEngagementSettings(env, profile, deps);
  const target = store.targets.find((row) => row.target_id === targetId && row.profile === profile);
  if (!target) throw new Error("Engagement target not found for this profile");

  // A Comment or Like click is the publish. NYC/LA profile keys used to miss
  // the saved Stage B flag, so the click recorded nothing and the queue reload
  // cleared "Sending comment…". Persist Stage B for this profile, then post.
  if ((payload.stage_b_enabled === true || actionType === "comment" || actionType === "like") && settings.stage_b_enabled !== true) {
    settings = await studioSaveEngagementSettings(
      env,
      { ...settings, stage_b_enabled: true, stage: "B" },
      deps
    );
  }

  if (actionType === "edit") {
    const edited = sanitizeCommentSuggestion(payload.comment || payload.edited_comment || "");
    if (!edited) throw new Error("Edited comment failed safety checks");
    target.selected_comment = edited;
    target.approval_status = "edited";
    if (!target.suggested_comments.includes(edited)) target.suggested_comments = [edited, ...target.suggested_comments].slice(0, 3);
    await studioSaveEngagementStore(env, store, deps);
    return { ok: true, target, message: "Comment updated. Click Comment to publish where supported." };
  }

  if (actionType === "skip") {
    target.eligibility_status = "Skipped";
    target.approval_status = "skipped";
    const action = buildActionRecord({ target, actionType: "skip", approvalStatus: "skipped", executionStatus: "manual" });
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return { ok: true, target, action, message: "Recommendation skipped." };
  }

  if (actionType === "block_creator") {
    target.eligibility_status = "Blocked Creator";
    target.approval_status = "rejected";
    const block = String(target.creator_id || target.creator_name || "").trim();
    if (block && !settings.creator_blocklist.includes(block)) {
      settings.creator_blocklist.push(block);
      await studioSaveEngagementSettings(env, settings, deps);
    }
    const action = buildActionRecord({ target, actionType: "block_creator", approvalStatus: "rejected", executionStatus: "manual" });
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return { ok: true, target, action, settings, message: "Creator blocked from future recommendations." };
  }

  if (actionType === "open_post") {
    const action = buildActionRecord({ target, actionType: "open_post", approvalStatus: "approved", executionStatus: "manual" });
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return {
      ok: true,
      target,
      action,
      manual: true,
      post_url: target.post_url,
      message: "Open the original post for manual engagement. No automated action was claimed.",
    };
  }

  // Approve used to only queue. With Stage B on it is the same as Comment (approve + publish).
  // Stage A still records approval without an external write.
  if (actionType === "approve" && settings.stage_b_enabled !== true) {
    const comment = sanitizeCommentSuggestion(payload.comment || target.selected_comment || (target.suggested_comments || [])[0] || "");
    if (!comment) throw new Error("No safe comment available to approve");
    target.selected_comment = comment;
    target.approval_status = "approved";
    const action = buildActionRecord({
      target,
      actionType: "comment",
      comment,
      approvalStatus: "approved",
      executionStatus: "pending",
    });
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return {
      ok: true,
      target,
      action,
      message: "Comment approved (Stage A). Enable Stage B, then click Comment to publish where supported.",
    };
  }
  // like / comment execution (Stage B). Approve with Stage B uses the Comment publish path.
  const execType = actionType === "like" ? "like" : "comment";
  if (!settings.stage_b_enabled) {
    const action = buildActionRecord({
      target,
      actionType: execType,
      comment: payload.comment || target.selected_comment,
      approvalStatus: "approved",
      executionStatus: "unsupported",
      error: `Stage B publish is disabled for ${profile}. Enable Stage B, then click Comment again.`,
    });
    action.classification = classifyEngagementFailure(action.error_details);
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return {
      ok: false,
      unsupported: true,
      stage_b_disabled: true,
      target,
      action,
      message: action.error_details,
      post_url: target.post_url,
    };
  }
  if (!actionSupported(target.platform, execType)) {
    const action = buildActionRecord({
      target,
      actionType: execType,
      comment: payload.comment || target.selected_comment,
      approvalStatus: "approved",
      executionStatus: "unsupported",
      error: `${target.platform} ${execType} is unsupported via official API. Use Open Post.`,
    });
    action.classification = classifyEngagementFailure(action.error_details);
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return {
      ok: false,
      unsupported: true,
      target,
      action,
      post_url: target.post_url,
      message: action.error_details,
    };
  }

  const suspendKey = `${profile}:${target.platform}`;
  const suspension = store.suspended?.[suspendKey];
  if (suspension) {
    const reason = String(suspension.reason || "permission/abuse warning");
    // Permission blocks can heal after an operator fixes the service connection.
    // Abuse/spam suspensions remain blocked until explicitly reviewed.
    if (target.platform === "youtube" && /unauthorized|oauth|permission|401/i.test(reason)) {
      const probe = await probeYoutubeEngagementConnection(env, deps, profile);
      if (!probe.ok) {
        return {
          ok: false,
          suspended: true,
          needs_authorization: true,
          message: `${profile.toUpperCase()} YouTube commenting is paused: ${probe.error}. No comment was sent.`,
          classification: classifyEngagementFailure(probe.error),
          post_url: target.post_url,
        };
      }
      delete store.suspended[suspendKey];
      await studioSaveEngagementStore(env, store, deps);
    } else {
      return {
        ok: false,
        suspended: true,
        message: `Engagement remains paused for ${suspendKey}: ${reason}. No comment was sent.`,
        classification: classifyEngagementFailure(reason),
        post_url: target.post_url,
      };
    }
  }

  const comment = sanitizeCommentSuggestion(
    payload.comment || target.selected_comment || (target.suggested_comments || [])[0] || ""
  );
  // One-click Comment (and Stage B Approve) locks the chosen text as approved before publish.
  if (execType === "comment" && comment) {
    target.selected_comment = comment;
    target.approval_status = "approved";
  }
  const recordBlocked = async (message) => {
    const action = buildActionRecord({
      target,
      actionType: execType,
      comment: comment || payload.comment || target.selected_comment,
      approvalStatus: "approved",
      executionStatus: "failed",
      error: message,
    });
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return { ok: false, target, action, message };
  };
  if (execType === "comment" && !comment) {
    return recordBlocked("Comment text is empty or failed the safety check. Edit it, then try Comment again.");
  }
  if (execType === "comment") {
    const priorComments = store.actions
      .filter((row) => row.action_type === "comment" && row.execution_status === "published")
      .map((row) => row.edited_comment || row.suggested_comment);
    if (priorComments.some((row) => nearIdenticalComment(row, comment))) {
      return recordBlocked("Near-identical comment rejected. Edit the text or skip this post.");
    }
  }

  const idempotencyKey = makeIdempotencyKey(profile, target.platform, execType, target.post_id);
  const duplicate = findDuplicateAction(store.actions, idempotencyKey);
  if (duplicate) {
    return {
      ok: false,
      duplicate: true,
      action: duplicate,
      message: "Duplicate engagement blocked by idempotency key.",
      classification: classifyEngagementFailure("duplicate engagement"),
    };
  }

  if (creatorRecentlyEngaged(store.actions, target.creator_id, target.platform, settings.min_hours_between_creator_comments)) {
    return recordBlocked(`This creator was already engaged in the last ${settings.min_hours_between_creator_comments} hours.`);
  }
  const limit = execType === "like" ? settings.daily_like_limit : settings.daily_comment_limit;
  if (dailyActionCount(store.actions, profile, target.platform, execType) >= limit) {
    return recordBlocked(`Daily ${execType} limit reached (${limit}) for ${profile}. Nothing was sent.`);
  }

  let result;
  try {
    if (target.platform === "youtube") {
      result = await executeYoutubeAction(env, target, execType, comment, deps);
    } else {
      result = { ok: false, status: "unsupported", error: "Unsupported platform execution path" };
    }
  } catch (error) {
    return recordBlocked(String(error?.message || error).slice(0, 400));
  }

  const action = buildActionRecord({
    target,
    actionType: execType,
    comment,
    approvalStatus: "approved",
    executionStatus: result.ok ? "published" : (result.status || "failed"),
    error: result.ok ? null : result.error,
    publishedId: result.published_id || null,
  });
  if (result.ambiguous) action.execution_status = "ambiguous";
  if (!result.ok) action.classification = classifyEngagementFailure(result.error);
  if (!result.ok && shouldSuspendProfilePlatform(result.error)) {
    store.suspended[suspendKey] = {
      at: new Date().toISOString(),
      reason: String(result.error || "").slice(0, 240),
    };
  }
  if (result.ok) {
    target.eligibility_status = "Engaged";
    target.approval_status = "approved";
  }
  store.actions.unshift(action);
  await mirrorActionRow(env, action, deps);
  await studioSaveEngagementStore(env, store, deps);
  return {
    ok: Boolean(result.ok),
    target,
    action,
    post_url: target.post_url,
    message: result.ok
      ? `${execType} published on ${target.platform}.`
      : (result.error || "Engagement execution failed"),
    classification: action.classification,
  };
}

export async function studioEngagementInsights(env, profile, deps) {
  const store = await studioLoadEngagementStore(env, deps);
  return { ok: true, ...computeEngagementInsights(store, profile || null) };
}

export async function studioEngagementCron(env, depsOrFactory) {
  const results = [];
  for (const profile of ENGAGEMENT_PROFILES) {
    const deps = typeof depsOrFactory === "function" ? depsOrFactory(profile) : depsOrFactory;
    try {
      const settings = await studioLoadEngagementSettings(env, profile, deps);
      if (settings.enabled === false || settings.discovery_schedule === "off") {
        results.push({ profile, status: "skipped" });
        continue;
      }
      const result = await studioRunEngagementDiscovery(env, { profile, scheduled: true, force: false }, deps);
      results.push({ profile, status: result.status, added: result.added_count || 0, message: result.message });
    } catch (error) {
      results.push({ profile, status: "error", message: String(error?.message || error).slice(0, 240) });
    }
  }
  return { ok: true, results };
}

export async function studioLoadPlaceReviewStore(env, deps) {
  const row = await deps.studioSettingsByName(env, PLACE_REVIEW_STORE_SETTING).catch(() => null);
  return parsePlaceReviewStore(row?.fields?.Setting_Value || row?.fields?.Value || "{}");
}

export async function studioSavePlaceReviewStore(env, store, deps) {
  const pruned = prunePlaceReviewStore(store || emptyPlaceReviewStore());
  await deps.studioUpsertSetting(
    env,
    PLACE_REVIEW_STORE_SETTING,
    JSON.stringify(pruned),
    "TikTok Place Reviews queue and manual-completion ledger (Open Place only)."
  );
  return pruned;
}

function fieldValue(record, name) {
  return record?.fields?.[name] ?? record?.[name];
}

function firstLinkedId(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") return String(first.id || first).trim();
    return String(first || "").trim();
  }
  return String(value || "").trim();
}

function escapeAirtableFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function linkedRecordIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry && typeof entry === "object") return String(entry.id || "").trim();
      return String(entry || "").trim();
    }).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
  }
  if (value && typeof value === "object") {
    const nested = value.linkedRecordIds || value.valuesByLinkedRecordId;
    if (Array.isArray(nested)) return linkedRecordIds(nested);
    if (nested && typeof nested === "object") {
      return Object.values(nested).flatMap((entry) => linkedRecordIds(entry));
    }
    if (value.id) return linkedRecordIds([value]);
  }
  const text = String(value || "").trim();
  return /^rec[A-Za-z0-9]+$/.test(text) ? [text] : [];
}

function recordMatchesContentProfile(record, profileId, profileName = "") {
  const id = String(profileId || "").trim();
  const name = String(profileName || "").trim().toLowerCase();
  const raw = fieldValue(record, "Content_Profile");
  const ids = linkedRecordIds(raw);
  if (id && ids.includes(id)) return true;
  // Lookup fields often stringify as profile display names, not rec ids.
  const blob = JSON.stringify(raw || "").toLowerCase();
  if (id && blob.includes(id.toLowerCase())) return true;
  if (name && blob.includes(name)) return true;
  return false;
}

function tiktokOutputLooksPublished(output) {
  const outputStatus = String(fieldValue(output, "Output_Status") || "").trim().toLowerCase();
  const publishStatus = String(fieldValue(output, "Publish_Status") || "").trim().toLowerCase();
  if (outputStatus === "published" || publishStatus === "published") return true;
  if (fieldValue(output, "Published_At")) return true;
  if (String(fieldValue(output, "Platform_Post_ID") || "").trim()) return true;
  if (String(fieldValue(output, "Platform_Post_URL") || "").trim()) return true;
  return false;
}

export async function studioCollectVisitedPlacesForProfile(env, profile, deps) {
  const theme = normalizeEngagementProfile(profile);
  if (!deps.listRecords || !deps.listContentProfileRecords) {
    return { ok: false, places: [], message: "Place review discovery is missing Airtable list helpers." };
  }
  const profiles = await deps.listContentProfileRecords(env).catch(() => []);
  const match = (profiles || []).find((row) => {
    const key = typeof deps.studioThemeForProfile === "function"
      ? deps.studioThemeForProfile(row)
      : normalizeEngagementProfile(fieldValue(row, "Market_Name") || fieldValue(row, "Profile_Name"));
    return normalizeEngagementProfile(key) === theme;
  });
  if (!match?.id) {
    return { ok: false, places: [], message: `No Content Profile found for ${theme}.` };
  }
  const profileName = String(fieldValue(match, "Profile_Name") || "").trim();
  // Do NOT put Content_Profile FIND in the Airtable formula. On Platform Outputs
  // Content_Profile is a lookup-of-link; FIND/ARRAYJOIN on that field often 422s
  // or returns zero rows even when Published TikToks have Primary_Location.
  // Keep the Airtable filter lean, then match the profile in JS after fetch.
  const formula = 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",OR({Do_Not_Publish}=BLANK(),{Do_Not_Publish}=0),OR({Output_Status}="Published",{Publish_Status}="Published",NOT({Published_At}=BLANK()),NOT({Platform_Post_ID}=BLANK()),NOT({Platform_Post_URL}=BLANK())))';
  let outputs = [];
  try {
    outputs = await deps.listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 200,
      filterFormula: formula,
      sortField: "Published_At",
      sortDirection: "desc",
      fields: [
        "Output_ID",
        "Platform",
        "Output_Status",
        "Publish_Status",
        "Published_At",
        "Platform_Post_ID",
        "Platform_Post_URL",
        "Content_Item",
        "Content_Profile",
        // Platform Outputs title field (not a content-item title lookup).
        "Output_Title",
        "Thumbnail_URL",
        "Studio_Preview_URL",
        "Do_Not_Publish",
      ],
    });
  } catch (error) {
    return {
      ok: false,
      places: [],
      profile_id: match.id,
      scanned_outputs: 0,
      message: "TikTok place scan failed: " + String(error?.message || error).slice(0, 220),
    };
  }

  const contentCache = new Map();
  const rows = [];
  let matchedProfile = 0;
  for (const output of outputs || []) {
    if (!tiktokOutputLooksPublished(output)) continue;
    const contentId = firstLinkedId(fieldValue(output, "Content_Item"));
    if (!contentId) continue;
    let content = contentCache.get(contentId);
    if (content === undefined && deps.airtableFetch && env.AIRTABLE_CONTENT_TABLE_ID) {
      content = await deps.airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId).catch(() => null);
      contentCache.set(contentId, content);
    }
    const onProfile = recordMatchesContentProfile(output, match.id, profileName)
      || recordMatchesContentProfile(content, match.id, profileName);
    if (!onProfile) continue;
    matchedProfile += 1;
    const placeName = String(
      fieldValue(content, "Primary_Location")
      || fieldValue(content, "Neighborhood_or_Area")
      || ""
    ).trim();
    if (!placeName) continue;
    const market = String(
      fieldValue(content, "Market_Name")
      || fieldValue(match, "Market_Name")
      || theme
    ).trim();
    const neighborhood = String(fieldValue(content, "Neighborhood_or_Area") || "").trim();
    rows.push({
      place_name: placeName,
      market: Array.isArray(market) ? String(market[0] || "").trim() : market,
      neighborhood: neighborhood && neighborhood !== placeName ? neighborhood : "",
      content_title: String(
        fieldValue(content, "Content_Title")
        || fieldValue(output, "Output_Title")
        || ""
      ).trim(),
      content_item_id: contentId,
      output_id: output.id,
      published_at: fieldValue(output, "Published_At") || null,
      preview_url: String(
        fieldValue(output, "Thumbnail_URL")
        || fieldValue(output, "Studio_Preview_URL")
        || fieldValue(content, "Thumbnail_URL")
        || ""
      ).trim(),
    });
  }
  return {
    ok: true,
    places: aggregateVisitedPlaces(rows, theme),
    profile_id: match.id,
    scanned_outputs: (outputs || []).length,
    matched_profile_outputs: matchedProfile,
    located_outputs: rows.length,
  };
}

export async function studioGeneratePlaceReviewDrafts(env, place, settings) {
  const maxSuggestions = 3;
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return fallbackPlaceReviewDrafts(place, maxSuggestions);
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const prompt = buildPlaceReviewGenerationPrompt(place, settings, maxSuggestions);
  try {
    const response = await fetch(runnerUrl + "/jobs/autonomous-pick", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      body: JSON.stringify({ prompt }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return fallbackPlaceReviewDrafts(place, maxSuggestions);
    const parsed = body?.parsed && typeof body.parsed === "object" ? body.parsed : body;
    const normalized = normalizePlaceReviewDrafts(parsed, maxSuggestions);
    if (!normalized.reviews.length) return fallbackPlaceReviewDrafts(place, maxSuggestions);
    return normalized;
  } catch {
    return fallbackPlaceReviewDrafts(place, maxSuggestions);
  }
}

export async function studioRunPlaceReviewDiscovery(env, options, deps) {
  const profiles = options.all_profiles
    ? [...ENGAGEMENT_PROFILES]
    : [normalizeEngagementProfile(options.profile || "chicago")];
  const store = await studioLoadPlaceReviewStore(env, deps);
  const added = [];
  const notes = [];
  for (const profile of profiles) {
    const settings = await studioLoadEngagementSettings(env, profile, deps);
    const collected = await studioCollectVisitedPlacesForProfile(env, profile, deps);
    notes.push({
      profile,
      ok: collected.ok !== false,
      scanned_outputs: collected.scanned_outputs || 0,
      matched_profile_outputs: collected.matched_profile_outputs || 0,
      located_outputs: collected.located_outputs || 0,
      place_count: (collected.places || []).length,
      message: collected.message || null,
    });
    if (collected.ok === false) continue;
    if (!collected.places?.length) continue;
    const remainingCap = Math.max(
      0,
      PLACE_REVIEW_WEEKLY_CAP - weeklyPlaceReviewCount(store.actions, profile)
    );
    if (!remainingCap) {
      notes[notes.length - 1].message = `Weekly place-review cap (${PLACE_REVIEW_WEEKLY_CAP}) reached for ${profile}.`;
      continue;
    }
    const existingKeys = new Set(
      (store.targets || [])
        .filter((row) => row.profile === profile)
        .map((row) => row.dedupe_key || placeReviewDedupeKey(row.profile, row.location, row.market))
    );
    let addedForProfile = 0;
    for (const place of collected.places) {
      if (addedForProfile >= remainingCap) break;
      const key = place.dedupe_key || placeReviewDedupeKey(profile, place.place_name, place.market);
      if (existingKeys.has(key)) continue;
      const reviewed = (store.actions || []).some(
        (action) =>
          action.profile === profile
          && action.action_type === "mark_reviewed"
          && action.execution_status === "manual_completed"
          && (action.idempotency_key === makeIdempotencyKey(profile, "tiktok", "mark_reviewed", normalizePlaceKey(place.place_name))
            || normalizePlaceKey(action.location) === normalizePlaceKey(place.place_name))
      );
      if (reviewed) continue;
      const generated = await studioGeneratePlaceReviewDrafts(env, place, settings);
      const drafts = generated.reviews || [];
      if (!drafts.length) continue;
      const target = buildPlaceReviewTargetRecord(place, settings, drafts, 5);
      store.targets.unshift(target);
      existingKeys.add(target.dedupe_key);
      added.push(target);
      addedForProfile += 1;
    }
  }
  store.updated_at = new Date().toISOString();
  await studioSavePlaceReviewStore(env, store, deps);
  return {
    ok: true,
    status: "ok",
    added,
    added_count: added.length,
    profiles: notes,
    weekly_cap: PLACE_REVIEW_WEEKLY_CAP,
    message: added.length
      ? `Queued ${added.length} TikTok place review(s) for manual Open Place.`
      : buildEmptyPlaceDiscoveryMessage(notes),
  };
}

function buildEmptyPlaceDiscoveryMessage(notes = []) {
  const failed = (notes || []).find((row) => row?.ok === false && row?.message);
  if (failed?.message) return String(failed.message);
  const scanned = (notes || []).reduce((sum, row) => sum + Number(row?.scanned_outputs || 0), 0);
  const matched = (notes || []).reduce((sum, row) => sum + Number(row?.matched_profile_outputs || 0), 0);
  const located = (notes || []).reduce((sum, row) => sum + Number(row?.located_outputs || 0), 0);
  if (scanned > 0 && matched === 0) {
    return `Scanned ${scanned} published TikTok output(s), but none matched this Content Profile. Try Discover all profiles.`;
  }
  if (matched > 0 && located === 0) {
    return `Found ${matched} published TikTok output(s) for this profile, but none have Primary_Location (or Neighborhood) on the Content Item.`;
  }
  if (located > 0) {
    return `Found ${located} located TikTok place(s), but they are already queued, already reviewed, or blocked by the weekly cap.`;
  }
  return "No published TikTok outputs found to scan. Places come from TikTok outputs that are Published (or already have a Platform Post ID/URL) whose Content Item has Primary_Location.";
}

export async function studioListPlaceReviews(env, options, deps) {
  const profile = options.all_profiles ? null : normalizeEngagementProfile(options.profile || "chicago");
  const store = await studioLoadPlaceReviewStore(env, deps);
  let rows = store.targets || [];
  if (profile) rows = rows.filter((row) => row.profile === profile);
  if (options.status) {
    const status = String(options.status).toLowerCase();
    rows = rows.filter((row) =>
      String(row.approval_status || "").toLowerCase() === status
      || String(row.eligibility_status || "").toLowerCase() === status
    );
  } else {
    rows = rows.filter((row) => !["Skipped", "Reviewed", "Blocked Creator"].includes(row.eligibility_status));
  }
  rows.sort((a, b) => String(b.discovered_at || "").localeCompare(String(a.discovered_at || "")));
  const history = (store.actions || [])
    .filter((row) => !profile || row.profile === profile)
    .slice(0, 100);
  const settings = profile
    ? await studioLoadEngagementSettings(env, profile, deps)
    : defaultEngagementSettings("chicago");
  return {
    ok: true,
    profile: profile || "all",
    settings,
    capabilities: PLATFORM_CAPABILITIES,
    weekly_cap: PLACE_REVIEW_WEEKLY_CAP,
    weekly_completed: profile ? weeklyPlaceReviewCount(store.actions, profile) : null,
    recommendations: rows.slice(0, 100),
    history,
    note: "TikTok has no place-review publish API — Open Place only.",
  };
}

export async function studioApplyPlaceReviewAction(env, payload, deps) {
  const profile = normalizeEngagementProfile(payload.profile || "chicago");
  const actionType = String(payload.action || payload.action_type || "").trim().toLowerCase();
  const targetId = String(payload.target_id || "").trim();
  if (!targetId) throw new Error("target_id is required");
  if (!["open_place", "mark_reviewed", "skip", "regenerate", "edit"].includes(actionType)) {
    throw new Error("Unsupported place-review action");
  }

  const store = await studioLoadPlaceReviewStore(env, deps);
  const settings = await studioLoadEngagementSettings(env, profile, deps);
  const target = store.targets.find((row) => row.target_id === targetId && row.profile === profile);
  if (!target) throw new Error("Place review target not found for this profile");

  if (actionType === "edit") {
    const edited = sanitizePlaceReviewDraft(payload.comment || payload.edited_comment || "");
    if (!edited) throw new Error("Edited place review failed safety checks");
    const rating = Number(payload.star_rating);
    if (Number.isFinite(rating)) target.star_rating = Math.max(1, Math.min(5, rating));
    target.selected_comment = edited;
    target.approval_status = "edited";
    if (!target.suggested_comments.includes(edited)) {
      target.suggested_comments = [edited, ...target.suggested_comments].slice(0, 3);
    }
    await studioSavePlaceReviewStore(env, store, deps);
    return { ok: true, target, message: "Place review draft updated. Open Place in TikTok to post manually." };
  }

  if (actionType === "regenerate") {
    const generated = await studioGeneratePlaceReviewDrafts(env, {
      place_name: target.location,
      market: target.market,
      neighborhood: target.neighborhood,
      content_title: target.content_title || target.content_summary,
    }, settings);
    const drafts = generated.reviews || [];
    if (!drafts.length) throw new Error("Could not regenerate place-review drafts");
    target.suggested_comments = drafts;
    target.selected_comment = drafts[0];
    target.approval_status = "pending";
    target.eligibility_status = "Suggested";
    await studioSavePlaceReviewStore(env, store, deps);
    return { ok: true, target, message: "Regenerated place-review drafts." };
  }

  if (actionType === "skip") {
    target.eligibility_status = "Skipped";
    target.approval_status = "skipped";
    const action = buildPlaceReviewActionRecord({
      target,
      actionType: "skip",
      approvalStatus: "skipped",
      executionStatus: "manual",
    });
    store.actions.unshift(action);
    await studioSavePlaceReviewStore(env, store, deps);
    return { ok: true, target, action, message: "Place review skipped." };
  }

  if (actionType === "open_place") {
    const action = buildPlaceReviewActionRecord({
      target,
      actionType: "open_place",
      comment: payload.comment || target.selected_comment,
      approvalStatus: "approved",
      executionStatus: "opened",
    });
    store.actions.unshift(action);
    await studioSavePlaceReviewStore(env, store, deps);
    return {
      ok: true,
      target,
      action,
      manual: true,
      post_url: target.post_url,
      place_url: target.post_url,
      message: `Open TikTok and leave a review for ${placeReviewLabel(target.location, target.market)}. No automated review was submitted.`,
    };
  }

  // mark_reviewed — operator confirms they posted in the TikTok app
  if (weeklyPlaceReviewCount(store.actions, profile) >= PLACE_REVIEW_WEEKLY_CAP) {
    throw new Error(`Weekly place-review cap (${PLACE_REVIEW_WEEKLY_CAP}) reached for ${profile}.`);
  }
  const comment = sanitizePlaceReviewDraft(payload.comment || target.selected_comment || "");
  if (comment) target.selected_comment = comment;
  const rating = Number(payload.star_rating);
  if (Number.isFinite(rating)) target.star_rating = Math.max(1, Math.min(5, rating));
  target.eligibility_status = "Reviewed";
  target.approval_status = "approved";
  const action = buildPlaceReviewActionRecord({
    target,
    actionType: "mark_reviewed",
    comment: target.selected_comment,
    approvalStatus: "approved",
    executionStatus: "manual_completed",
  });
  store.actions.unshift(action);
  await studioSavePlaceReviewStore(env, store, deps);
  return {
    ok: true,
    target,
    action,
    manual: true,
    message: `Marked ${placeReviewLabel(target.location, target.market)} as reviewed (manual). TikTok was not called.`,
  };
}
