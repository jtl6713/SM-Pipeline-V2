import { resolveTikTokTitleOverlay } from "../tiktok-overlay/contract.mjs";

export const STUDIO_TITLE_EDIT = Object.freeze({
  schema: "studio-title-edit-v1",
  default_position: "center",
  tiktok_default_position: "lower-third",
  default_size: 64,
  default_style: "Chicago Editorial",
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function text(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function overlayObject(input) {
  if (input && typeof input === "object") {
    if (input.overlay && typeof input.overlay === "object") return input.overlay;
    return input;
  }
  return {};
}

export function titleEditIdentity(overlay = {}, _durationSeconds = 4) {
  const o = overlayObject(overlay);
  const start = clamp(o.start_fraction ?? o.startFraction, 0, 1, 0);
  const end = clamp(o.end_fraction ?? o.endFraction, 0, 1, 1);
  return [
    STUDIO_TITLE_EDIT.schema,
    o.enabled === false ? "0" : "1",
    text(o.text, 1000),
    text(o.caption ?? o.subtitle, 500),
    text(o.position || STUDIO_TITLE_EDIT.default_position, 60),
    Math.round(clamp(o.size, 20, 140, STUDIO_TITLE_EDIT.default_size)),
    text(o.style_preset || o.stylePreset || STUDIO_TITLE_EDIT.default_style, 80),
    Math.min(start, end),
    Math.max(start, end),
  ].join("|");
}

export function nextTitleVersion(oldOverlay, newOverlay, durationSeconds = 4) {
  const previous = overlayObject(oldOverlay);
  const next = overlayObject(newOverlay);
  const hadVersion = Number.isFinite(Number(previous.version)) && Number(previous.version) >= 1;
  const prevVersion = hadVersion ? Math.round(Number(previous.version)) : 1;
  if (titleEditIdentity(previous, durationSeconds) === titleEditIdentity(next, durationSeconds)) {
    return hadVersion ? prevVersion : 1;
  }
  return hadVersion ? prevVersion + 1 : 1;
}

export function resolveTitleLock({
  reviewStatus = "",
  lock = null,
  overlayChanged = false,
  unlockRequested = false,
} = {}) {
  const stored = lock && typeof lock === "object" ? lock : {};
  const reviewApproved = String(reviewStatus || "") === "Approved";
  const locked = stored.locked === true || (reviewApproved && stored.locked !== false);
  if (locked && overlayChanged && !unlockRequested) {
    return Object.freeze({
      schema: STUDIO_TITLE_EDIT.schema,
      locked: true,
      allow: false,
      code: "title-lock-conflict",
    });
  }
  if (unlockRequested) {
    return Object.freeze({
      schema: STUDIO_TITLE_EDIT.schema,
      locked: false,
      allow: true,
      code: "unlocked",
    });
  }
  return Object.freeze({
    schema: STUDIO_TITLE_EDIT.schema,
    locked,
    allow: true,
    code: locked ? "locked-unchanged" : "unlocked",
  });
}

export function combinedTitleIdentity(slides = []) {
  return (Array.isArray(slides) ? slides : []).map((slide) => {
    const id = text(slide?.id || slide?.slideRecordId, 80);
    return `${id}:${titleEditIdentity(slide?.overlay, slide?.duration_seconds ?? slide?.durationSeconds)}`;
  }).join("||");
}

export function buildTitleRenderInput(input = {}) {
  const overlay = overlayObject(input);
  const platform = text(input.platform, 40);
  const ratio = text(input.ratio || input.target_aspect_ratio, 12);
  const durationSeconds = clamp(
    overlay.duration_seconds ?? overlay.durationSeconds ?? input.duration_seconds ?? input.durationSeconds,
    0.5,
    60,
    4,
  );
  const tiktok = platform === "TikTok" && ratio === "9:16";
  const resolved = tiktok
    ? resolveTikTokTitleOverlay({
      overlay: {
        enabled: overlay.enabled,
        text: overlay.text,
        position: overlay.position,
        size: overlay.size,
        style_preset: overlay.style_preset || overlay.stylePreset,
        start_fraction: overlay.start_fraction ?? overlay.startFraction,
        end_fraction: overlay.end_fraction ?? overlay.endFraction,
      },
      slide_name: input.slide_name || input.slideName,
      duration_seconds: durationSeconds,
    })
    : Object.freeze({
      recipe: null,
      enabled: overlay.enabled !== false && Boolean(text(overlay.text, 1000)),
      text: text(overlay.text, 1000),
      position: text(overlay.position || STUDIO_TITLE_EDIT.default_position, 60),
      size: Math.round(clamp(overlay.size, 20, 140, STUDIO_TITLE_EDIT.default_size)),
      style_preset: text(overlay.style_preset || overlay.stylePreset || STUDIO_TITLE_EDIT.default_style, 80),
      start_fraction: Math.min(
        clamp(overlay.start_fraction ?? overlay.startFraction, 0, 1, 0),
        clamp(overlay.end_fraction ?? overlay.endFraction, 0, 1, 1),
      ),
      end_fraction: Math.max(
        clamp(overlay.start_fraction ?? overlay.startFraction, 0, 1, 0),
        clamp(overlay.end_fraction ?? overlay.endFraction, 0, 1, 1),
      ),
      duration_seconds: durationSeconds,
      safe_area: null,
      safe_area_mode: null,
      idempotency_key: null,
    });
  const storedVersion = Number(overlay.version);
  const version = Number.isFinite(storedVersion) && storedVersion >= 1 ? Math.round(storedVersion) : 1;
  const caption = text(overlay.caption ?? overlay.subtitle, 500);
  const titleEditKey = [
    STUDIO_TITLE_EDIT.schema,
    version,
    resolved.enabled ? "1" : "0",
    resolved.text,
    caption,
    resolved.position,
    resolved.size,
    resolved.style_preset,
    resolved.start_fraction,
    resolved.end_fraction,
  ].join("|");
  return Object.freeze({
    schema: STUDIO_TITLE_EDIT.schema,
    version,
    caption,
    title_edit_key: titleEditKey,
    ...resolved,
  });
}
