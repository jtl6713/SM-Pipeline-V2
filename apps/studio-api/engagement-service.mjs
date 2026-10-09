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
  computeEngagementInsights,
  mapYoutubeSearchItem,
  nearIdenticalComment,
} from "./engagement.mjs";

export const ENGAGEMENT_TARGETS_TABLE = "tblhE7YHDnj2lxJPC";
export const ENGAGEMENT_ACTIONS_TABLE = "tbl1bjkyC2jAgt3tl";
export const ENGAGEMENT_SETTINGS_TABLE = "tblY1wDxmrf5khAYy";

export {
  ENGAGEMENT_STORE_SETTING,
  ENGAGEMENT_SETTINGS_SETTING,
  ENGAGEMENT_DISCOVERY_LAST_SETTING,
  ENGAGEMENT_DISCOVERY_CRON_TTL_MS,
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

async function executeYoutubeAction(env, target, actionType, comment, deps) {
  const settings = await deps.studioActivePipelineSettings(env, [
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
  ]).catch(() => ({}));
  const base = String(settings.YOUTUBE_UPLOAD_SERVICE_URL || "").trim().replace(/\/+$/, "");
  const secret = settings.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || env.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || "";
  if (!base) {
    return { ok: false, status: "needs_authorization", error: "YouTube uploader service is not configured for this profile." };
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
  if (response.status === 404) {
    return {
      ok: false,
      status: "unsupported",
      error: "YouTube uploader build lacks /youtube/engage endpoints. Deploy uploader, then retry once.",
    };
  }
  if (!response.ok) {
    const ambiguous = Boolean(body?.ambiguous || body?.upstream?.ambiguous);
    return {
      ok: false,
      status: ambiguous ? "ambiguous" : "failed",
      error: String(body?.error || body?.message || `YouTube engage HTTP ${response.status}`).slice(0, 400),
      published_id: body?.comment_id || body?.id || null,
      ambiguous,
    };
  }
  return {
    ok: true,
    status: "published",
    published_id: body?.comment_id || body?.id || (actionType === "like" ? "liked" : null),
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

  // Persist Stage B from the current UI checkbox for this profile. Checking the
  // box without Save left miami/nyc/la on Stage A defaults, so Comment only
  // opened YouTube and never called the API.
  if (payload.stage_b_enabled === true && settings.stage_b_enabled !== true) {
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
    return { ok: true, target, message: "Comment updated. Approve before publishing." };
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

  if (actionType === "approve") {
    const comment = sanitizeCommentSuggestion(payload.comment || target.selected_comment || (target.suggested_comments || [])[0] || "");
    if (!comment) throw new Error("No safe comment available to approve");
    target.selected_comment = comment;
    target.approval_status = "approved";
    const action = buildActionRecord({
      target,
      actionType: "comment",
      comment,
      approvalStatus: "approved",
      executionStatus: settings.stage_b_enabled ? "queued" : "pending",
    });
    store.actions.unshift(action);
    await mirrorActionRow(env, action, deps);
    await studioSaveEngagementStore(env, store, deps);
    return {
      ok: true,
      target,
      action,
      message: settings.stage_b_enabled
        ? "Comment approved and queued. Use Comment to publish where supported."
        : "Comment approved (Stage A). External publish remains disabled until Stage B is enabled.",
    };
  }

  // like / comment execution (Stage B)
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
  if (store.suspended?.[suspendKey]) {
    throw new Error(`Engagement suspended for ${suspendKey}: ${store.suspended[suspendKey].reason || "permission/abuse warning"}`);
  }

  const comment = sanitizeCommentSuggestion(payload.comment || target.selected_comment || "");
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
  if (target.platform === "youtube") {
    result = await executeYoutubeAction(env, target, execType, comment, deps);
  } else {
    result = { ok: false, status: "unsupported", error: "Unsupported platform execution path" };
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
