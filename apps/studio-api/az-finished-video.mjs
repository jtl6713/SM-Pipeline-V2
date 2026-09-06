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
