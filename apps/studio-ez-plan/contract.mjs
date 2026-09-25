export const EZ_ORIGIN = "ez-button";

export const EZ_INPUTS = Object.freeze({
  SINGLE_PHOTO: "single-photo",
  MULTIPLE_PHOTOS: "multiple-photos",
  VIDEO_CLIPS: "video-clips",
  PHOTOS_AND_CLIPS: "photos-and-clips",
  FINISHED_VIDEO: "finished-video",
});

export const EZ_CAPTION_MODES = Object.freeze(["manual", "none", "ai"]);

export const EZ_PHASE1_INPUTS = Object.freeze([
  EZ_INPUTS.SINGLE_PHOTO,
  EZ_INPUTS.MULTIPLE_PHOTOS,
]);

export const EZ_DISABLED_INPUTS = Object.freeze([
  EZ_INPUTS.FINISHED_VIDEO,
]);

export const EZ_CLIP_INPUTS = Object.freeze([
  EZ_INPUTS.VIDEO_CLIPS,
  EZ_INPUTS.PHOTOS_AND_CLIPS,
]);

export const EZ_VIDEO_PASSES = Object.freeze({
  Instagram: "Reel",
  Facebook: "Reel",
  TikTok: "Video Draft",
  YouTube: "Short",
});

export function ezIsClipInput(kind) {
  const value = String(kind || "").trim();
  return EZ_CLIP_INPUTS.includes(value);
}

/** Native still/video object first. TikTok is always a draft destination. */
export const EZ_PHOTO_PASSES = Object.freeze({
  single: Object.freeze({
    Instagram: "Single Image",
    Facebook: "Single Image",
    TikTok: "Single Photo",
  }),
  video: Object.freeze({
    Instagram: "Reel",
    Facebook: "Reel",
    TikTok: "Video Draft",
    YouTube: "Short",
  }),
  slides: Object.freeze({
    Instagram: "Carousel",
    Facebook: "Multi-Image Post",
    TikTok: "Multi-Photo",
    YouTube: "Slideshow Video",
  }),
});

export const EZ_VIDEO_STORY_EXTRAS = Object.freeze(["Instagram::Story", "Facebook::Story"]);

export function ezPhotoCountKind(count) {
  const n = Math.max(0, Number(count) || 0);
  return n <= 1 ? EZ_INPUTS.SINGLE_PHOTO : EZ_INPUTS.MULTIPLE_PHOTOS;
}

/** Map Master_Content_Type onto the EZ package recommend used for /plan. */
export function ezPackageFromContentType(contentType) {
  const type = String(contentType || "").trim();
  if (type === "Carousel" || type === "Feed Post") return "slides";
  if (type === "Vertical Short Video" || type === "Longform Video" || type === "Photo Set" || type === "Story") {
    return "video";
  }
  return "";
}

export function ezDefaultPassMap(photoCount, packageId, { clipInput = false, finishedVideo = false, inputKind = "" } = {}) {
  const clip = Boolean(clipInput) || ezIsClipInput(inputKind);
  const finished = Boolean(finishedVideo) || String(inputKind || "") === EZ_INPUTS.FINISHED_VIDEO;
  const pkg = String(packageId || "").trim().toLowerCase();
  if (pkg === "video") {
    return (clip || finished) ? { ...EZ_VIDEO_PASSES } : { ...EZ_PHOTO_PASSES.video };
  }
  if (pkg === "slides") {
    return Math.max(0, Number(photoCount) || 0) <= 1
      ? { ...EZ_PHOTO_PASSES.single }
      : { ...EZ_PHOTO_PASSES.slides };
  }
  const n = Math.max(0, Number(photoCount) || 0);
  if (clip || finished) return { ...EZ_VIDEO_PASSES };
  return n <= 1 ? { ...EZ_PHOTO_PASSES.single } : { ...EZ_PHOTO_PASSES.video };
}

export function ezMasterContentType(photoCount, packageId = "") {
  const pkg = String(packageId || "").trim().toLowerCase();
  const n = Math.max(0, Number(photoCount) || 0);
  if (pkg === "slides") return n <= 1 ? "Feed Post" : "Carousel";
  return n <= 1 ? "Feed Post" : "Photo Set";
}

/**
 * Photo-count-aware /plan body. Client can POST this as { platforms, overrides }
 * so the live Worker honors EZ defaults before the planner itself is deployed.
 */
export function ezPlanFromPhotoCount({
  photoCount,
  platforms,
  packageId,
  contentType = "",
  clipInput = false,
  finishedVideo = false,
  inputKind = "",
} = {}) {
  const count = Math.max(0, Number(photoCount) || 0);
  const pkg = String(packageId || "").trim().toLowerCase() || ezPackageFromContentType(contentType);
  const defaults = ezDefaultPassMap(count, pkg, { clipInput, finishedVideo, inputKind });
  const requested = Array.isArray(platforms) && platforms.length
    ? [...new Set(platforms.map((value) => String(value || "").trim()).filter(Boolean))]
    : Object.keys(defaults);
  const items = [];
  for (const platform of requested) {
    const outputType = defaults[platform];
    if (!outputType) continue;
    items.push({ platform, output_type: outputType });
  }
  const extras = (pkg === "video" || (!pkg && count > 1)) ? [...EZ_VIDEO_STORY_EXTRAS] : [];
  return {
    photo_count: count,
    photo_count_kind: ezPhotoCountKind(count),
    master_content_type: ezMasterContentType(count, pkg),
    youtube_enabled: Boolean(defaults.YouTube),
    platforms: items.map((item) => item.platform),
    overrides: Object.fromEntries(items.map((item) => [item.platform, item.output_type])),
    extras,
    items,
  };
}

export function ezCanonicalOutputType(platform, outputType) {
  const p = String(platform || "").trim();
  const o = String(outputType || "").trim();
  if (p === "TikTok" && o === "Single Photo") return "Multi-Photo";
  return o;
}

export function ezCaptionFields(mode, { caption = "", captions = [] } = {}) {
  const normalized = String(mode || "ai").trim().toLowerCase();
  if (normalized === "manual") {
    const parts = Array.isArray(captions) ? captions.map((value) => String(value || "").trim()).filter(Boolean) : [];
    const text = String(caption || "").trim() || parts.join("\n\n");
    return {
      mode: "manual",
      overlay_titles: true,
      title_mode: "AI decides",
      requested_title: "",
      caption_mode: "Force exact",
      requested_caption: text,
    };
  }
  if (normalized === "none") {
    return {
      mode: "none",
      overlay_titles: false,
      title_mode: "Leave blank",
      requested_title: "",
      caption_mode: "Leave blank",
      requested_caption: "",
      script_mode: "Leave blank",
      requested_script: "",
      live_fallback: {
        title_mode: "Force exact",
        requested_title: " ",
        caption_mode: "Force exact",
        requested_caption: " ",
        script_mode: "AI decides",
        requested_script: "",
      },
    };
  }
  return {
    mode: "ai",
    overlay_titles: true,
    title_mode: "AI decides",
    requested_title: "",
    caption_mode: "AI decides",
    requested_caption: "",
  };
}

export function ezOriginNotes({ inputKind, captionMode, packageId } = {}) {
  const input = String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO;
  const caption = String(captionMode || "ai").trim().toLowerCase() || "ai";
  const pkg = String(packageId || "").trim().toLowerCase();
  const parts = [`origin=${EZ_ORIGIN}`, `ez-input=${input}`, `ez-caption=${caption}`];
  if (pkg === "video" || pkg === "slides" || pkg === "custom") parts.push(`ez-package=${pkg}`);
  return parts.join("; ");
}

export function ezIdeaSummary({ inputKind } = {}) {
  return `Created from New content (origin=${EZ_ORIGIN}; ez-input=${String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO}).`;
}

export function parseEzOriginNotes(value) {
  const text = String(value || "");
  if (!text.includes(`origin=${EZ_ORIGIN}`)) return null;
  const input = /ez-input=([a-z0-9-]+)/i.exec(text)?.[1] || "";
  const caption = /ez-caption=([a-z0-9-]+)/i.exec(text)?.[1] || "";
  return { origin: EZ_ORIGIN, inputKind: input, captionMode: caption };
}
