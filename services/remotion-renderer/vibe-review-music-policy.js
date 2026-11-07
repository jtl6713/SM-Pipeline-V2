"use strict";

/**
 * Exact, private music source for an authorized, music-only Vibe review.
 * The Runner establishes ownership and rights; this second gate prevents a
 * renderer fallback to public Drive links, arbitrary URLs, HTML or silent media.
 * Ordinary production music localization is intentionally not changed.
 */
const DRIVE_ID = /^[A-Za-z0-9_-]{20,120}$/;

function vibeReviewMusicFileId({music, studioRevision}) {
  if (studioRevision?.source !== "rendering_review_vibe_cut") return null;
  if (!music || music.enabled !== true || typeof music.url !== "string") {
    throw new Error("vibe_review_music_source_missing");
  }
  let parsed;
  try {
    parsed = new URL(music.url);
  } catch {
    throw new Error("vibe_review_music_url_invalid");
  }
  const ids = parsed.searchParams.getAll("id");
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" ||
      parsed.username || parsed.password || parsed.port || parsed.hash ||
      parsed.pathname !== "/uc" ||
      parsed.searchParams.size !== 2 ||
      parsed.searchParams.getAll("export").length !== 1 ||
      parsed.searchParams.get("export") !== "download" ||
      ids.length !== 1 || !DRIVE_ID.test(ids[0]) ||
      music.url !== "https://drive.google.com/uc?export=download&id=" + ids[0]) {
    throw new Error("vibe_review_music_not_canonical_drive");
  }
  return ids[0];
}

function vibeReviewAudioExtension(buffer, byteCount) {
  if (!Buffer.isBuffer(buffer) || !Number.isSafeInteger(byteCount) || byteCount < 1024) {
    throw new Error("vibe_review_music_bytes_invalid");
  }
  const four = buffer.toString("ascii", 0, 4);
  if (buffer.toString("ascii", 0, 3) === "ID3" ||
      (buffer.length >= 2 && buffer[0] === 0xff &&
       (buffer[1] & 0xe0) === 0xe0)) return ".mp3";
  if (four === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return ".wav";
  if (four === "OggS") return ".ogg";
  if (four === "fLaC") return ".flac";
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    // Audio-only playback is validated again by final MP4 validation.
    return ".m4a";
  }
  throw new Error("vibe_review_music_not_audio");
}

/**
 * ffprobe stream evidence after private download. An ftyp container may be
 * a video MP4 rather than music, and MP3 magic bytes may be spoofed. Reject
 * any video track and missing/invalid duration even if the header looks audio.
 */
function verifyVibeReviewMusicStreams(probe) {
  if (!probe || typeof probe !== "object" || !Array.isArray(probe.streams) ||
      probe.streams.length < 1 || probe.streams.length > 8 ||
      !probe.format || typeof probe.format !== "object") {
    throw new Error("vibe_review_music_probe_unverified");
  }
  const audio = probe.streams.filter(s => s?.codec_type === "audio");
  if (audio.length !== 1 || probe.streams.some(s =>
       s?.codec_type === "video" || s?.codec_type === "subtitle" ||
       s?.codec_type === "data") ||
      probe.streams.some(s => s?.codec_type !== "audio" &&
        s?.codec_type !== "attachment") ||
      typeof audio[0].codec_name !== "string" ||
      !/^[a-z0-9_]{2,30}$/.test(audio[0].codec_name)) {
    throw new Error("vibe_review_music_not_audio_only");
  }
  const duration = Number(probe.format.duration || audio[0].duration);
  if (!Number.isFinite(duration) || duration < 0.25 || duration > 3600) {
    throw new Error("vibe_review_music_duration_unverified");
  }
  return {duration_seconds: duration, codec: audio[0].codec_name};
}

module.exports = {vibeReviewMusicFileId, vibeReviewAudioExtension, verifyVibeReviewMusicStreams};
