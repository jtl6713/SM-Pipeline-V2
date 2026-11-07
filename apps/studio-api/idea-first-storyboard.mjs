/**
 * Story-first short intake state. Airtable Ideas are authoritative.
 * This is not production authorization or proof of a valid media match.
 */
export const STORY_FIRST_SCHEMA = "story-first.1";
export const STORY_FIRST_PREFIX = "[story-first.1] ";
const RECORD_ID = /^rec[A-Za-z0-9]+$/;
const DECISIONS = new Set(["unassigned", "library", "ai", "capture"]);
const trim = (value, max = 800) => String(value == null ? "" : value).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);

function legacyDecision(choice, state) {
  if (state === "candidate_unverified" || choice === "review_or_replace" || choice === "review_or_capture") return "library";
  if (choice === "capture_preferred") return "capture";
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

/** A visual requirement belongs to the story, not to whatever media matched. */
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
  const seconds = Number(input.target_seconds || 30);
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 180) throw new TypeError("Short duration must be 5–180 seconds");
  const scenes = input.scenes.map((raw, index) => {
    const visual = trim(raw?.visual || raw?.suggested_visual, 340);
    if (visual.length < 5) throw new TypeError("Every scene needs a specific visual requirement");
    const explicit = trim(raw?.decision, 32);
    const decision = DECISIONS.has(explicit) ? explicit : legacyDecision(trim(raw?.choice), trim(raw?.state));
    const candidate = trim(raw?.candidate_asset_id, 64);
    const assigned = trim(raw?.assigned_asset_id, 64);
    if (candidate && !RECORD_ID.test(candidate)) throw new TypeError("Invalid scene candidate asset");
    if (assigned && !RECORD_ID.test(assigned)) throw new TypeError("Invalid selected scene asset");
    const defaultFrom = Math.round(index * seconds / input.scenes.length);
    const defaultTo = Math.round((index + 1) * seconds / input.scenes.length);
    const state = assigned ? "needs_media_review"
      : decision === "ai" ? "awaiting_ai_generation"
      : decision === "capture" ? "awaiting_operator_upload"
      : candidate ? "candidate_unverified" : "missing";
    return {
      n: index + 1,
      time: trim(raw?.time, 24) || (defaultFrom + "-" + defaultTo),
      visual,
      media: trim(raw?.media, 32) || "still_or_clip",
      voiceover: trim(raw?.voiceover, 380),
      decision,
      state,
      candidate_asset_id: candidate || null,
      assigned_asset_id: assigned || null,
      ai_prompt: trim(raw?.ai_prompt, 850) || visual,
      capture_note: trim(raw?.capture_note, 450),
    };
  });
  return {
    schema: STORY_FIRST_SCHEMA,
    profile_id: owner,
    status: "awaiting_shots",
    target_seconds: seconds,
    publications_blocked: true,
    scenes,
  };
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
  const scenes = story?.scenes || [];
  return scenes.map((row, index) => {
    const candidate = row.candidate_asset_id ? "Candidate only (needs visual review)" : "No suitable asset selected";
    const mode = row.decision === "ai" ? "Generate AI still on request"
      : row.decision === "capture" ? "Capture or upload original media"
      : row.decision === "library" ? "Review matching library media"
      : "Choose AI, library or capture";
    return (index + 1) + ". " + row.time + " — " + row.visual + " | " + candidate + " | " + mode;
  }).join("\n");
}

/** Render/schedule gates remain closed. An Idea preference is not an asset. */
export function storyFirstReadiness(story) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes : [];
  const unresolved = scenes.map((scene, index) => {
    if (scene?.state === "media_approved" && RECORD_ID.test(scene?.assigned_asset_id || "")) return null;
    return index + 1;
  }).filter(Boolean);
  return { ready: false, unresolved, candidate_count: scenes.filter(row => Boolean(row.candidate_asset_id)).length };
}
