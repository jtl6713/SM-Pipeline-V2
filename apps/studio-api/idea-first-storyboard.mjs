/**
 * Script a Short story-first state, embedded in canonical Airtable Ideas notes.
 * The script and required visuals are creative authority. Candidates are never approved.
 * Permission and media validation MUST run on the Worker before persisting a selection.
 */
export const STORY_FIRST_SCHEMA = "story-first.1";
export const STORY_FIRST_PREFIX = "[story-first.1] ";
const RECORD_ID = /^rec[A-Za-z0-9]+$/;
const DECISIONS = new Set(["unassigned", "library", "ai", "capture"]);
const MEDIA = new Set(["still", "clip", "still_or_clip"]);
const trim = (value, max = 800) => String(value == null ? "" : value).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);

function legacyDecision(choice, state, candidate) {
  if (state === "candidate_unverified" || choice === "review_or_replace" || choice === "review_or_capture") return "library";
  if (choice === "capture_preferred") return "capture";
  if (/^rec[A-Za-z0-9]+$/.test(String(candidate || ""))) return "library";
  return "unassigned";
}

export function parseStoryFirstNotes(notes) {
  const line = String(notes || "").split(/\r?\n/).find(value => /^\s*\[story-first\.1\]\s*\{/.test(value));
  if (!line) return null;
  try {
    const payload = JSON.parse(line.replace(/^\s*\[story-first\.1\]\s*/, ""));
    if (payload?.schema !== STORY_FIRST_SCHEMA || !Array.isArray(payload.scenes)) return null;
    return payload;
  } catch { return null; }
}

/** Explicitly approved storyboard asset IDs in scene order. */
export function storyFirstAssignedAssetIds(story) {
  if (!story || !Array.isArray(story.scenes)) return [];
  return story.scenes
    .map((scene) => String(scene?.assigned_asset_id || "").trim())
    .filter((id) => RECORD_ID.test(id));
}

/** True when every scene has an approved assigned library/AI asset. */
export function storyFirstMediaComplete(story) {
  if (!story || !Array.isArray(story.scenes) || !story.scenes.length) return false;
  if (String(story.status || "") === "media_complete") return true;
  return story.scenes.every((scene) =>
    scene?.selected_approved === true && RECORD_ID.test(String(scene?.assigned_asset_id || "")));
}

export function normalizeStoryFirst(input, profileId = "") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Storyboard object is required");
  const suppliedProfile = trim(input.profile_id, 64);
  const authoritativeProfile = trim(profileId, 64);
  if (suppliedProfile && authoritativeProfile && suppliedProfile !== authoritativeProfile) {
    throw new TypeError("Storyboard profile cannot be changed across profiles");
  }
  const owner = authoritativeProfile || suppliedProfile;
  if (!RECORD_ID.test(owner)) throw new TypeError("A valid Content Profile is required");
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 12) {
    throw new TypeError("Storyboard needs between 1 and 12 scenes");
  }
  const seconds = Math.round(Number(input.target_seconds || 30));
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 180) throw new TypeError("Short duration must be 5–180 seconds");
  let priorEnd = 0;
  const scenes = input.scenes.map((raw, index) => {
    const visual = trim(raw?.visual || raw?.suggested_visual, 340);
    if (visual.length < 5) throw new TypeError("Every scene needs a specific visual requirement");
    const explicit = trim(raw?.decision, 32);
    const decision = DECISIONS.has(explicit) ? explicit : legacyDecision(trim(raw?.choice), trim(raw?.state), raw?.candidate_asset_id);
    const assigned = trim(raw?.assigned_asset_id, 64);
    const candidate = trim(raw?.candidate_asset_id, 64);
    if (assigned && !RECORD_ID.test(assigned)) throw new TypeError("Invalid selected scene asset");
    if (candidate && !RECORD_ID.test(candidate)) throw new TypeError("Invalid scene candidate asset");
    const candidateAssets = (Array.isArray(raw?.candidate_assets) ? raw.candidate_assets : [])
      .filter(item => RECORD_ID.test(String(item?.id || ""))).slice(0, 3)
      .map(item => ({ id: trim(item.id, 64), reason: trim(item.reason, 120) }));
    const generatedMaster = trim(raw?.generated_master_id, 80);
    const acceptedMaster = trim(raw?.accepted_generated_master_id, 80);
    if (acceptedMaster && !/^aipre[A-Za-z0-9]+$/.test(acceptedMaster)) throw new TypeError("Invalid accepted generated master ID");
    if (generatedMaster && !/^aipre[A-Za-z0-9]+$/.test(generatedMaster)) throw new TypeError("Invalid generated master ID");
    const rejected = (Array.isArray(raw?.rejected_ai_ids) ? raw.rejected_ai_ids : [])
      .filter(id => /^aipre[A-Za-z0-9]+$/.test(String(id || ""))).slice(-10);
    const defaultFrom = Math.round(index * seconds / input.scenes.length);
    const defaultTo = Math.round((index + 1) * seconds / input.scenes.length);
    const time = trim(raw?.time, 24) || (defaultFrom + "-" + defaultTo);
    const match = /^(\d{1,3})\s*-\s*(\d{1,3})$/.exec(time);
    if (!match || +match[1] !== priorEnd || +match[2] <= +match[1] || +match[2] > seconds) {
      throw new TypeError("Scene timings must form one contiguous timeline starting at zero");
    }
    priorEnd = +match[2];
    const mediaRaw = trim(raw?.media, 32).toLowerCase();
    const media = ["video", "clip_preferred", "video_preferred"].includes(mediaRaw) ? "clip" : MEDIA.has(mediaRaw) ? mediaRaw : "still_or_clip";
    const approved = Boolean(assigned && raw?.selected_approved === true);
    const state = approved ? "media_approved"
      : assigned ? "needs_media_review"
      : decision === "ai" && generatedMaster && !rejected.includes(generatedMaster) ? "awaiting_image_review"
      : decision === "ai" ? "awaiting_ai_generation"
      : decision === "capture" ? "awaiting_operator_upload"
      : candidate || candidateAssets.length ? "candidate_unverified" : "missing";
    const musicOnlyLastSeconds = Number(raw?.music_only_last_seconds || 0);
    if (!Number.isFinite(musicOnlyLastSeconds) || !Number.isInteger(musicOnlyLastSeconds)
      || musicOnlyLastSeconds < 0 || musicOnlyLastSeconds > (+match[2] - +match[1])) {
      throw new TypeError("Music-only scene hold must fit within its scene timing");
    }
    return {
      n: index + 1, time, visual, media,
      voiceover: trim(raw?.voiceover, 380),
      scene_label: trim(raw?.scene_label, 90),
      on_screen_text: trim(raw?.on_screen_text, 280),
      on_screen_text_instagram: trim(raw?.on_screen_text_instagram, 280),
      voiceover_instagram: trim(raw?.voiceover_instagram, 380),
      music_only_last_seconds: musicOnlyLastSeconds,
      decision, state,
      candidate_asset_id: candidate || null, candidate_assets: candidateAssets,
      assigned_asset_id: assigned || null, selected_approved: approved,
      media_override: Boolean(raw?.media_override),
      generated_master_id: generatedMaster && !rejected.includes(generatedMaster) ? generatedMaster : null,
      accepted_generated_master_id: acceptedMaster || null,
      selected_origin: approved && raw?.selected_origin === "ai" ? "ai" : null,
      rejected_ai_ids: rejected,
      ai_prompt: trim(raw?.ai_prompt, 850) || visual,
      capture_note: trim(raw?.capture_note, 450),
    };
  });
  if (priorEnd !== seconds) throw new TypeError("Last scene must end at the requested duration");
  return {
    schema: STORY_FIRST_SCHEMA, profile_id: owner, target_seconds: seconds,
    status: scenes.every(scene => scene.state === "media_approved") ? "media_complete" : "awaiting_shots",
    publications_blocked: true, scenes,
  };
}

/** Airtable fields are supplied by the Worker; a browser-reported confidence is never evidence. */
export function validateStoryFirstSelectedMedia(story, assets) {
  const problems = [];
  for (const [index, scene] of (story?.scenes || []).entries()) {
    if (!scene.assigned_asset_id) continue;
    const asset = assets.get(scene.assigned_asset_id);
    if (!asset) { problems.push("Scene " + (index + 1) + ": selected asset not found"); continue; }
    const fields = asset.fields || {};
    const owners = Array.isArray(fields.Content_Profile) ? fields.Content_Profile : [];
    if (!owners.includes(story.profile_id)) problems.push("Scene " + (index + 1) + ": media belongs to a different profile");
    const rights = String(fields.Rights_Status || "").toLowerCase();
    if (!["owned", "licensed", "public domain", "cleared"].includes(rights) || fields.Do_Not_Use === true) {
      problems.push("Scene " + (index + 1) + ": media rights are not cleared");
    }
    if (!["available", "ready"].includes(String(fields.Asset_Status || "").toLowerCase())) {
      problems.push("Scene " + (index + 1) + ": media is not available");
    }
    if (!String(fields["Google Drive File ID"] || "").trim()) {
      problems.push("Scene " + (index + 1) + ": Drive master is missing");
    }
    const isVideo = String(fields.MIME_Type || "").toLowerCase().startsWith("video/")
      || String(fields.Media_Class || "").toLowerCase() === "video";
    if (scene.media === "clip" && !isVideo && !scene.media_override) {
      problems.push("Scene " + (index + 1) + ": a video clip is required");
    }
    if (scene.media === "still" && isVideo && !scene.media_override) {
      problems.push("Scene " + (index + 1) + ": a still image is required");
    }
  }
  return { ok: problems.length === 0, problems };
}

export function upsertStoryFirstNotes(notes, story, profileId = "") {
  const validated = normalizeStoryFirst(story, profileId);
  const retained = String(notes || "").split(/\r?\n/)
    .filter(line => !/^\s*\[story-first\.1\]\s*/.test(line))
    .filter(line => line.trim());
  if (!retained.some(line => /^ez-photo-wait=off$/i.test(line.trim()))) retained.unshift("ez-photo-wait=off");
  const next = [...retained, STORY_FIRST_PREFIX + JSON.stringify(validated)].join("\n");
  if (next.length > 9800) throw new RangeError("Storyboard is too large for Idea notes");
  return next;
}

export function storyFirstShotChecklist(story) {
  return (story?.scenes || []).map((row, index) => {
    const candidate = row.candidate_asset_id ? "Candidate only (needs visual review)" : "No suitable asset selected";
    const mode = row.decision === "ai" ? "Generate AI still on request"
      : row.decision === "capture" ? "Capture or upload original media"
      : row.decision === "library" ? "Review matching library media" : "Choose AI, library or capture";
    return (index + 1) + ". " + row.time + " — " + row.visual + " | " + candidate + " | " + mode;
  }).join("\n");
}

export function storyFirstReadiness(story) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes : [];
  const unresolved = scenes.map((scene, index) =>
    scene?.state === "media_approved" && RECORD_ID.test(scene?.assigned_asset_id || "") ? null : index + 1
  ).filter(Boolean);
  return { ready: scenes.length > 0 && !unresolved.length, unresolved,
    selected_count: scenes.length - unresolved.length,
    candidate_count: scenes.filter(row => Boolean(row.candidate_asset_id || row.candidate_assets?.length)).length };
}
