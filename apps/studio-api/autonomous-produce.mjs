/** Pure helpers for the twice-daily Chicago autonomous produce path. */

import { IDEA_LIBRARY_NAMED_PLACES } from "./idea-photo-wait.mjs";

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
export const AUTONOMOUS_PLAN_EXTRAS = Object.freeze([
  { platform: "Instagram", output_type: "Story" },
  { platform: "Facebook", output_type: "Story" },
]);
export const AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID = "recT49crfrhMVfZAQ";
export const AUTONOMOUS_DEFAULT_VIDEO_SECONDS = 30;
export const AUTONOMOUS_DEFAULT_VOICEOVER_FRACTION = 0.5;
export const AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS = 2;

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

export function autonomousRunIsBusy(last, nowMs = Date.now(), maxAgeMs = 15 * 60 * 1000) {
  const status = String(last?.status || "").trim();
  if (!["picking", "resuming"].includes(status)) return false;
  const at = Date.parse(last?.at || "");
  if (!Number.isFinite(at)) return true;
  return nowMs - at < maxAgeMs;
}

export function autonomousSlotAlreadyClaimed(last, slot) {
  if (!slot || String(last?.slot || "") !== slot) return false;
  const status = String(last?.status || "").trim();
  if (["picking", "resuming", "waiting_variants", "awaiting_i4", "producing", "promoted"].includes(status)) {
    return true;
  }
  // A successful pick already created an idea this slot. Do not harvest again if
  // produce later saved status=skipped (variant timeout, I4 wait, enqueue error).
  return Boolean(String(last?.idea_id || "").trim()) && status !== "reset";
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

/** Draft / Ready / Submitted autonomous PRs must keep moving. Submitted is not a stop. */
export function autonomousRequestNeedsContinue(requestStatus, notes) {
  if (!isAutonomousOrigin(notes)) return false;
  return ["Draft", "Ready", "Submitted"].includes(String(requestStatus || "").trim());
}

export const AUTONOMOUS_MAX_MASTER_ASSETS = 12;

export function isDerivedLibraryStillName(name) {
  const text = String(name || "");
  return /__\d+x\d+__/i.test(text) || /fill-crop-v\d+/i.test(text);
}

export function autonomousMasterMediaIds(assets) {
  const rows = Array.isArray(assets) ? assets : [];
  const originals = rows.filter((row) => !isDerivedLibraryStillName(row?.name));
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

export function autonomousPlanExtras() {
  return AUTONOMOUS_PLAN_EXTRAS.map((row) => ({ ...row }));
}

export function autonomousDefaultVoiceoverSeconds(videoSeconds = AUTONOMOUS_DEFAULT_VIDEO_SECONDS) {
  const duration = Number(videoSeconds);
  const base = Number.isFinite(duration) && duration > 0 ? duration : AUTONOMOUS_DEFAULT_VIDEO_SECONDS;
  return Math.max(1, Math.round(base * AUTONOMOUS_DEFAULT_VOICEOVER_FRACTION));
}

export function autonomousDefaultVoiceoverTailSeconds(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    return AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS;
  }
  return Math.round(value * 2) / 2;
}

export function parseAutonomousNotedMediaIds(notes) {
  const match = String(notes || "").match(/media_asset_ids=([^\n]+)/i);
  if (!match) return [];
  return [...new Set(match[1].split(",").map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
}

const AUTONOMOUS_TOPIC_STOP = new Set([
  "chicago", "chicagoshining", "street", "walk", "color", "right", "now", "this", "that",
  "with", "from", "into", "over", "after", "before", "today", "weekend", "quick", "save",
]);

export const AUTONOMOUS_IDEA_CREATED_FIELD = "Create_Date";

export const AUTONOMOUS_OCCUPIED_STATUSES = Object.freeze([
  "Generated",
  "Approved",
  "Sent for Review",
  "Promoted",
]);

export const AUTONOMOUS_LANDMARKS = Object.freeze([
  "lincoln park zoo",
  "brookfield zoo",
  "shedd aquarium",
  "adler planetarium",
  "field museum",
  "art institute",
  "chicago theatre",
  "wrigley field",
  "united center",
  "soldier field",
  "cloud gate",
  "buckingham fountain",
  "chicago river",
  ...IDEA_LIBRARY_NAMED_PLACES,
].sort((a, b) => b.length - a.length));

export function autonomousNormalizedPlace(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function autonomousPlaceSubjects(...parts) {
  const hay = autonomousNormalizedPlace(parts.filter(Boolean).join(" "));
  if (!hay) return [];
  const places = [];
  for (const place of AUTONOMOUS_LANDMARKS) {
    if (hay.includes(place)) places.push(place);
  }
  return [...new Set(places)];
}

export function autonomousTopicTokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !AUTONOMOUS_TOPIC_STOP.has(word))
  );
}

export function autonomousOccupiedHaystack(row) {
  return [
    row?.title,
    row?.location,
    row?.topic,
    row?.subtopic,
    row?.name,
  ].filter(Boolean).join(" ");
}

export function autonomousPickHaystack(pick) {
  return [
    pick?.candidate_title,
    pick?.primary_location,
    pick?.neighborhood_or_area,
    pick?.idea_summary,
    pick?.location,
    pick?.topic,
    pick?.subtopic,
    pick?.name,
  ].filter(Boolean).join(" ");
}

function autonomousConflictResult(row) {
  return {
    conflict: true,
    reason: row.source === "in_flight" ? "similar_to_in_flight" : "similar_to_recent",
    match: String(row.title || row.location || "").trim() || "occupied idea",
  };
}

export function autonomousIdeaConflictsOccupied(pick, occupied = []) {
  const pickMedia = new Set(pick?.media_asset_ids || []);
  const pickHay = autonomousPickHaystack(pick);
  const pickTokens = autonomousTopicTokens(pickHay);
  const pickPlaces = new Set(autonomousPlaceSubjects(pickHay));
  const pickLocation = autonomousNormalizedPlace(pick?.primary_location || pick?.location);
  for (const row of occupied) {
    const otherMedia = new Set(row?.media_asset_ids || []);
    const sharedMedia = [...pickMedia].filter((id) => otherMedia.has(id));
    const mediaRatio = pickMedia.size ? sharedMedia.length / pickMedia.size : 0;
    if (sharedMedia.length >= 3 || (sharedMedia.length >= 2 && mediaRatio >= 0.5)) {
      return autonomousConflictResult(row);
    }
    const otherHay = autonomousOccupiedHaystack(row);
    const otherPlaces = autonomousPlaceSubjects(otherHay);
    if (otherPlaces.some((place) => pickPlaces.has(place))) {
      return autonomousConflictResult(row);
    }
    const otherLocation = autonomousNormalizedPlace(row?.location);
    if (pickLocation && otherLocation && pickLocation === otherLocation && pickLocation !== "chicago") {
      return autonomousConflictResult(row);
    }
    const otherTokens = autonomousTopicTokens(otherHay);
    const sharedTokens = [...pickTokens].filter((token) => otherTokens.has(token));
    if (sharedTokens.length >= 2) {
      return autonomousConflictResult(row);
    }
  }
  return { conflict: false };
}

export function autonomousUnusedLibraryAssets(assets, occupied = []) {
  const used = new Set((occupied || []).flatMap((row) => row?.media_asset_ids || []));
  const occupiedPlaces = new Set((occupied || []).flatMap((row) => autonomousPlaceSubjects(autonomousOccupiedHaystack(row))));
  const occupiedLocations = new Set(
    (occupied || [])
      .map((row) => autonomousNormalizedPlace(row?.location))
      .filter((value) => value && value !== "chicago")
  );
  return (assets || []).filter((row) => {
    const id = String(row?.id || row?.media_asset_id || "").trim();
    if (!/^rec[A-Za-z0-9]+$/.test(id) || used.has(id)) return false;
    const hay = autonomousOccupiedHaystack(row);
    if (autonomousPlaceSubjects(hay).some((place) => occupiedPlaces.has(place))) return false;
    const location = autonomousNormalizedPlace(row?.location);
    if (location && occupiedLocations.has(location)) return false;
    return true;
  });
}

export function autonomousIdeaStatusIsOccupied(status) {
  return AUTONOMOUS_OCCUPIED_STATUSES.includes(String(status || "").trim());
}

export function mapAutonomousOccupiedIdea(record, nowMs = Date.now()) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : (record || {});
  const status = String(fields.Candidate_Status || "").trim();
  if (status === "On Hold" || status === "Rejected") return null;
  if (!autonomousIdeaStatusIsOccupied(status)) return null;
  if (!autonomousRecordIsRecent(record, nowMs)) return null;
  const title = String(fields.Candidate_Title || "").trim();
  if (!title) return null;
  return {
    source: status === "Promoted" ? "recent" : "in_flight",
    title,
    location: String(fields.Primary_Location || fields.Neighborhood_or_Area || "").trim(),
    media_asset_ids: parseAutonomousNotedMediaIds(fields.Production_Config_Notes),
  };
}

export function collectAutonomousOccupiedFromIdeas(records, nowMs = Date.now()) {
  return (records || []).map((row) => mapAutonomousOccupiedIdea(row, nowMs)).filter(Boolean);
}

export function mapAutonomousOccupiedRequest(record) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : (record || {});
  const status = String(fields.Request_Status || "").trim();
  if (status === "Cancelled") return null;
  const location = String(fields.Primary_Location || "").trim();
  const notes = String(fields.Production_Notes || fields.Production_Config_Notes || "");
  const title = String(fields.Candidate_Title || fields.Production_Request_ID || "").trim();
  if (!location && !title) return null;
  return {
    source: isAutonomousOrigin(notes) && ["Draft", "Ready", "Submitted"].includes(status) ? "in_flight" : "recent",
    title: title || location,
    location,
    media_asset_ids: parseAutonomousNotedMediaIds(notes),
  };
}

export function mergeAutonomousOccupied(groups = []) {
  const occupied = [];
  const seen = new Set();
  for (const row of groups.flat().filter(Boolean)) {
    const key = `${autonomousNormalizedPlace(row.title)}|${autonomousNormalizedPlace(row.location)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    occupied.push(row);
  }
  return occupied;
}

export function autonomousRecordIsRecent(record, nowMs = Date.now(), maxAgeMs = 14 * 24 * 60 * 60 * 1000) {
  const ts = Date.parse(record?.createdTime || record?.fields?.Create_Date || record?.Create_Date || "");
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts <= maxAgeMs;
}

export function autonomousPreferredSubject(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function buildAutonomousPickerPrompt({ profile, trends, assets, recentTitles, occupiedIdeas, preferredSubject }) {
  const profileName = profile?.name || profile?.Profile_Name || "ChicagoShining";
  const avoid = profile?.avoid_topics || profile?.Avoid_Topics || "";
  const voice = profile?.brand_voice || profile?.Brand_Voice || "";
  const pin = autonomousPreferredSubject(preferredSubject);
  const pinBlock = pin
    ? `

OPERATOR PIN (this run only)
Use only stills of: ${pin}. Title, location, and media_asset_ids must be that landmark. If none of the listed stills match, return {"skip":true,"reason":"no_matching_subject_stills"}.`
    : "";
  return `You are ChicagoShining's autonomous producer. Start from the library stills. Review those photos and pick ONE unused set that can become a short.

Return ONLY one raw JSON object. No markdown.

A news/social trend is optional flavor. Do not skip because no headline matches a still. Do not invent events, dates, prices, or rankings. Do not pick generic skyline filler. Do not pick the same landmark, neighborhood, zoo, pier, park, or stills as an in-flight or recently published idea. Another angle of an occupied place is still a repeat — skip instead.${pinBlock}

ACTIVE PROFILE
Name: ${profileName}
Voice: ${voice}
Avoid topics: ${avoid}

LIBRARY STILLS (review these; use only these media_asset_ids)
${JSON.stringify(assets, null, 2)}

OPTIONAL TREND HARVEST (cite only if it actually fits the stills you picked)
${JSON.stringify(trends, null, 2)}

IN FLIGHT OR RECENT IDEAS (do not repeat these subjects, places, or stills)
${JSON.stringify(occupiedIdeas || recentTitles || [], null, 2)}

If every listed still conflicts with an in-flight or recent idea, return:
{"skip":true,"reason":"no_unused_library_stills"}

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
  "cited_trend": "matching harvest item, or library",
  "suggested_format": "Vertical Short Video or Carousel",
  "media_asset_ids": ["rec..."]
}`;
}
