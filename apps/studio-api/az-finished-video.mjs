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

export function outputPairKey(platform, outputType) {
  return `${String(platform || "").trim()}::${String(outputType || "").trim()}`;
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

export function pickDuplicateOutputKeepers(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = outputPairKey(row?.platform, row?.output_type);
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
  return {
    content_type: "Vertical Short Video",
    platforms: [...AZ_PLATFORMS],
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
