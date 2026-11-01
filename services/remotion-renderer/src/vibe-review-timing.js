"use strict";

/**
 * The normal PhotoSequence budget is >= 1 second per scene. A protected,
 * immutable, music-driven Vibe revision needs exact subsecond cut boundaries.
 * This single policy is shared by Remotion metadata and the composition so
 * the exported MP4 duration cannot silently drift from the approved plan.
 */
function clipFrameDurations(clips, fps, studioRevision) {
  if (!Array.isArray(clips) || !Number.isInteger(fps) || fps < 1) {
    throw new Error("vibe_timing_inputs_invalid");
  }
  const vibe = studioRevision?.source === "rendering_review_vibe_cut";
  const minimumVibeFrames = Math.ceil(fps * 0.2);
  return clips.map((clip, index) => {
    const frames = Number(clip?.durationFrames);
    if (vibe) {
      // A missing / malformed cut must not be silently lengthened or shortened.
      if (!Number.isInteger(frames) || frames < minimumVibeFrames ||
          frames > 30 * fps) {
        throw new Error("vibe_exact_cut_frames_invalid:" + (index + 1));
      }
      return frames;
    }
    return Number.isFinite(frames)
      ? Math.max(fps, Math.round(frames))
      : fps * 3;
  });
}

module.exports = {clipFrameDurations};
