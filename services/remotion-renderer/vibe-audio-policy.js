"use strict";

/**
 * A Vibe Cut is a licensed music montage. The existing renderer's voiceover
 * localization path requires a URL/src, so treating {enabled:false} as a
 * voiceover caused every music-only Vibe Cut request to fail in preparation.
 * Only an explicit, fully music-only review contract may omit narration.
 */
function noVoiceoverForVibeReview(body) {
  if (!body || body.studioRevision?.source !== "rendering_review_vibe_cut") {
    throw new Error("vibe_audio_scope_not_verified");
  }
  if (!body.voiceover || typeof body.voiceover !== "object" ||
      Array.isArray(body.voiceover) ||
      body.voiceover.enabled !== false ||
      Object.keys(body.voiceover).some(k => k !== "enabled") ||
      (body.voiceoverUrl !== undefined && body.voiceoverUrl !== "") ||
      (body.voiceoverText !== undefined && body.voiceoverText !== "") ||
      body.spokenCaptionsEnabled !== false ||
      body.captionTrackMode !== "none" ||
      !body.music || body.music.enabled !== true ||
      typeof body.music.url !== "string" || !body.music.url ||
      typeof body.music.volume !== "number" ||
      !Number.isFinite(body.music.volume) ||
      body.music.volume < 0 || body.music.volume > 1) {
    throw new Error("vibe_music_only_contract_invalid");
  }
  // No localized narration file and no generated VO track.
  return undefined;
}

module.exports = {noVoiceoverForVibeReview};
