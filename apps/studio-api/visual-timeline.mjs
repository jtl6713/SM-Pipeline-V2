/**
 * Canonical visual timeline primitives for Studio production review.
 *
 * Phase 1 is intentionally pure and storage-agnostic. The existing creative editor,
 * Airtable records, preview builder and Remotion renderer can all consume the same
 * normalized scene model without creating a second timeline authority.
 */
export const VISUAL_TIMELINE_SCHEMA_VERSION = "studio.visual-timeline.1";
export const VISUAL_TIMELINE_VOICEOVER_NARRATED = "narrated";
export const VISUAL_TIMELINE_VOICEOVER_SILENT = "silent";
export const VISUAL_TIMELINE_MIN_CLIP_MS = 100;

const VIDEO_RE = /(?:^(?:video|clip)$|^video\/|\.mp4(?:$|[?#])|\.mov(?:$|[?#])|\.m4v(?:$|[?#])|\.webm(?:$|[?#]))/i;

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerMs(value, fallback = null) {
  const parsed = finiteNumber(value, fallback);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function secondsToMs(value, fallback = null) {
  const parsed = finiteNumber(value, null);
  return parsed === null ? fallback : Math.max(0, Math.round(parsed * 1000));
}

function bool(value, fallback = false) {
  if (value === true || value === false) return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function cleanId(value) {
  return String(value ?? "").trim();
}

export function visualTimelineEnabled(env = {}) {
  return bool(env?.STUDIO_VISUAL_TIMELINE_V1, false);
}

export function isVisualTimelineVideo(scene = {}) {
  const mediaType = String(
    scene.media_type
    ?? scene.mediaType
    ?? scene.media_kind
    ?? scene.mediaKind
    ?? ""
  ).trim();
  if (VIDEO_RE.test(mediaType)) return true;
  const source = String(
    scene.url
    ?? scene.src
    ?? scene.preview_url
    ?? scene.source_url
    ?? scene.video_url
    ?? ""
  ).trim();
  return VIDEO_RE.test(source);
}

export function visualTimelineSceneId(scene = {}, index = 0) {
  return cleanId(
    scene.scene_id
    ?? scene.sceneId
    ?? scene.id
    ?? scene.slideRecordId
    ?? scene.slide_record_id
    ?? scene.asset_id
    ?? scene.assetId
    ?? scene.media_asset_record_id
    ?? scene.mediaAssetRecordId
  ) || `scene-${index + 1}`;
}

export function normalizeVoiceoverMode(value, fallbackEnabled = true) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["silent", "no voiceover", "no_voiceover", "none", "off", "mute", "muted"].includes(text)) {
    return VISUAL_TIMELINE_VOICEOVER_SILENT;
  }
  if (["narrated", "voiceover", "on", "yes", "enabled"].includes(text)) {
    return VISUAL_TIMELINE_VOICEOVER_NARRATED;
  }
  return fallbackEnabled
    ? VISUAL_TIMELINE_VOICEOVER_NARRATED
    : VISUAL_TIMELINE_VOICEOVER_SILENT;
}

export function normalizeClipTrim(scene = {}, {
  minDurationMs = VISUAL_TIMELINE_MIN_CLIP_MS,
} = {}) {
  const video = isVisualTimelineVideo(scene);
  const configuredDurationMs = integerMs(
    scene.duration_ms
    ?? scene.effective_duration_ms
    ?? secondsToMs(scene.duration_seconds, null),
    null,
  );
  const sourceDurationMs = integerMs(
    scene.source_duration_ms
    ?? secondsToMs(scene.source_duration_seconds, null),
    null,
  );
  if (!video) {
    return {
      source_in_ms: null,
      source_out_ms: null,
      source_duration_ms: sourceDurationMs,
      trim_user_set: false,
      effective_duration_ms: configuredDurationMs ?? 4000,
    };
  }

  const hasIn = scene.source_in_ms !== null && scene.source_in_ms !== undefined && scene.source_in_ms !== "";
  const hasOut = scene.source_out_ms !== null && scene.source_out_ms !== undefined && scene.source_out_ms !== "";
  const userSet = bool(scene.trim_user_set ?? scene.trimUserSet, hasIn || hasOut);
  const rawSourceIn = finiteNumber(scene.source_in_ms ?? scene.sourceInMs, 0) ?? 0;
  const rawSourceOut = finiteNumber(scene.source_out_ms ?? scene.sourceOutMs, null);
  if (rawSourceIn < 0 || (rawSourceOut !== null && rawSourceOut < 0)) {
    throw new RangeError("Clip trim must satisfy 0 ≤ source_in_ms < source_out_ms.");
  }
  let sourceInMs = Math.round(rawSourceIn);
  let sourceOutMs = rawSourceOut === null ? null : Math.round(rawSourceOut);

  if (sourceOutMs === null) {
    if (configuredDurationMs !== null) sourceOutMs = sourceInMs + configuredDurationMs;
    else if (sourceDurationMs !== null) sourceOutMs = sourceDurationMs;
  }

  if (sourceOutMs === null) {
    throw new RangeError("Video scene needs a source out point, source duration, or effective duration.");
  }
  if (sourceOutMs <= sourceInMs) {
    throw new RangeError("Clip trim must satisfy 0 ≤ source_in_ms < source_out_ms.");
  }
  if (sourceDurationMs !== null && sourceOutMs > sourceDurationMs) {
    throw new RangeError("Clip source_out_ms cannot exceed source duration.");
  }
  const selectedDurationMs = sourceOutMs - sourceInMs;
  if (selectedDurationMs < Math.max(1, Number(minDurationMs) || VISUAL_TIMELINE_MIN_CLIP_MS)) {
    throw new RangeError(`Clip trim must be at least ${Math.max(1, Number(minDurationMs) || VISUAL_TIMELINE_MIN_CLIP_MS)} ms.`);
  }

  return {
    source_in_ms: sourceInMs,
    source_out_ms: sourceOutMs,
    source_duration_ms: sourceDurationMs,
    trim_user_set: userSet,
    // The user's selected range is authoritative. Suggested/configured duration never
    // shortens or expands an explicit trim.
    effective_duration_ms: selectedDurationMs,
  };
}

export function normalizeVisualTimelineScene(scene = {}, index = 0) {
  const video = isVisualTimelineVideo(scene);
  const trim = normalizeClipTrim(scene);
  const existingVoiceEnabled = scene.voiceover?.enabled !== false
    && scene.voiceover_enabled !== false;
  const voiceoverMode = normalizeVoiceoverMode(
    scene.voiceover_mode ?? scene.voiceoverMode,
    existingVoiceEnabled,
  );
  const rawNarration = String(
    scene.narration_text
    ?? scene.voiceover_text
    ?? scene.voiceover?.text
    ?? ""
  ).replace(/\s+/g, " ").trim();

  return {
    scene_id: visualTimelineSceneId(scene, index),
    asset_id: cleanId(
      scene.asset_id
      ?? scene.assetId
      ?? scene.media_asset_record_id
      ?? scene.mediaAssetRecordId
      ?? scene.slideRecordId
      ?? ""
    ),
    ordinal: Math.max(1, Math.round(finiteNumber(scene.ordinal ?? scene.order, index + 1) || index + 1)),
    include: scene.include !== false,
    media_type: video ? "video" : "still",
    duration_ms: trim.effective_duration_ms,
    voiceover_mode: voiceoverMode,
    narration_locked: bool(scene.narration_locked ?? scene.narrationLocked, false),
    narration_text: voiceoverMode === VISUAL_TIMELINE_VOICEOVER_SILENT ? "" : rawNarration,
    source_in_ms: trim.source_in_ms,
    source_out_ms: trim.source_out_ms,
    source_duration_ms: trim.source_duration_ms,
    trim_user_set: trim.trim_user_set,
    native_audio_mode: String(scene.native_audio_mode ?? scene.nativeAudioMode ?? "inherit").trim().toLowerCase() || "inherit",
  };
}

function stableScenePayload(scene) {
  return {
    scene_id: scene.scene_id,
    asset_id: scene.asset_id,
    ordinal: scene.ordinal,
    include: scene.include,
    media_type: scene.media_type,
    duration_ms: scene.duration_ms,
    voiceover_mode: scene.voiceover_mode,
    // Narration lock state and wording are versioned independently from the visual sequence.
    // The sequence fingerprint covers visual/editorial authority only.
    source_in_ms: scene.source_in_ms,
    source_out_ms: scene.source_out_ms,
    source_duration_ms: scene.source_duration_ms,
    trim_user_set: scene.trim_user_set,
    native_audio_mode: scene.native_audio_mode,
  };
}

export function visualTimelineSequenceHash(scenes = []) {
  const text = JSON.stringify((Array.isArray(scenes) ? scenes : []).map(stableScenePayload));
  // FNV-1a 64-bit: deterministic revision fingerprint, not a security primitive.
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `vt1-${hash.toString(16).padStart(16, "0")}`;
}

export function buildVisualTimeline(scenes = [], {
  previousTimeline = null,
} = {}) {
  // Array order is the operator's authoritative visual order. Old ordinal values may
  // survive a drag operation in client objects, so never sort by stale ordinals here.
  const normalized = (Array.isArray(scenes) ? scenes : [])
    .map((scene, index) => normalizeVisualTimelineScene(scene, index))
    .map((scene, index) => ({ ...scene, ordinal: index + 1 }));

  const sequenceHash = visualTimelineSequenceHash(normalized);
  const previousHash = cleanId(previousTimeline?.sequence_hash ?? previousTimeline?.sequenceHash);
  const previousRevision = Math.max(0, Math.round(finiteNumber(previousTimeline?.revision, 0) || 0));
  const revision = previousHash && previousHash === sequenceHash
    ? Math.max(1, previousRevision)
    : Math.max(1, previousRevision + 1);

  let cursor = 0;
  const voiceoverIntervals = [];
  for (const scene of normalized) {
    if (!scene.include) continue;
    const start = cursor;
    const end = cursor + scene.duration_ms;
    if (scene.voiceover_mode === VISUAL_TIMELINE_VOICEOVER_NARRATED) {
      voiceoverIntervals.push({ scene_id: scene.scene_id, start_ms: start, end_ms: end });
    }
    cursor = end;
  }

  return {
    schema_version: VISUAL_TIMELINE_SCHEMA_VERSION,
    revision,
    sequence_hash: sequenceHash,
    ordered_scene_ids: normalized.filter((scene) => scene.include).map((scene) => scene.scene_id),
    duration_ms: cursor,
    scenes: normalized,
    voiceover_intervals: voiceoverIntervals,
  };
}

export function buildVisualTimelineFromSlides(slides = [], options = {}) {
  return buildVisualTimeline((Array.isArray(slides) ? slides : []).map((slide, index) => ({
    ...slide,
    scene_id: visualTimelineSceneId(slide, index),
    asset_id: slide.asset_id
      ?? slide.media_asset_record_id
      ?? slide.media?.media_asset_record_id
      ?? slide.media?.id
      ?? slide.slideRecordId
      ?? slide.id,
    media_type: slide.media_type
      ?? slide.media_kind
      ?? slide.mediaKind
      ?? slide.media?.media_type
      ?? slide.media?.media_kind
      ?? (isVisualTimelineVideo(slide) ? "video" : "still"),
    voiceover_mode: slide.voiceover_mode
      ?? (slide.voiceover?.enabled === false ? "silent" : "narrated"),
    narration_text: slide.voiceover?.text ?? slide.narration_text ?? "",
    source_duration_ms: slide.source_duration_ms
      ?? secondsToMs(slide.source_duration_seconds, null),
  })), options);
}

export function applyVisualTimelineToSlides(slides = [], timeline = null) {
  if (!timeline || !Array.isArray(timeline.scenes) || !timeline.scenes.length) {
    return Array.isArray(slides) ? slides : [];
  }

  const base = Array.isArray(slides) ? slides : [];
  const bySceneId = new Map();
  const byAssetId = new Map();
  base.forEach((slide, index) => {
    bySceneId.set(visualTimelineSceneId(slide, index), slide);
    const assetId = cleanId(
      slide.asset_id
      ?? slide.media_asset_record_id
      ?? slide.media?.media_asset_record_id
      ?? slide.media?.id
      ?? slide.slideRecordId
      ?? slide.id
    );
    if (assetId && !byAssetId.has(assetId)) byAssetId.set(assetId, slide);
  });

  const used = new Set();
  const ordered = [];
  timeline.scenes.forEach((rawScene, index) => {
    const scene = normalizeVisualTimelineScene(rawScene, index);
    const baseSlide = bySceneId.get(scene.scene_id) || byAssetId.get(scene.asset_id);
    if (!baseSlide || used.has(baseSlide)) return;
    used.add(baseSlide);
    ordered.push({
      ...baseSlide,
      scene_id: scene.scene_id,
      order: index + 1,
      include: scene.include,
      duration_seconds: scene.duration_ms / 1000,
      voiceover_mode: scene.voiceover_mode,
      narration_locked: scene.narration_locked,
      source_in_ms: scene.source_in_ms,
      source_out_ms: scene.source_out_ms,
      source_duration_ms: scene.source_duration_ms,
      trim_user_set: scene.trim_user_set,
      native_audio_mode: scene.native_audio_mode,
      voiceover: {
        ...(baseSlide.voiceover || {}),
        enabled: scene.voiceover_mode !== VISUAL_TIMELINE_VOICEOVER_SILENT,
        // Preserve the prior wording as editable rollback context while the scene is
        // silent. Canonical script alignment remains empty because voiceover.enabled
        // is false and the timeline scene's narration_text is empty.
        text: scene.narration_text || baseSlide.voiceover?.text || "",
      },
    });
  });

  base.forEach((slide) => {
    if (!used.has(slide)) ordered.push({ ...slide, order: ordered.length + 1 });
  });
  return ordered;
}

export function visualTimelineHasMutation(payload = {}) {
  if (payload?.visual_timeline && typeof payload.visual_timeline === "object") return true;
  return (Array.isArray(payload?.slides) ? payload.slides : []).some((slide) =>
    [
      "scene_id",
      "voiceover_mode",
      "narration_locked",
      "source_in_ms",
      "source_out_ms",
      "source_duration_ms",
      "trim_user_set",
      "native_audio_mode",
    ].some((key) => Object.prototype.hasOwnProperty.call(slide || {}, key))
  );
}

export function assertVisualTimelineRevision(expectedRevision, expectedHash, currentTimeline) {
  const currentRevision = Math.max(0, Math.round(finiteNumber(currentTimeline?.revision, 0) || 0));
  const currentHash = cleanId(currentTimeline?.sequence_hash ?? currentTimeline?.sequenceHash);
  if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== "") {
    const expected = Math.max(0, Math.round(Number(expectedRevision) || 0));
    if (expected !== currentRevision) {
      throw new Error(`outdated visual sequence: expected revision ${expected}, current revision ${currentRevision}`);
    }
  }
  if (expectedHash && cleanId(expectedHash) !== currentHash) {
    throw new Error("outdated visual sequence: sequence hash no longer matches");
  }
  return true;
}
