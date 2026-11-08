/**
 * Story-first scene content guards.
 * Required visual must be a shootable scene description.
 * Voiceover must be spoken narration.
 * Conversational AI planning text, library-sourcing instructions, and whole-brief
 * dumps must never populate storyboard fields.
 */

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const META_VOICEOVER = [
  /\byou still need (a |an |the )?(photo|image|clip|shot|asset|media)\b/i,
  /\bsave .{3,120} for last\b/i,
  /\bthis beat of\b/i,
  /\bnot in the library yet\b/i,
  /\bassign media\b/i,
  /\bchoose (a |an )?(library|source|asset)\b/i,
  /\bmedia[- ]sourc/i,
  /\b(please )?(select|pick|find) (a |an |the )?(photo|clip|asset|image)\b/i,
  /\bhere(?:'s| is) (a |an )?(concept|plan|overview|storyboard)\b/i,
  /\bas an ai\b/i,
];

const META_VISUAL = [
  /\bthat is not in the library yet\b/i,
  /\bclose detail that proves the point of\b/i,
  /\bhero frame of .{3,200} with clean space for a title\b/i,
  /\bvertical frame of .{40,}\b/i,
  /\b(overall|general) (concept|idea|theme)\b/i,
  /\bconcept description\b/i,
  /\bmedia[- ]sourc(?:e|ing)\b/i,
  /\byou should (?:film|shoot|capture|find|search)\b/i,
  /^(?:sure[,!]?\s+|here(?:'s| is)\s+|i(?:'d| would)\s+|let me\s+|as an ai\b)/i,
];

function tokenSet(text) {
  return new Set(
    compact(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );
}

function overlapRatio(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const token of left) if (right.has(token)) hit += 1;
  return hit / Math.min(left.size, right.size);
}

/** Preferred media from a concrete shot description — never from a concept essay. */
export function inferStoryboardPreferredMedia(visual) {
  const text = compact(visual);
  if (!text || text.length > 220) return "still_or_clip";
  if (/\b(video clip|real (?:video|footage)|moving (?:shot|footage)|timelapse|time[- ]lapse|drone (?:flight|shot)|train passing|clip of)\b/i.test(text)) {
    return "clip";
  }
  if (/\b(still (?:image|photo)|photograph|static frame|single frame)\b/i.test(text)) {
    return "still";
  }
  return "still_or_clip";
}

/** Reject planning / library-sourcing corruption without enforcing creative length floors. */
export function storyboardSceneCorruptionErrors(scenes, { brief = "" } = {}) {
  const rows = Array.isArray(scenes) ? scenes : [];
  const errors = [];
  const briefText = compact(brief);
  for (const [index, raw] of rows.entries()) {
    const n = index + 1;
    const visual = compact(raw?.suggested_visual || raw?.visual || "");
    const voice = compact(raw?.voiceover_text || raw?.voiceover || "");
    for (const pattern of META_VISUAL) {
      if (pattern.test(visual)) {
        errors.push(`Scene ${n}: Required visual contains planning or library-sourcing language instead of a scene shot.`);
        break;
      }
    }
    for (const pattern of META_VOICEOVER) {
      if (pattern.test(voice)) {
        errors.push(`Scene ${n}: Voiceover contains media-selection or planning instructions instead of narration.`);
        break;
      }
    }
    if (briefText.length >= 40 && visual.length >= 40 && overlapRatio(visual, briefText) >= 0.72) {
      errors.push(`Scene ${n}: Required visual repeats the creative brief instead of a scene-specific shot.`);
    }
    if (briefText.length >= 40 && voice.length >= 40 && overlapRatio(voice, briefText) >= 0.72) {
      errors.push(`Scene ${n}: Voiceover repeats the creative brief instead of spoken narration.`);
    }
    if (visual && voice && overlapRatio(visual, voice) >= 0.9 && visual.length > 40) {
      errors.push(`Scene ${n}: Visual and voiceover are the same text; fields must stay distinct.`);
    }
  }
  return [...new Set(errors)];
}

/**
 * Full creative-authoring gate used by Script a Short propose.
 * Empty array means the scenes are structurally usable for story-first authoring.
 */
export function storyboardSceneContentErrors(scenes, { brief = "" } = {}) {
  const rows = Array.isArray(scenes) ? scenes : [];
  const errors = [...storyboardSceneCorruptionErrors(rows, { brief })];
  if (rows.length < 2) errors.push("Storyboard needs at least two scenes with visual and narration.");
  const visuals = new Set();
  const voices = new Set();
  for (const [index, raw] of rows.entries()) {
    const n = index + 1;
    const visual = compact(raw?.suggested_visual || raw?.visual || "");
    const voice = compact(raw?.voiceover_text || raw?.voiceover || "");
    if (visual.length < 12) errors.push(`Scene ${n}: Required visual must describe a specific shot.`);
    if (voice.length < 8) errors.push(`Scene ${n}: Voiceover must be spoken narration.`);
    const visualKey = visual.toLowerCase();
    const voiceKey = voice.toLowerCase();
    if (visualKey && visuals.has(visualKey)) errors.push(`Scene ${n}: Required visual duplicates an earlier scene.`);
    if (voiceKey && voices.has(voiceKey)) errors.push(`Scene ${n}: Voiceover duplicates an earlier scene.`);
    if (visualKey) visuals.add(visualKey);
    if (voiceKey) voices.add(voiceKey);
  }
  return [...new Set(errors)];
}

export function assertStoryboardSceneContent(scenes, options = {}) {
  const mode = options.mode === "persist" ? "persist" : "propose";
  const errors = mode === "persist"
    ? storyboardSceneCorruptionErrors(scenes, options)
    : storyboardSceneContentErrors(scenes, options);
  if (errors.length) {
    const err = new Error(errors.join(" "));
    err.code = "STORYBOARD_SCENE_CONTENT_INVALID";
    err.errors = errors;
    throw err;
  }
  return true;
}

/** Keep valid operator scenes; replace only malformed ones from a fresh proposal. */
export function mergeStoryboardScenesPreservingValid(previousScenes, nextScenes, { brief = "" } = {}) {
  const previous = Array.isArray(previousScenes) ? previousScenes : [];
  const next = Array.isArray(nextScenes) ? nextScenes : [];
  return next.map((scene, index) => {
    const prior = previous[index];
    if (!prior) return scene;
    const priorErrors = storyboardSceneCorruptionErrors([prior], { brief });
    const visual = compact(prior.visual || prior.suggested_visual);
    const voice = compact(prior.voiceover || prior.voiceover_text);
    const hasApproval = prior.selected_approved === true && /^rec[A-Za-z0-9]+$/.test(String(prior.assigned_asset_id || ""));
    const operatorEdited = Boolean(visual && voice)
      && (hasApproval || prior.decision === "library" || prior.decision === "ai" || prior.decision === "capture"
        || prior.media_override === true);
    if (!priorErrors.length && visual.length >= 5 && voice.length >= 5 && (hasApproval || operatorEdited)) {
      return {
        ...prior,
        n: index + 1,
        time: scene.time || prior.time,
      };
    }
    return scene;
  });
}

/** Exact corrupt fallback pattern that previously populated Script a Short. */
export function corruptFallbackProposalFixture(prompt) {
  const title = compact(prompt) || "This place";
  return [
    {
      voiceover_text: `You still need a photo for this beat of ${title}.`,
      suggested_visual: `Vertical frame of ${title} that is not in the library yet.`,
    },
    {
      voiceover_text: `You still need a photo for this beat of ${title}.`,
      suggested_visual: `Close detail that proves the point of ${title}.`,
    },
    {
      voiceover_text: `Save ${title} for last.`,
      suggested_visual: `Hero frame of ${title} with clean space for a title.`,
    },
  ];
}
