/** Idea → timed-script timeline. Pure helpers for Worker, UI tests, and fallback VO. */

export const IDEA_TIMED_SCRIPT_MIN_SCENES = 5;
export const IDEA_TIMED_SCRIPT_MAX_SCENES = 10;
export const IDEA_TIMED_SCRIPT_CATALOG_LIMIT = 24;
export const IDEA_TIMED_SCRIPT_WORDS_PER_MINUTE = 150;
export const IDEA_TIMED_SCRIPT_MIN_SCENE_SECONDS = 4;
export const IDEA_TIMED_SCRIPT_MAX_SCENE_SECONDS = 16;

export function stillNameKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function spokenStillName(value) {
  const stem = String(value || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stem || "this still";
}

export function estimateNarrationSeconds(text, speechRate = 1) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let rate = Number(speechRate || 1);
  if (!Number.isFinite(rate) || rate <= 0) rate = 1;
  return (words.length / IDEA_TIMED_SCRIPT_WORDS_PER_MINUTE) * 60 / rate;
}

export function sceneDurationSeconds(text) {
  const estimated = estimateNarrationSeconds(text, 1);
  const padded = estimated > 0 ? estimated + 0.4 : IDEA_TIMED_SCRIPT_MIN_SCENE_SECONDS;
  const clamped = Math.min(
    IDEA_TIMED_SCRIPT_MAX_SCENE_SECONDS,
    Math.max(IDEA_TIMED_SCRIPT_MIN_SCENE_SECONDS, padded),
  );
  return Math.round((clamped + Number.EPSILON) * 10) / 10;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours) return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function stillId(still) {
  return String(still?.id || still?.media_asset_record_id || "").trim();
}

function stillLabel(still) {
  return String(still?.name || still?.asset_name || still?.filename || "").trim();
}

export function timelineCatalogMediaType(row) {
  return String(
    row?.media_type
    || row?.mime_type
    || row?.mediaType
    || row?.mime
    || (row?.media_kind === "video" ? "video" : ""),
  ).trim().toLowerCase();
}

export function timelineCatalogIsVideo(row) {
  const type = timelineCatalogMediaType(row);
  return type === "video" || type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(stillLabel(row));
}

function timelineCatalogIsRelevant(row) {
  const confidence = String(row?.confidence || "").trim().toLowerCase();
  return confidence === "high" || confidence === "medium";
}

export function timelineCatalogIsRelevantVideo(row) {
  return timelineCatalogIsVideo(row) && timelineCatalogIsRelevant(row);
}

export function relevantTimelineVideo(catalog) {
  return (Array.isArray(catalog) ? catalog : []).find((row) => (
    timelineCatalogIsRelevantVideo(row)
  )) || null;
}

export function pickTimelineCatalog(ranked, {
  min = IDEA_TIMED_SCRIPT_MIN_SCENES,
  max = IDEA_TIMED_SCRIPT_MAX_SCENES,
  catalogLimit = IDEA_TIMED_SCRIPT_CATALOG_LIMIT,
} = {}) {
  const confidenceRank = { high: 3, medium: 2, low: 1, none: 0 };
  const rows = (Array.isArray(ranked) ? ranked : [])
    .filter((row) => row && stillId(row) && stillLabel(row))
    .slice()
    .sort((a, b) => {
      const confDiff = (confidenceRank[b.confidence] || 0) - (confidenceRank[a.confidence] || 0);
      if (confDiff) return confDiff;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });
  const limit = Math.max(max, catalogLimit);
  const bestRelevantVideo = relevantTimelineVideo(rows);
  const catalog = rows.slice(0, limit);
  if (bestRelevantVideo && !catalog.some((row) => stillId(row) === stillId(bestRelevantVideo))) {
    catalog.unshift(bestRelevantVideo);
    catalog.splice(limit);
  }
  const high = catalog.filter((row) => row.confidence === "high");
  const medium = catalog.filter((row) => row.confidence === "medium");
  const rest = catalog.filter((row) => row.confidence !== "high" && row.confidence !== "medium");
  const selected = [];
  const relevantVideo = relevantTimelineVideo(catalog);
  if (relevantVideo) selected.push(relevantVideo);
  for (const pool of [high, medium, rest]) {
    for (const row of pool) {
      if (selected.length >= max) break;
      if (selected.some((item) => stillId(item) === stillId(row))) continue;
      if (timelineCatalogIsVideo(row) && !timelineCatalogIsRelevant(row)) continue;
      selected.push(row);
    }
  }
  return {
    catalog,
    selected: selected.slice(0, Math.max(min, Math.min(max, selected.length))),
  };
}

export function matchStillBySuggestedVisual(visual, stills, { usedIds = new Set() } = {}) {
  const key = stillNameKey(visual);
  if (!key) return null;
  const available = (Array.isArray(stills) ? stills : []).filter((still) => {
    const id = stillId(still);
    return id && !usedIds.has(id);
  });
  const exact = available.filter((still) => stillNameKey(stillLabel(still)) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[0];
  const contains = available.filter((still) => {
    const name = stillNameKey(stillLabel(still));
    return name && (name.includes(key) || key.includes(name)) && Math.min(name.length, key.length) >= 8;
  });
  if (contains.length === 1) return contains[0];
  let best = null;
  let bestScore = 0;
  for (const still of available) {
    const name = stillNameKey(stillLabel(still));
    if (!name) continue;
    let score = 0;
    if (name.startsWith(key) || key.startsWith(name)) score += 4;
    const visualTokens = new Set(String(visual || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
    const nameTokens = new Set(stillLabel(still).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
    for (const token of visualTokens) if (nameTokens.has(token)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = still;
    }
  }
  return bestScore >= 4 ? best : null;
}

export function assignScenesToStills(scenes, stills) {
  const used = new Set();
  const assigned = [];
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const hintedId = String(scene?.media_asset_id || scene?.asset_id || "").trim();
    const byId = hintedId
      ? (Array.isArray(stills) ? stills : []).find((still) => stillId(still) === hintedId && !used.has(hintedId))
      : null;
    const matched = byId || matchStillBySuggestedVisual(scene?.suggested_visual, stills, { usedIds: used });
    const next = { ...scene };
    if (matched) {
      const id = stillId(matched);
      used.add(id);
      next.media_asset_id = id;
      next.asset_id = id;
      next.suggested_visual = stillLabel(matched) || next.suggested_visual;
    }
    assigned.push(next);
  }
  const remaining = (Array.isArray(stills) ? stills : []).filter((still) => !used.has(stillId(still)));
  let leftover = 0;
  return assigned.map((scene) => {
    if (scene.media_asset_id || scene.asset_id) return scene;
    const fill = remaining[leftover];
    leftover += 1;
    if (!fill) return scene;
    const id = stillId(fill);
    used.add(id);
    return {
      ...scene,
      media_asset_id: id,
      asset_id: id,
      suggested_visual: stillLabel(fill) || scene.suggested_visual,
    };
  });
}

export function buildTimelineFromScenes(scenes) {
  const cleaned = [];
  let cursor = 0;
  for (const raw of Array.isArray(scenes) ? scenes : []) {
    const voiceover = String(raw?.voiceover_text || raw?.line || "").replace(/\s+/g, " ").trim();
    if (!voiceover && !raw?.suggested_visual) continue;
    const duration = sceneDurationSeconds(voiceover);
    const start = Math.round((cursor + Number.EPSILON) * 1000) / 1000;
    const end = Math.round((start + duration + Number.EPSILON) * 1000) / 1000;
    cleaned.push({
      index: cleaned.length + 1,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: Math.round((end - start + Number.EPSILON) * 1000) / 1000,
      voiceover_text: voiceover,
      suggested_visual: String(raw?.suggested_visual || "").trim(),
      asset_id: String(raw?.asset_id || raw?.media_asset_id || "").trim(),
      shot_status: String(raw?.shot_status || "").trim() || (String(raw?.asset_id || raw?.media_asset_id || "").trim() ? "owned" : "suggestion"),
      media_type: timelineCatalogMediaType(raw) || null,
      source_duration_seconds: Number(raw?.source_duration_seconds || raw?.duration_seconds || 0) || null,
      speech_rate: 1,
      force_exact_voiceover: true,
    });
    cursor = end;
  }
  return {
    mode: "timed_script",
    timing_mode: "authoritative",
    timing_source: "timed_script",
    duration_seconds: Math.round((cursor + Number.EPSILON) * 1000) / 1000,
    force_exact_voiceover: true,
    segments: cleaned,
  };
}

export function exactVoiceoverText(timeline) {
  if (!timeline || !Array.isArray(timeline.segments)) return "";
  return timeline.segments.map((segment) => String(segment.voiceover_text || "").trim()).filter(Boolean).join(" ").trim();
}

export function formatTimedScriptMarkdown(timeline) {
  const rows = Array.isArray(timeline?.segments) ? timeline.segments : [];
  const header = "| Time | Voiceover | Suggested still |";
  const rule = "| --- | --- | --- |";
  const body = rows.map((segment) => {
    const time = `${formatClock(segment.start_seconds)}–${formatClock(segment.end_seconds)}`;
    const voice = String(segment.voiceover_text || "").replace(/\s+/g, " ").trim().replace(/\|/g, "/");
    const visual = String(segment.suggested_visual || "").replace(/\s+/g, " ").trim().replace(/\|/g, "/");
    return `| ${time} | ${voice} | ${visual} |`;
  });
  return [header, rule, ...body].join("\n");
}

export function timedScriptDirectiveLine(timeline) {
  if (!timeline || !Array.isArray(timeline.segments) || !timeline.segments.length) return "";
  return `[timed-script] ${JSON.stringify(timeline)}`;
}

export function mergeTimedScriptNotes(existing, timeline) {
  const directive = timedScriptDirectiveLine(timeline);
  const stripped = String(existing || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[timed-script\]/i.test(line))
    .join("\n")
    .trim();
  if (!directive) return stripped;
  return stripped ? `${directive}\n${stripped}` : directive;
}

function splitBeats(summary) {
  return String(summary || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function fallbackScenesFromStills(idea, stills) {
  const title = String(idea?.title || "").trim() || "This neighborhood";
  const location = String(idea?.location || idea?.primary_location || "").trim();
  const beats = splitBeats(idea?.summary || "");
  const rows = (Array.isArray(stills) ? stills : []).filter((still) => stillId(still) && stillLabel(still));
  if (!rows.length) return [];
  return rows.map((still, index) => {
    const spoken = spokenStillName(stillLabel(still));
    const place = location || spokenStillName(still.location || "");
    let line;
    if (index === 0) {
      line = beats[0]
        ? `${title}. ${beats[0]}`
        : `${title}. Start here with ${spoken}${place ? ` in ${place}` : ""}.`;
    } else if (index === rows.length - 1) {
      line = `That's the look. Save this for your trip${place ? ` to ${place}` : ""}.`;
    } else {
      line = beats[index] || `Next, ${spoken}${place ? ` around ${place}` : ""}.`;
    }
    return {
      voiceover_text: line.replace(/\s+/g, " ").trim(),
      suggested_visual: stillLabel(still),
      media_asset_id: stillId(still),
      asset_id: stillId(still),
    };
  });
}

export function scenesFromModelPayload(payload, catalog) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.scenes) && payload.scenes.length) {
    return payload.scenes.map((scene) => ({
      voiceover_text: String(scene?.voiceover_text || scene?.line || "").replace(/\s+/g, " ").trim(),
      suggested_visual: String(scene?.suggested_visual || scene?.asset_name || "").trim(),
      media_asset_id: String(scene?.media_asset_id || scene?.asset_id || "").trim(),
    })).filter((scene) => scene.voiceover_text || scene.suggested_visual);
  }
  const voiceovers = Array.isArray(payload.slide_voiceovers) ? payload.slide_voiceovers : [];
  if (!voiceovers.length) return [];
  return voiceovers.map((item, index) => {
    const still = catalog[index];
    const line = typeof item === "string" ? item : (item?.line || item?.voiceover_text || "");
    return {
      voiceover_text: String(line || "").replace(/\s+/g, " ").trim(),
      suggested_visual: stillLabel(still),
      media_asset_id: stillId(still),
      asset_id: stillId(still),
    };
  }).filter((scene) => scene.voiceover_text || scene.suggested_visual);
}

/** Attach a library file only when the suggestion names that file. Leave the rest as a shot list. */
export function assignOwnedScenes(scenes, stills) {
  const pool = Array.isArray(stills) ? stills : [];
  const used = new Set();
  return (Array.isArray(scenes) ? scenes : []).map((scene) => {
    const hintedId = String(scene?.media_asset_id || scene?.asset_id || "").trim();
    const byId = hintedId
      ? pool.find((still) => stillId(still) === hintedId && !used.has(hintedId))
      : null;
    const matched = byId || matchStillBySuggestedVisual(scene?.suggested_visual, pool, { usedIds: used });
    const next = {
      voiceover_text: String(scene?.voiceover_text || scene?.line || "").replace(/\s+/g, " ").trim(),
      suggested_visual: String(scene?.suggested_visual || "").trim(),
      media_asset_id: "",
      asset_id: "",
      shot_status: "suggestion",
    };
    if (!matched) return next;
    const id = stillId(matched);
    used.add(id);
    return {
      ...next,
      media_asset_id: id,
      asset_id: id,
      suggested_visual: stillLabel(matched) || next.suggested_visual,
      shot_status: "owned",
      media_type: timelineCatalogMediaType(matched) || null,
      source_duration_seconds: Number(matched?.duration_seconds || matched?.source_duration_seconds || 0) || null,
    };
  }).filter((scene) => scene.voiceover_text || scene.suggested_visual);
}

/**
 * Keep the proposal mixed-media when the catalog contains a genuinely relevant
 * clip. Low-confidence clips remain available to the writer but are never forced
 * into a scene just to satisfy a media quota.
 */
export function ensureRelevantVideoScene(scenes, catalog) {
  const rows = Array.isArray(catalog) ? catalog : [];
  const video = relevantTimelineVideo(rows);
  if (!video) return Array.isArray(scenes) ? scenes : [];
  const videoId = stillId(video);
  const incoming = Array.isArray(scenes) ? scenes : [];
  const catalogById = new Map(rows.map((row) => [stillId(row), row]));
  if (incoming.some((scene) => String(scene?.asset_id || scene?.media_asset_id || "").trim() === videoId)) return incoming;

  const otherVideoIndex = incoming.findIndex((scene) => {
    const row = catalogById.get(String(scene?.asset_id || scene?.media_asset_id || "").trim());
    return row && timelineCatalogIsVideo(row);
  });
  const unassignedIndex = incoming.findIndex((scene) => !String(scene?.asset_id || scene?.media_asset_id || "").trim());
  const index = otherVideoIndex >= 0 ? otherVideoIndex : (unassignedIndex >= 0 ? unassignedIndex : Math.max(0, incoming.length - 1));
  if (!incoming.length || !videoId) return incoming;
  return incoming.map((scene, sceneIndex) => sceneIndex === index ? {
    ...scene,
    suggested_visual: stillLabel(video) || scene?.suggested_visual || "",
    media_asset_id: videoId,
    asset_id: videoId,
    shot_status: "owned",
    media_type: timelineCatalogMediaType(video) || "video",
    source_duration_seconds: Number(video?.duration_seconds || video?.source_duration_seconds || 0) || null,
  } : scene);
}

export function scenesFromProposalPayload(payload, catalog) {
  const known = new Set((Array.isArray(catalog) ? catalog : []).map((still) => stillId(still)).filter(Boolean));
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.scenes)) return [];
  return payload.scenes.map((scene) => {
    const hinted = String(scene?.media_asset_id || scene?.asset_id || "").trim();
    const owned = known.has(hinted);
    return {
      voiceover_text: String(scene?.voiceover_text || scene?.line || "").replace(/\s+/g, " ").trim(),
      suggested_visual: String(scene?.suggested_visual || scene?.asset_name || "").trim(),
      media_asset_id: owned ? hinted : "",
      asset_id: owned ? hinted : "",
      shot_status: owned ? "owned" : "suggestion",
    };
  }).filter((scene) => scene.voiceover_text || scene.suggested_visual);
}

export function fallbackProposalScenes(prompt, stills) {
  const title = String(prompt || "").replace(/\s+/g, " ").trim() || "This place";
  const owned = (Array.isArray(stills) ? stills : []).filter((still) => stillId(still) && stillLabel(still)).slice(0, 4);
  const scenes = owned.map((still, index) => {
    const spoken = spokenStillName(stillLabel(still));
    return {
      voiceover_text: index === 0
        ? `${title}. Start with ${spoken}.`
        : `Next, ${spoken}.`,
      suggested_visual: stillLabel(still),
      media_asset_id: stillId(still),
      asset_id: stillId(still),
      shot_status: "owned",
    };
  });
  const suggestions = [
    `Vertical frame of ${title} that is not in the library yet.`,
    `Close detail that proves the point of ${title}.`,
    `Hero frame of ${title} with clean space for a title.`,
  ];
  suggestions.forEach((visual, index) => {
    const line = index === suggestions.length - 1
      ? `Save ${title} for last.`
      : `You still need a photo for this beat of ${title}.`;
    scenes.push({
      voiceover_text: line,
      suggested_visual: visual,
      media_asset_id: "",
      asset_id: "",
      shot_status: "suggestion",
    });
  });
  return scenes.slice(0, IDEA_TIMED_SCRIPT_MAX_SCENES);
}

export function timedScriptFromNotes(notes) {
  const match = /(?:^|\n)\[timed-script\]\s*(\{.*\})\s*(?:\n|$)/i.exec(String(notes || ""));
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function unassignedSuggestionCount(timeline) {
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  return segments.filter((segment) => !String(segment?.asset_id || segment?.media_asset_id || "").trim()).length;
}

export function scriptedShortProposalReady(timeline) {
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  if (segments.length < 2) return false;
  return segments.every((segment) => String(segment?.voiceover_text || "").trim() && String(segment?.suggested_visual || "").trim());
}

/** Feed Post + the already-matched stills. null means this is not a feed post. */
export function singleImageFeedPostIds({ contentType, matchedIds = [] } = {}) {
  if (String(contentType || "").trim() !== "Feed Post") return null;
  const ids = [];
  for (const raw of matchedIds || []) {
    const id = String((raw && typeof raw === "object" ? raw.id : raw) || "").trim();
    if (/^rec[A-Za-z0-9]+$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function ideaTimedScriptReady(timeline) {
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  if (segments.length < 2) return false;
  const named = segments.filter((segment) => String(segment.suggested_visual || "").trim()).length;
  const voiced = segments.filter((segment) => String(segment.voiceover_text || "").trim()).length;
  return named >= 2 && voiced >= 2;
}
