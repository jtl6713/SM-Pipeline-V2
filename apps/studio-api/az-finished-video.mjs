export const AZ_ORIGIN = "az-finished-video";
export const AZ_INPUT = "finished-video";

export const AZ_PLATFORMS = Object.freeze(["Instagram", "Facebook", "TikTok", "YouTube"]);
export const AZ_OVERRIDES = Object.freeze({
  Instagram: "Reel",
  Facebook: "Reel",
  TikTok: "Video Draft",
  YouTube: "Short",
});
export const AZ_EXTRAS = Object.freeze(["Instagram::Story", "Facebook::Story"]);
export const AZ_EXPECTED_OUTPUT_COUNT = AZ_PLATFORMS.length + AZ_EXTRAS.length;
export const FINISHED_STORY_TEASER_SECONDS = 10;
export const AZ_OUTPUT_LOCK_MS = 45_000;
export const FINISHED_DESTINATION_KEYS = Object.freeze([
  "Instagram::Reel",
  "Facebook::Reel",
  "TikTok::Video Draft",
  "YouTube::Short",
  "Instagram::Story",
  "Facebook::Story",
]);
export const FINISHED_HORIZONTAL_KEYS = Object.freeze(["YouTube::Standard Video"]);
export const AZ_HORIZONTAL_EXPECTED_OUTPUT_COUNT = FINISHED_HORIZONTAL_KEYS.length;

export function outputPairKey(platform, outputType) {
  return `${String(platform || "").trim()}::${String(outputType || "").trim()}`;
}

export function parseSourceAspect(notes) {
  const match = /source-aspect=(horizontal|vertical)/i.exec(String(notes || ""));
  return match ? match[1].toLowerCase() : "vertical";
}

export function isHorizontalFinishedAspect(notes) {
  return parseSourceAspect(notes) === "horizontal";
}

export function azExpectedOutputCount(notes) {
  return isHorizontalFinishedAspect(notes) ? AZ_HORIZONTAL_EXPECTED_OUTPUT_COUNT : AZ_EXPECTED_OUTPUT_COUNT;
}

export function finishedDestinationKeysForNotes(notes) {
  return isHorizontalFinishedAspect(notes) ? FINISHED_HORIZONTAL_KEYS : FINISHED_DESTINATION_KEYS;
}

export function canonicalFinishedDestinationKey(platform, outputType, { horizontal = false } = {}) {
  const p = String(platform || "").trim();
  const o = String(outputType || "").trim();
  if (!p) return "";
  if (horizontal) {
    if (p === "YouTube" && o === "Standard Video") return "YouTube::Standard Video";
    return "";
  }
  if (o === "Story") return `${p}::Story`;
  if (p === "Instagram") return "Instagram::Reel";
  if (p === "Facebook") return "Facebook::Reel";
  if (p === "TikTok") return "TikTok::Video Draft";
  if (p === "YouTube") return "YouTube::Short";
  return outputPairKey(p, o);
}

export function uniquePlanItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const platform = String(item?.platform || "").trim();
    const outputType = String(item?.output_type || item?.outputType || "").trim();
    if (!platform || !outputType) continue;
    const key = outputPairKey(platform, outputType);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, platform, output_type: outputType });
  }
  return out;
}

export function capFinishedPlanItems(items, { horizontal = false, notes = "" } = {}) {
  const horizontalMode = horizontal || isHorizontalFinishedAspect(notes);
  const allowed = new Set(horizontalMode ? FINISHED_HORIZONTAL_KEYS : FINISHED_DESTINATION_KEYS);
  const seen = new Set();
  const out = [];
  for (const item of uniquePlanItems(items)) {
    const key = canonicalFinishedDestinationKey(item.platform, item.output_type, { horizontal: horizontalMode });
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    const [platform, output_type] = key.split("::");
    out.push({ ...item, platform, output_type });
  }
  return out;
}

export function shouldCreateFinishedOutput(existingKeys, wantedKey, { horizontal = false, notes = "" } = {}) {
  const horizontalMode = horizontal || isHorizontalFinishedAspect(notes);
  const allowedKeys = horizontalMode ? FINISHED_HORIZONTAL_KEYS : FINISHED_DESTINATION_KEYS;
  const maxCount = horizontalMode ? AZ_HORIZONTAL_EXPECTED_OUTPUT_COUNT : AZ_EXPECTED_OUTPUT_COUNT;
  const key = String(wantedKey || "").trim();
  if (!key || !allowedKeys.includes(key)) return false;
  // Airtable/worker callers can return a single key, Set, object, or null here.
  // Normalize before iterating so finished-video promotion can never fail on .map().
  const rows = Array.isArray(existingKeys)
    ? existingKeys
    : existingKeys instanceof Set
      ? [...existingKeys]
      : existingKeys == null || existingKeys === ""
        ? []
        : typeof existingKeys === "object"
          ? Object.values(existingKeys)
          : [existingKeys];
  const live = new Set(rows.map((item) => String(item || "").trim()).filter(Boolean));
  if (live.has(key)) return false;
  return live.size < maxCount;
}

export function azOutputLockToken(now = Date.now()) {
  return `az-output-lock=${Number(now)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function azOutputLockAgeMs(notes, now = Date.now()) {
  const match = /az-output-lock=(\d+)/.exec(String(notes || ""));
  if (!match) return null;
  return Number(now) - Number(match[1]);
}

export function azOutputLockIsFresh(notes, now = Date.now()) {
  const age = azOutputLockAgeMs(notes, now);
  return age != null && age >= 0 && age < AZ_OUTPUT_LOCK_MS;
}

export function mergeAzOutputLock(notes, token) {
  const cleaned = String(notes || "").replace(/\n?az-output-lock=\S+/g, "").trim();
  return [cleaned, String(token || "").trim()].filter(Boolean).join("\n").slice(0, 10000);
}

export function azOutputLockHeld(notes, token) {
  const value = String(token || "").trim();
  return Boolean(value) && String(notes || "").includes(value);
}

export function pickDuplicateOutputKeepers(rows, { keyOf } = {}) {
  const keyFn = typeof keyOf === "function"
    ? keyOf
    : (row) => outputPairKey(row?.platform, row?.output_type);
  const groups = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key || key === "::") continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const keepers = [];
  const extras = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const aPo = a?.has_platform_output ? 0 : 1;
      const bPo = b?.has_platform_output ? 0 : 1;
      if (aPo !== bPo) return aPo - bPo;
      const orderA = Number(a?.output_order);
      const orderB = Number(b?.output_order);
      const ao = Number.isFinite(orderA) && orderA > 0 ? orderA : 9999;
      const bo = Number.isFinite(orderB) && orderB > 0 ? orderB : 9999;
      if (ao !== bo) return ao - bo;
      return String(a?.created_at || a?.id || "").localeCompare(String(b?.created_at || b?.id || ""));
    });
    keepers.push(sorted[0]);
    extras.push(...sorted.slice(1));
  }
  return { keepers, extras };
}

export function pickPlatformOutputSeedKeeper(rows) {
  const sorted = [...(rows || [])].filter(Boolean).sort((a, b) => {
    const aPublished = a?.published ? 0 : 1;
    const bPublished = b?.published ? 0 : 1;
    if (aPublished !== bPublished) return aPublished - bPublished;
    const an = Number(a?.output_id);
    const bn = Number(b?.output_id);
    const ao = Number.isFinite(an) && an > 0 ? an : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(bn) && bn > 0 ? bn : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return String(a?.created_at || a?.id || "").localeCompare(String(b?.created_at || b?.id || ""));
  });
  return {
    keeper: sorted[0] || null,
    extras: sorted.slice(1),
  };
}

export function finishedCompanionStoryFields() {
  return {
    Voiceover_Mode_Override: "No",
    Background_Music_Mode_Override: "No",
    Video_Duration_Seconds_Override: FINISHED_STORY_TEASER_SECONDS,
    Video_Clip_Count_Mode_Override: "Exact",
    Video_Clip_Count_Exact_Override: 1,
  };
}

export function finishedStoryTeaserClipFlags() {
  return {
    keepSourceAudio: true,
    muted: false,
  };
}

export function azOriginStamp({ caption = "ai", title = "" } = {}) {
  void title;
  return [`origin=${AZ_ORIGIN}`, `ez-input=${AZ_INPUT}`, `ez-caption=${caption || "ai"}`, "az-auto-queue=1"].join("; ");
}

export function isAzFinishedVideoOrigin(text) {
  const value = String(text || "");
  if (/origin=az-finished-video/i.test(value)) return true;
  return /az-auto-queue=1/i.test(value) && /ez-input=finished-video/i.test(value);
}

export function mergeAzProductionNotes(existing, { title = "" } = {}) {
  const stamp = azOriginStamp({ title });
  const text = String(existing || "").trim();
  if (!text) return stamp;
  if (isAzFinishedVideoOrigin(text) && /ez-input=finished-video/i.test(text)) return text;
  if (/origin=ez-wizard/i.test(text) && /ez-input=finished-video/i.test(text)) {
    const rewritten = text.replace(/origin=ez-wizard/i, `origin=${AZ_ORIGIN}`);
    return /az-auto-queue=1/i.test(rewritten) ? rewritten : `${rewritten}; az-auto-queue=1`;
  }
  return `${stamp}\n\n${text}`;
}

export function azDefaultPlanPayload() {
  return {
    platforms: [...AZ_PLATFORMS],
    overrides: { ...AZ_OVERRIDES },
    extras: [...AZ_EXTRAS],
    package: "video",
  };
}

export function azRequestDefaults({ title = "", productionNotes = "" } = {}) {
  const notes = mergeAzProductionNotes(productionNotes, { title });
  const horizontal = isHorizontalFinishedAspect(notes);
  return {
    content_type: horizontal ? "Longform Video" : "Vertical Short Video",
    platforms: horizontal ? ["YouTube"] : [...AZ_PLATFORMS],
    voiceover_mode: "No",
    background_music_mode: "No",
    thumbnail_mode: "Yes",
    video_duration_seconds: 30,
    title_mode: String(title || "").trim() ? "Force exact" : "AI decides",
    requested_title: String(title || "").trim(),
    caption_mode: "AI decides",
    requested_caption: "",
    script_mode: "Leave blank",
    requested_script: "",
    production_notes: notes,
  };
}
