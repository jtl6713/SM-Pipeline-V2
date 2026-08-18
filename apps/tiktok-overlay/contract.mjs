export const TIKTOK_TITLE_OVERLAY = Object.freeze({
  recipe: "tiktok-title-overlay-v1",
  canvas: Object.freeze({ width: 1080, height: 1920 }),
  critical_4x5: Object.freeze({ width: 1080, height: 1350 }),
  safe_area: Object.freeze({ top: 285, right: 78, bottom: 285, left: 78 }),
  default_position: "lower-third",
  default_duration_seconds: 4,
  default_start_fraction: 0,
  default_end_fraction: 1,
  default_style: "Chicago Editorial",
  default_size: 64,
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function text(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

export function resolveTikTokTitleOverlay(input = {}) {
  const overlay = input.overlay && typeof input.overlay === "object" ? input.overlay : {};
  const resolvedText = text(overlay.text || input.slide_name, 1000);
  const enabled = overlay.enabled !== false && overlay.style_preset !== "No Text" && Boolean(resolvedText);
  const start = clamp(overlay.start_fraction ?? overlay.startFraction, 0, 1, TIKTOK_TITLE_OVERLAY.default_start_fraction);
  const end = clamp(overlay.end_fraction ?? overlay.endFraction, 0, 1, TIKTOK_TITLE_OVERLAY.default_end_fraction);
  const safe = TIKTOK_TITLE_OVERLAY.safe_area;
  const duration = clamp(
    overlay.duration_seconds ?? input.duration_seconds,
    0.5,
    60,
    TIKTOK_TITLE_OVERLAY.default_duration_seconds,
  );
  const resolved = {
    recipe: TIKTOK_TITLE_OVERLAY.recipe,
    enabled,
    text: enabled ? resolvedText : "",
    position: enabled
      ? text(overlay.position || TIKTOK_TITLE_OVERLAY.default_position, 60)
      : TIKTOK_TITLE_OVERLAY.default_position,
    size: Math.round(clamp(overlay.size, 20, 140, TIKTOK_TITLE_OVERLAY.default_size)),
    style_preset: text(overlay.style_preset || overlay.stylePreset || TIKTOK_TITLE_OVERLAY.default_style, 80),
    start_fraction: Math.min(start, end),
    end_fraction: Math.max(start, end),
    duration_seconds: duration,
    safe_area: { ...safe },
    safe_area_mode: "tiktok-9x16",
  };
  resolved.idempotency_key = overlayIdentityKey(resolved);
  return Object.freeze(resolved);
}

export function overlayIdentityKey(resolved) {
  return [
    TIKTOK_TITLE_OVERLAY.recipe,
    resolved.enabled ? "1" : "0",
    resolved.text,
    resolved.position,
    resolved.size,
    resolved.style_preset,
    resolved.start_fraction,
    resolved.end_fraction,
    resolved.duration_seconds,
    `${resolved.safe_area.top},${resolved.safe_area.right},${resolved.safe_area.bottom},${resolved.safe_area.left}`,
  ].join("|");
}

export function criticalContentInsideCentered4x5(safeArea = TIKTOK_TITLE_OVERLAY.safe_area) {
  const inset = (TIKTOK_TITLE_OVERLAY.canvas.height - TIKTOK_TITLE_OVERLAY.critical_4x5.height) / 2;
  return safeArea.top >= inset && safeArea.bottom >= inset;
}
