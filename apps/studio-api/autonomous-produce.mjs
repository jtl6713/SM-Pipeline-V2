/** Pure helpers for the autonomous produce path (hourly scheduled-target refill). */

import { firstLinkedRecordId } from "./asset-library.mjs";
import { IDEA_LIBRARY_NAMED_PLACES } from "./idea-photo-wait.mjs";

/** All-Profiles parenthesis total per city: keep Scheduled at or above this. */
export const AUTONOMOUS_SCHEDULED_TARGET = 200;
/** Parenthesis total above this skips that city for the Chicago hour. 200–209 holds. */
export const AUTONOMOUS_SCHEDULED_SKIP_ABOVE = 209;
/** Distinct-subject ideas to open per city per Chicago hour while Scheduled is under target. */
export const AUTONOMOUS_IDEAS_PER_HOUR = 10;
/** Create-loop budget per city, starting after the library scan. The old 45s cap included the scan and stopped at one idea. */
export const AUTONOMOUS_CITY_CREATE_MS = 180000;
/** Picks allowed while that clock is running. The 7pm hour stopped at 12, with 1–2 ideas saved. */
export const AUTONOMOUS_CITY_CREATE_ATTEMPTS = 40;
/** Safety stop while paging the classified library. This is not a newest-N window. */
export const AUTONOMOUS_LIBRARY_SCAN_CAP = 8000;
/** Legacy twice-daily windows; harvest now keys off the scheduled target instead. */
export const AUTONOMOUS_WINDOWS = Object.freeze([8, 16]);
export const AUTONOMOUS_NEWS_FEEDS = Object.freeze([
  "https://blockclubchicago.org/feed/",
]);
export const AUTONOMOUS_YOUTUBE_QUERIES = Object.freeze([
  "Chicago",
  "Chicago news today",
  "things to do in Chicago",
]);
export const AUTONOMOUS_YOUTUBE_QUERIES_BY_THEME = Object.freeze({
  chicago: AUTONOMOUS_YOUTUBE_QUERIES,
  nyc: Object.freeze(["New York City", "NYC news today", "things to do in NYC"]),
  la: Object.freeze(["Los Angeles", "LA news today", "things to do in Los Angeles"]),
  miami: Object.freeze(["Miami", "Miami news today", "things to do in Miami"]),
});
export const AUTONOMOUS_STANDARD_PLATFORMS = Object.freeze([
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
]);
export const AUTONOMOUS_REEL_OVERRIDES = Object.freeze({
  Instagram: "Reel",
  Facebook: "Reel",
  TikTok: "Video Draft",
  YouTube: "Short",
});
/** Library stills still go out as Reels / Shorts, not native carousels. */
export const AUTONOMOUS_CAROUSEL_OVERRIDES = AUTONOMOUS_REEL_OVERRIDES;
export const AUTONOMOUS_PLAN_EXTRAS = Object.freeze([
  { platform: "Instagram", output_type: "Story" },
  { platform: "Facebook", output_type: "Story" },
]);
export const AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID = "recT49crfrhMVfZAQ";
export const AUTONOMOUS_DEFAULT_VIDEO_SECONDS = 30;
export const AUTONOMOUS_DEFAULT_VOICEOVER_FRACTION = 0.5;
export const AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS = 2;

function normalizeAirtableRecordId(value) {
  const id = String(value || "").trim();
  return /^rec[a-zA-Z0-9]{14}$/.test(id) ? id : "";
}

/** Prefer a random track from the profile music pool; otherwise the global autonomous default. */
export function pickAutonomousMusicAssetId(poolIds, fallbackId = AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID, random = Math.random) {
  const pool = [...new Set((Array.isArray(poolIds) ? poolIds : [])
    .map(normalizeAirtableRecordId)
    .filter(Boolean))];
  if (!pool.length) return normalizeAirtableRecordId(fallbackId) || AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID;
  const index = Math.floor(Number(random()) * pool.length) % pool.length;
  return pool[Math.max(0, index)];
}

/** Profile default narration voice, with Kate/global fallback. */
export function resolveAutonomousNarrationVoice(profile, defaults = {}) {
  const fallbackId = String(defaults.voice_id || "").trim();
  const fallbackName = String(defaults.voice_name || "").trim() || "Kate";
  const voiceId = String(profile?.default_narration_voice_id || profile?.Default_Narration_Voice_ID || "").trim();
  const voiceName = String(profile?.default_narration_voice_name || profile?.Default_Narration_Voice_Name || "").trim();
  if (voiceId) return { voice_id: voiceId, voice_name: voiceName || voiceId };
  return { voice_id: fallbackId, voice_name: fallbackName };
}

/** First profile that actually set a narration default wins; empty defaults are skipped. */
export function pickNarrationVoiceFromProfiles(profiles, fallback = {}) {
  const fallbackId = String(fallback.voice_id || "").trim();
  const fallbackName = String(fallback.voice_name || "").trim() || "Kate";
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const resolved = resolveAutonomousNarrationVoice(profile, { voice_id: "", voice_name: "" });
    if (resolved.voice_id) return resolved;
  }
  return { voice_id: fallbackId, voice_name: fallbackName };
}

export function autonomousSlot(chicago) {
  const date = String(chicago?.date || "").trim();
  const hour = Number(chicago?.hour);
  if (!date || !Number.isFinite(hour)) return null;
  if (hour === 8) return `${date}:am`;
  if (hour === 16) return `${date}:pm`;
  return null;
}

/** One harvest claim per Chicago clock hour for scheduled-target refill. */
export function autonomousRefillSlot(chicago) {
  const date = String(chicago?.date || "").trim();
  const hour = Number(chicago?.hour);
  if (!date || !Number.isFinite(hour)) return null;
  return `${date}:h${String(Math.trunc(hour)).padStart(2, "0")}`;
}

/** The 10-idea harvest runs when the Chicago clock is at :00, not :05 or :30. */
export function autonomousAtTopOfHour(chicago) {
  if (chicago?.minute === undefined || chicago?.minute === null || chicago?.minute === "") return false;
  const minute = Number(chicago.minute);
  return Number.isFinite(minute) && minute === 0;
}

/**
 * Use the cron tick's minute, not the wall clock after publish heals.
 * A :00 invocation that reaches harvest at :12 still counts as the top of the hour.
 */
export function autonomousClockForCron(chicago, cronMinute) {
  if (!chicago || typeof chicago !== "object") return chicago;
  if (cronMinute === undefined || cronMinute === null || cronMinute === "") return chicago;
  const minute = Number(cronMinute);
  if (!Number.isFinite(minute)) return chicago;
  return { ...chicago, minute };
}

export function autonomousInWindow(chicago, cron = "") {
  const hour = Number(chicago?.hour);
  if (hour === 8 || hour === 16) return true;
  return cron === "0 13 * * *" || cron === "0 21 * * *";
}

/** Sum All-Profiles Scheduled cells (Facebook+Instagram+TikTok+YouTube). */
export function autonomousScheduledTotal(scheduledByPlatform) {
  if (!scheduledByPlatform || typeof scheduledByPlatform !== "object") return 0;
  let total = 0;
  for (const key of ["Facebook", "Instagram", "TikTok", "YouTube"]) {
    const n = Number(scheduledByPlatform[key]);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * refill: Scheduled under target (create this hour's ideas).
 * hold: at target through the skip ceiling (do not harvest).
 * skip: above the ceiling (skip that city this hour).
 * Awaiting Approval does not change the band.
 */
export function autonomousScheduledBand(
  scheduledTotal,
  target = AUTONOMOUS_SCHEDULED_TARGET,
  skipAbove = AUTONOMOUS_SCHEDULED_SKIP_ABOVE,
) {
  const scheduled = Math.max(0, Number(scheduledTotal) || 0);
  const floor = Math.max(1, Number(target) || AUTONOMOUS_SCHEDULED_TARGET);
  const ceiling = Math.max(floor, Number(skipAbove) || AUTONOMOUS_SCHEDULED_SKIP_ABOVE);
  if (scheduled > ceiling) return "skip";
  if (scheduled < floor) return "refill";
  return "hold";
}

/** True only when the parenthesis total is under the target. Awaiting Approval is ignored. */
export function autonomousProfileNeedsScheduledRefill(
  scheduledTotal,
  _awaitingApproval = 0,
  target = AUTONOMOUS_SCHEDULED_TARGET,
) {
  return autonomousScheduledBand(scheduledTotal, target) === "refill";
}

export function autonomousScheduledDeficit(
  scheduledTotal,
  _awaitingApproval = 0,
  target = AUTONOMOUS_SCHEDULED_TARGET,
) {
  const scheduled = Math.max(0, Number(scheduledTotal) || 0);
  const floor = Math.max(1, Number(target) || AUTONOMOUS_SCHEDULED_TARGET);
  if (autonomousScheduledBand(scheduled, target) !== "refill") return 0;
  return Math.max(0, floor - scheduled);
}

/**
 * Build per-profile refill scores from All-Profiles overview rows
 * (`scheduled` map + `approval` awaiting-approval count).
 */
export function autonomousRefillScoresFromOverview(overviewRows, target = AUTONOMOUS_SCHEDULED_TARGET) {
  const byId = Object.create(null);
  for (const row of Array.isArray(overviewRows) ? overviewRows : []) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    const scheduledTotal = autonomousScheduledTotal(row?.scheduled);
    const awaiting = Math.max(0, Number(row?.approval ?? row?.metrics?.awaiting_approval) || 0);
    const band = autonomousScheduledBand(scheduledTotal, target);
    const deficit = autonomousScheduledDeficit(scheduledTotal, awaiting, target);
    const needed = band === "refill";
    byId[id] = {
      id,
      name: String(row?.name || row?.city_label || "").trim(),
      scheduled_total: scheduledTotal,
      awaiting_approval: awaiting,
      band,
      deficit,
      needed,
      target: Math.max(1, Number(target) || AUTONOMOUS_SCHEDULED_TARGET),
    };
  }
  return byId;
}

export function autonomousProfilesNeedingRefill(profiles, refillByProfileId) {
  const rows = Array.isArray(profiles) ? profiles : [];
  if (!refillByProfileId || typeof refillByProfileId !== "object") return rows;
  return rows.filter((row) => refillByProfileId[String(row?.id || "")]?.needed);
}

/** Prefer the city with the largest Scheduled deficit. */
export function pickAutonomousRefillProfile(profiles, refillByProfileId) {
  const needing = autonomousProfilesNeedingRefill(profiles, refillByProfileId);
  if (!needing.length) return null;
  return [...needing].sort((a, b) => {
    const da = Number(refillByProfileId[String(a?.id || "")]?.deficit) || 0;
    const db = Number(refillByProfileId[String(b?.id || "")]?.deficit) || 0;
    if (db !== da) return db - da;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export function autonomousRunIsBusy(last, nowMs = Date.now(), maxAgeMs = 15 * 60 * 1000) {
  const status = String(last?.status || "").trim();
  if (!["picking", "resuming"].includes(status)) return false;
  const at = Date.parse(last?.at || "");
  if (!Number.isFinite(at)) return true;
  return nowMs - at < maxAgeMs;
}

export function autonomousProfileIdeasThisHour(last, slot, profileId) {
  if (!slot || String(last?.slot || "") !== String(slot || "")) return 0;
  const id = String(profileId || "").trim();
  if (!id) return 0;
  return Math.max(0, Number(last?.ideas_by_profile?.[id]) || 0);
}

/** A city still owes ideas this Chicago hour when it is under the per-hour goal and not exhausted. */
export function autonomousProfileHourOpen(last, slot, profileId, goal = AUTONOMOUS_IDEAS_PER_HOUR) {
  const id = String(profileId || "").trim();
  if (!id || !slot) return false;
  if (String(last?.slot || "") !== String(slot)) return true;
  if (autonomousProfileIdeasThisHour(last, slot, id) >= Math.max(1, Number(goal) || AUTONOMOUS_IDEAS_PER_HOUR)) {
    return false;
  }
  if (last?.hour_profile_skip?.[id]) return false;
  return true;
}

export function autonomousRefillProfilesStillOpen(profiles, refillByProfileId, last, slot, goal = AUTONOMOUS_IDEAS_PER_HOUR) {
  return autonomousProfilesNeedingRefill(profiles, refillByProfileId)
    .filter((row) => autonomousProfileHourOpen(last, slot, row?.id, goal));
}

/**
 * The Chicago hour is finished only when every refill city has its 10 ideas
 * (or was marked exhausted). One idea_id does not close the hour.
 * With no profile list, only an explicit hour_complete flag claims the slot.
 */
export function autonomousSlotAlreadyClaimed(last, slot, refillProfileIds = null) {
  if (!slot || String(last?.slot || "") !== slot) return false;
  if (Array.isArray(refillProfileIds)) {
    const ids = refillProfileIds.map((id) => String(id || "").trim()).filter(Boolean);
    if (!ids.length) return false;
    return ids.every((id) => !autonomousProfileHourOpen(last, slot, id));
  }
  return last?.hour_complete === true;
}

/**
 * FIFO resets null the slot after one produce finishes. Keep this hour's
 * per-city counts so the next tick continues toward 10 instead of starting over.
 */
export function mergeAutonomousHourProgress(previous, payload) {
  const prev = previous && typeof previous === "object" ? previous : {};
  const next = payload && typeof payload === "object" ? payload : {};
  const prevSlot = String(prev.slot || "");
  const hasSlot = Object.prototype.hasOwnProperty.call(next, "slot");
  const nextSlotRaw = hasSlot ? next.slot : undefined;
  const slot = nextSlotRaw === null
    ? (prevSlot || null)
    : (nextSlotRaw === undefined ? (prevSlot || null) : nextSlotRaw);
  const sameHour = Boolean(slot) && slot === prevSlot;
  const ideas = { ...(sameHour && prev.ideas_by_profile && typeof prev.ideas_by_profile === "object" ? prev.ideas_by_profile : {}) };
  if (next.ideas_by_profile && typeof next.ideas_by_profile === "object") {
    for (const [id, count] of Object.entries(next.ideas_by_profile)) {
      const key = String(id || "").trim();
      if (!key) continue;
      const n = Math.max(0, Number(count) || 0);
      ideas[key] = Math.max(Number(ideas[key]) || 0, n);
    }
  }
  const skips = { ...(sameHour && prev.hour_profile_skip && typeof prev.hour_profile_skip === "object" ? prev.hour_profile_skip : {}) };
  if (next.hour_profile_skip && typeof next.hour_profile_skip === "object") {
    for (const [id, reason] of Object.entries(next.hour_profile_skip)) {
      const key = String(id || "").trim();
      if (!key || !reason) continue;
      skips[key] = String(reason).slice(0, 80);
    }
  }
  return {
    ...next,
    slot,
    ideas_by_profile: ideas,
    hour_profile_skip: skips,
  };
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
    post_caption: String(parsed?.post_caption || parsed?.caption || "").trim().slice(0, 2200),
    content_type: format === "Carousel" || format === "Photo Set" || format === "Feed Post"
      ? format
      : "Vertical Short Video",
    media_asset_ids: mediaIds.slice(0, AUTONOMOUS_RELATED_STILL_MAX),
  };
}

export function isAutonomousOrigin(text) {
  return String(text || "").includes("origin=autonomous");
}

/** Matched photo-ready ideas must not sit idle past this SLA (light cron drains them). */
export const PHOTO_READY_SLA_MS = 30 * 60 * 1000;

/** True when a stamp (Created_At / last.at) is at or past the photo-ready SLA. */
export function photoReadySlaOverdue(stamp, nowMs = Date.now(), slaMs = PHOTO_READY_SLA_MS) {
  const at = Date.parse(stamp || "");
  if (!Number.isFinite(at)) return false;
  return nowMs - at >= slaMs;
}

/**
 * Promoted produce still running (Remotion / studio-produce steps).
 * Must not block adopt + prepare of the next matched draft — only defer the
 * next Remotion enqueue so two heavy renders do not collide.
 */
export function autonomousProduceJobInFlight(requestStatus, jobStep) {
  const status = String(requestStatus || "").trim();
  const step = String(jobStep || "").trim();
  return status === "Promoted" && Boolean(step) && step !== "done" && step !== "blocked";
}

/** Clear parked-FIFO stamps when variants are Ready or the draft breached the 30m SLA. */
export function shouldClearAutonomousResumeDeferred(notes, variantStatus, createdAt, nowMs = Date.now()) {
  if (!isAutonomousResumeDeferred(notes)) return false;
  if (String(variantStatus || "").trim() === "Ready") return true;
  // Overdue Preparing stays parked (firstAutonomousResumeDraft skips stale Preparing).
  if (String(variantStatus || "").trim() === "Preparing") return false;
  return photoReadySlaOverdue(createdAt, nowMs);
}

/** 1 a.m. creates ideas. Production of photo-ready ideas starts at 8 a.m. Chicago and continues after that. */
export function dailyIdeaProduceHasStarted(chicago, { force = false } = {}) {
  if (force) return true;
  const hour = Number(chicago?.hour);
  return Number.isFinite(hour) && hour >= 8;
}

/**
 * Photo-wait Ready ideas on profiles with Autonomous produce on.
 * Waiting ideas, promoted ideas, and Chicago/LA (switch off) stay out.
 */
export function dailyIdeasReadyToProduce(ideas, enabledProfileIds) {
  const enabled = new Set(
    (Array.isArray(enabledProfileIds) ? enabledProfileIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const blocked = /^(on hold|rejected|promoted)$/i;
  return (Array.isArray(ideas) ? ideas : []).filter((idea) => {
    if (String(idea?.photo_wait_status || "").trim() !== "Ready") return false;
    if (idea?.promoted) return false;
    if (idea?.already_autonomous) return false;
    const candidate = String(idea?.candidate_status || "").trim();
    if (blocked.test(candidate)) return false;
    return enabled.has(String(idea?.profile_id || "").trim());
  });
}

export function stampAutonomousOrigin(notes) {
  const text = String(notes || "").trim();
  if (isAutonomousOrigin(text)) return text;
  return text ? `origin=autonomous\n${text}` : "origin=autonomous";
}

export const FACTORY_REVISION_NOTE_PREFIX = "[factory-revision-open]";

/** Operator Factory send-back. Autonomous promote 409s until a human clicks Approve. */
export function productionNotesRevisionOpen(notes) {
  return String(notes || "")
    .split(/\r?\n/)
    .some((line) => String(line || "").trim().startsWith(FACTORY_REVISION_NOTE_PREFIX));
}

export function autonomousErrorIsFactoryRevision(error) {
  return /open for Factory revision/i.test(String(error?.message || error || ""));
}

/**
 * Drop the FIFO lock without keeping the held request id.
 * Do not stamp autonomous_resume=deferred: Ready variants clear that stamp
 * and the same hold is picked again.
 */
export function autonomousRevisionLockReset({ chicagoDate = null, productionRequestId = null, ideaId = null } = {}) {
  return {
    status: "reset",
    skip_reason: "skip_factory_revision_open",
    chicago_date: chicagoDate || null,
    slot: null,
    idea_id: null,
    production_request_id: null,
    parked_production_request_id: productionRequestId || null,
    parked_idea_id: ideaId || null,
  };
}

/** Park a Draft that is monopolizing FIFO (stuck Preparing / deferred by resume). */
export function isAutonomousResumeDeferred(notes) {
  const text = String(notes || "");
  // Prefer autonomous_resume=deferred; also honor earlier queue=deferred stamps.
  return /(?:^|\n)\s*autonomous_resume\s*=\s*deferred\b/i.test(text)
    || /(?:^|\n)\s*queue\s*=\s*deferred\b/i.test(text);
}

export function stampAutonomousResumeDeferred(notes, reason = "variants_still_preparing") {
  const text = String(notes || "").trim();
  const reasonLine = `autonomous_resume=deferred reason=${String(reason || "variants_still_preparing").slice(0, 80)}`;
  if (isAutonomousResumeDeferred(text)) {
    return text.replace(/(?:^|\n)\s*autonomous_resume\s*=\s*deferred[^\n]*/i, `\n${reasonLine}`).replace(/^\n/, "");
  }
  return text ? `${text}\n${reasonLine}` : reasonLine;
}

/** Clear parked-FIFO stamps once variants/reconcile finish so the draft can resume. */
export function clearAutonomousResumeDeferred(notes) {
  return String(notes || "")
    .split("\n")
    .filter((line) => {
      const text = String(line || "").trim();
      if (!text) return false;
      if (/^autonomous_resume\s*=\s*deferred\b/i.test(text)) return false;
      if (/^queue\s*=\s*deferred\b/i.test(text)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/**
 * waiting_variants / awaiting_i4 / hung resuming|picking older than maxAge
 * must not block the next city (Color Rush sat on status=resuming for hours).
 */
export function autonomousWaitingIsStale(last, nowMs = Date.now(), maxAgeMs = 12 * 60 * 1000) {
  const status = String(last?.status || "").trim();
  if (!["waiting_variants", "awaiting_i4", "resuming", "picking"].includes(status)) return false;
  const at = Date.parse(last?.at || "");
  if (!Number.isFinite(at)) return true;
  return nowMs - at >= maxAgeMs;
}

/**
 * Preparing frames with no progress past maxAge — skip so Miami/NYC FIFO can advance.
 * Resume kicks refresh Studio_Variant_Updated_At without finishing frames, so also
 * treat long-lived Preparing drafts (by Created_At) as stale past absoluteMaxAgeMs.
 */
export function autonomousPreparingIsStale(
  variantStatus,
  variantUpdatedAt,
  nowMs = Date.now(),
  maxAgeMs = 12 * 60 * 1000,
  draftCreatedAt = null,
  absoluteMaxAgeMs = 45 * 60 * 1000,
) {
  if (String(variantStatus || "").trim() !== "Preparing") return false;
  const created = Date.parse(draftCreatedAt || "");
  if (Number.isFinite(created) && nowMs - created >= absoluteMaxAgeMs) return true;
  const at = Date.parse(variantUpdatedAt || "");
  if (!Number.isFinite(at)) return true;
  return nowMs - at >= maxAgeMs;
}

/**
 * Oldest draft the morning resume may start.
 * origin=autonomous runs only for profiles with Autonomous produce on.
 * Deferred / long-Preparing / Factory-revision drafts are skipped so one city
 * cannot starve another. Other resume stamps, such as prepare-to-review, are unchanged.
 */
export function firstAutonomousResumeDraft(drafts, enabledProfileIds, nowMs = Date.now()) {
  const enabled = new Set(
    (Array.isArray(enabledProfileIds) ? enabledProfileIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  for (const draft of Array.isArray(drafts) ? drafts : []) {
    const notes = String(draft?.notes || draft?.production_notes || "");
    if (isAutonomousResumeDeferred(notes)) continue;
    if (productionNotesRevisionOpen(notes)) continue;
    if (autonomousPreparingIsStale(
      draft?.variant_status,
      draft?.variant_updated_at,
      nowMs,
      12 * 60 * 1000,
      draft?.created_at || draft?.createdTime || null,
    )) continue;
    if (!isAutonomousOrigin(notes)) return draft || null;
    const profileId = String(draft?.profile_id || "").trim();
    if (enabled.has(profileId)) return draft;
  }
  return null;
}

/** Draft / Ready / Submitted autonomous PRs must keep moving. Submitted is not a stop. */
export function autonomousRequestNeedsContinue(requestStatus, notes) {
  if (!isAutonomousOrigin(notes)) return false;
  return ["Draft", "Ready", "Submitted"].includes(String(requestStatus || "").trim());
}

export const AUTONOMOUS_MAX_MASTER_ASSETS = 12;
export const AUTONOMOUS_RELATED_STILL_MIN = 5;
export const AUTONOMOUS_RELATED_STILL_MAX = 10;

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

export function autonomousCanonicalContentType(contentType) {
  const raw = String(contentType || "").trim();
  if (raw === "Longform Video") return raw;
  return "Vertical Short Video";
}

export function autonomousPlanOverrides(_contentType) {
  return { ...AUTONOMOUS_REEL_OVERRIDES };
}

export function autonomousPlanExtras() {
  return AUTONOMOUS_PLAN_EXTRAS.map((row) => ({ ...row }));
}

export function autonomousDefaultVoiceoverSeconds(videoSeconds = AUTONOMOUS_DEFAULT_VIDEO_SECONDS) {
  const duration = Number(videoSeconds);
  const base = Number.isFinite(duration) && duration > 0 ? duration : AUTONOMOUS_DEFAULT_VIDEO_SECONDS;
  return Math.max(4, Math.round(base * AUTONOMOUS_DEFAULT_VOICEOVER_FRACTION));
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

export function parseAutonomousLinkedMediaIds(value) {
  const rows = Array.isArray(value) ? value : (value ? [value] : []);
  return [...new Set(rows.flatMap((item) => {
    if (typeof item === "string") return [item.trim()];
    if (item && typeof item === "object") {
      return [String(item.id || item.record_id || "").trim()];
    }
    return [];
  }).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
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

export function autonomousOccupiedMediaIdSet(occupied = []) {
  return new Set((occupied || []).flatMap((row) => row?.media_asset_ids || []).filter(Boolean));
}

export function autonomousPickUsesFreshMedia(pick, occupied = []) {
  const pickMedia = new Set((pick?.media_asset_ids || []).filter(Boolean));
  if (!pickMedia.size) return false;
  const used = autonomousOccupiedMediaIdSet(occupied);
  for (const id of pickMedia) {
    if (used.has(id)) return false;
  }
  return true;
}

export function filterAutonomousOccupiedForProfile(occupied = [], profileId = "") {
  const id = String(profileId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(id)) return occupied || [];
  return (occupied || []).filter((row) => !row?.content_profile_id || row.content_profile_id === id);
}

/** Same place, location, or subject conflicts. Reusing a photo does not. */
export function autonomousIdeaConflictsOccupied(pick, occupied = []) {
  const pickHay = autonomousPickHaystack(pick);
  const pickTokens = autonomousTopicTokens(pickHay);
  const pickPlaces = new Set(autonomousPlaceSubjects(pickHay));
  const pickLocation = autonomousNormalizedPlace(pick?.primary_location || pick?.location);
  for (const row of occupied) {
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

export function autonomousOccupiedPlaceKeys(occupied = []) {
  return new Set((occupied || []).flatMap((row) => autonomousPlaceSubjects(autonomousOccupiedHaystack(row))));
}

export function autonomousOccupiedLocationKeys(occupied = []) {
  return new Set(
    (occupied || [])
      .map((row) => autonomousNormalizedPlace(row?.location))
      .filter((value) => value && value !== "chicago")
  );
}

/** A cluster conflicts when its place, location, or topic is already in flight. Asset ids do not. */
export function autonomousClusterConflictsOccupied(cluster, occupied = []) {
  const assets = cluster?.assets || [];
  if (!assets.length || !(occupied || []).length) return false;
  const places = autonomousOccupiedPlaceKeys(occupied);
  const locations = autonomousOccupiedLocationKeys(occupied);
  const key = String(cluster?.key || "");
  if (key.startsWith("place:")) {
    const place = key.slice("place:".length);
    if (place && places.has(place)) return true;
  }
  if (key.startsWith("location:")) {
    const location = key.slice("location:".length);
    if (location && (locations.has(location) || places.has(location))) return true;
  }
  if (key.startsWith("topic:")) {
    const topicText = autonomousNormalizedPlace(key.slice("topic:".length).replace(/\//g, " "));
    if (topicText) {
      for (const row of occupied) {
        const hay = autonomousNormalizedPlace(autonomousOccupiedHaystack(row));
        if (hay && (hay === topicText || hay.includes(topicText))) return true;
      }
    }
  }
  const label = String(cluster?.label || "");
  if (autonomousPlaceSubjects(label).some((place) => places.has(place))) return true;
  const labelLocation = autonomousNormalizedPlace(label);
  if (labelLocation && labelLocation !== "chicago" && locations.has(labelLocation)) return true;
  for (const row of assets) {
    const hay = autonomousOccupiedHaystack(row);
    if (autonomousPlaceSubjects(hay).some((place) => places.has(place))) return true;
    const location = autonomousNormalizedPlace(row?.location);
    if (location && location !== "chicago" && (locations.has(location) || places.has(location))) return true;
  }
  return false;
}

/** Legacy id filter. Hourly harvest does not use it; subject dedup is the gate. */
export function autonomousUnusedLibraryAssets(assets, occupied = []) {
  const used = new Set((occupied || []).flatMap((row) => row?.media_asset_ids || []));
  return (assets || []).filter((row) => {
    const id = String(row?.id || row?.media_asset_id || "").trim();
    return /^rec[A-Za-z0-9]+$/.test(id) && !used.has(id);
  });
}

export function autonomousAssetClusterKey(row) {
  const hay = autonomousOccupiedHaystack(row);
  const place = autonomousPlaceSubjects(hay)[0];
  if (place) return `place:${place}`;
  const location = autonomousNormalizedPlace(row?.location);
  if (location && location !== "chicago") return `location:${location}`;
  const topic = autonomousNormalizedPlace(row?.topic);
  if (topic) {
    const subtopic = autonomousNormalizedPlace(row?.subtopic);
    return subtopic ? `topic:${topic}/${subtopic}` : `topic:${topic}`;
  }
  return "";
}

export function autonomousAssetClusterLabel(row, key = "") {
  const place = String(key || "").startsWith("place:") ? key.slice(6) : "";
  return String(row?.location || row?.topic || place || row?.subtopic || "related stills")
    .trim()
    .slice(0, 80);
}

export function groupUnusedLibraryClusters(assets) {
  const groups = new Map();
  for (const row of assets || []) {
    const key = autonomousAssetClusterKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      label: autonomousAssetClusterLabel(rows[0], key),
      count: rows.length,
      assets: rows,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function summarizeUnusedLibraryOverview(assets, { limit = 16 } = {}) {
  const clusters = groupUnusedLibraryClusters(assets);
  return {
    unused_count: (assets || []).length,
    cluster_count: clusters.length,
    clusters: clusters.slice(0, limit).map(({ key, label, count }) => ({ key, label, count })),
  };
}

export function pickRelatedUnusedStillCluster(assets, {
  min = AUTONOMOUS_RELATED_STILL_MIN,
  max = AUTONOMOUS_RELATED_STILL_MAX,
  occupied = [],
} = {}) {
  const clusters = groupUnusedLibraryClusters(assets).filter((row) => {
    if (row.count < min) return false;
    return !autonomousClusterConflictsOccupied(row, occupied);
  });
  if (!clusters.length) return null;
  clusters.sort((left, right) => {
    const leftScore = Math.min(left.count, max);
    const rightScore = Math.min(right.count, max);
    if (rightScore !== leftScore) return rightScore - leftScore;
    const leftNew = Math.max(...left.assets.map((row) => Date.parse(row?.intake_date) || 0));
    const rightNew = Math.max(...right.assets.map((row) => Date.parse(row?.intake_date) || 0));
    return rightNew - leftNew;
  });
  const best = clusters[0];
  return {
    key: best.key,
    label: best.label,
    assets: best.assets.slice(0, max),
    leftover: Math.max(0, best.count - max),
  };
}

export function completeRelatedStillPick(selectedIds, clusterAssets, {
  min = AUTONOMOUS_RELATED_STILL_MIN,
  max = AUTONOMOUS_RELATED_STILL_MAX,
} = {}) {
  const allowed = [];
  for (const row of clusterAssets || []) {
    const id = String(row?.id || row?.media_asset_id || "").trim();
    if (/^rec[A-Za-z0-9]+$/.test(id) && !allowed.includes(id)) allowed.push(id);
  }
  const ordered = [];
  for (const raw of selectedIds || []) {
    const id = String(raw || "").trim();
    if (!allowed.includes(id) || ordered.includes(id)) continue;
    ordered.push(id);
  }
  for (const id of allowed) {
    if (ordered.length >= max) break;
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered.length >= min ? ordered.slice(0, max) : [];
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
    content_profile_id: firstLinkedRecordId(fields.Content_Profile) || null,
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
    media_asset_ids: [...new Set([
      ...parseAutonomousNotedMediaIds(notes),
      ...parseAutonomousLinkedMediaIds(fields.Studio_Master_Media_Assets),
    ])],
    content_profile_id: firstLinkedRecordId(fields.Content_Profile) || null,
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

function autonomousPrimaryPlace(title, location, notes) {
  return autonomousPlaceSubjects(title, location, notes)[0] || "";
}

/** Group recent packages that share a named place when at least one extra is origin=autonomous. */
export function collectAutonomousTopicCollisions(packages = []) {
  const groups = new Map();
  for (const row of packages || []) {
    const title = String(row?.title || "").trim();
    const location = String(row?.location || "").trim();
    const notes = String(row?.notes || "").trim();
    const place = autonomousPrimaryPlace(title, location, notes);
    if (!place) continue;
    const id = String(row?.id || row?.record_id || "").trim();
    const created = Date.parse(row?.createdTime || row?.created_at || "") || 0;
    const originAutonomous = row?.origin === "autonomous" || isAutonomousOrigin(notes);
    if (!groups.has(place)) groups.set(place, []);
    groups.get(place).push({
      id,
      title,
      location,
      notes,
      origin_autonomous: originAutonomous,
      created,
      status: String(row?.status || "").trim(),
    });
  }
  const collisions = [];
  for (const [place, rows] of groups) {
    const unique = [];
    const seen = new Set();
    for (const row of rows) {
      const key = row.id || `${row.title}|${row.location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }
    if (unique.length < 2) continue;
    unique.sort((left, right) => {
      if (left.origin_autonomous !== right.origin_autonomous) return left.origin_autonomous ? 1 : -1;
      return left.created - right.created;
    });
    const extras = unique.slice(1).filter((row) => row.origin_autonomous);
    if (!extras.length) continue;
    collisions.push({
      place,
      keep: unique[0],
      extras,
      packages: unique,
    });
  }
  return collisions;
}

export function autonomousRecordIsRecent(record, nowMs = Date.now(), maxAgeMs = 14 * 24 * 60 * 60 * 1000) {
  const ts = Date.parse(record?.createdTime || record?.fields?.Create_Date || record?.Create_Date || "");
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts <= maxAgeMs;
}

export function autonomousPreferredSubject(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function autonomousYoutubeQueriesForTheme(theme) {
  const key = String(theme || "chicago").trim().toLowerCase();
  return AUTONOMOUS_YOUTUBE_QUERIES_BY_THEME[key] || AUTONOMOUS_YOUTUBE_QUERIES;
}

export function pickAutonomousEnabledProfile(profiles, requestedId) {
  const rows = Array.isArray(profiles) ? profiles : [];
  const wanted = String(requestedId || "").trim();
  if (/^rec[A-Za-z0-9]+$/.test(wanted)) {
    const hit = rows.find((row) => row.id === wanted);
    if (hit) return hit;
  }
  return rows[0] || null;
}

export function autonomousProfileHarvestOrder(profiles, requestedId, refillByProfileId = null) {
  const selected = pickAutonomousEnabledProfile(profiles, requestedId);
  const ordered = [];
  const seen = new Set();
  for (const row of [selected, ...(Array.isArray(profiles) ? profiles : [])]) {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(row);
  }
  if (!refillByProfileId || typeof refillByProfileId !== "object") return ordered;
  return [...ordered].sort((a, b) => {
    const da = Number(refillByProfileId[String(a?.id || "")]?.deficit) || 0;
    const db = Number(refillByProfileId[String(b?.id || "")]?.deficit) || 0;
    if (db !== da) return db - da;
    return 0;
  });
}

export function buildAutonomousPickerPrompt({
  profile,
  trends,
  assets,
  recentTitles,
  occupiedIdeas,
  preferredSubject,
  overview,
  clusterLabel,
}) {
  const profileName = profile?.name || profile?.Profile_Name || "ChicagoShining";
  const avoid = profile?.avoid_topics || profile?.Avoid_Topics || "";
  const voice = profile?.brand_voice || profile?.Brand_Voice || "";
  const pin = autonomousPreferredSubject(preferredSubject);
  const pinBlock = pin
    ? `

OPERATOR PIN (this run only)
Use only stills of: ${pin}. Title, location, and media_asset_ids must be that landmark. If none of the listed stills match, return {"skip":true,"reason":"no_matching_subject_stills"}.`
    : "";
  const clusterLine = clusterLabel
    ? `The listed stills are one related subject: ${clusterLabel}. Use 5 to 10 of them.`
    : "Pick 5 to 10 stills of ONE related subject. Do not mix unrelated places.";
  return `You are ChicagoShining's autonomous producer. Start from library stills of one place or subject. Review the overview, then write ONE idea that best uses a related set of 5 to 10 photos.

Return ONLY one raw JSON object. No markdown.

A news/social trend is optional flavor. Do not skip because no headline matches a still. Do not invent events, dates, prices, or rankings. Do not pick generic skyline filler. Reusing a photo that already appeared on another post is OK. Do not repeat a subject, place, or landmark that is already in flight or recent.${pinBlock}

ACTIVE PROFILE
Name: ${profileName}
Voice: ${voice}
Avoid topics: ${avoid}

LIBRARY OVERVIEW (counts only; do not invent stills)
${JSON.stringify(overview || {}, null, 2)}

RELATED SUBJECT SET (review these; use only these media_asset_ids)
${clusterLine}
${JSON.stringify(assets, null, 2)}

OPTIONAL TREND HARVEST (cite only if it actually fits the stills you picked)
${JSON.stringify(trends, null, 2)}

IN FLIGHT OR RECENT IDEAS (do not repeat these subjects or places)
${JSON.stringify(occupiedIdeas || recentTitles || [], null, 2)}

If every listed still is the same subject as an in-flight or recent idea, return:
{"skip":true,"reason":"no_distinct_subject"}

If the related set is too thin to make a post, return:
{"skip":true,"reason":"no_related_subject_cluster"}

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
  "suggested_format": "Vertical Short Video",
  "post_caption": "publish-ready caption, 2-5 sentences, no invented facts",
  "media_asset_ids": ["rec..."]
}`;
}
