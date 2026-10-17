export const VISUAL_SCRIPT_SCHEMA_VERSION = "studio.visual-script.1";
export const VISUAL_SCRIPT_HISTORY_LIMIT = 12;
export const VISUAL_SCRIPT_WORDS_PER_MINUTE = 150;

export function visualScriptEnabled(env = {}) {
  return bool(env?.STUDIO_VISUAL_SCRIPT_V1, false);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback = false) {
  if (value === true || value === false) return value;
  const text = clean(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function sceneId(value, index = 0) {
  return clean(
    value?.scene_id
    ?? value?.sceneId
    ?? value?.id
    ?? value?.slideRecordId
    ?? value?.slide_record_id
    ?? value?.asset_id
    ?? value?.assetId
  ) || `scene-${index + 1}`;
}

function voiceMode(value, fallback = "narrated") {
  const text = clean(value).toLowerCase();
  return ["silent", "no voiceover", "no_voiceover", "off", "none"].includes(text)
    ? "silent"
    : (text ? "narrated" : fallback);
}

function stableScriptScene(scene) {
  return {
    scene_id: scene.scene_id,
    voiceover_mode: scene.voiceover_mode,
    narration_locked: Boolean(scene.narration_locked),
    narration_text: clean(scene.narration_text),
  };
}

export function visualScriptHash(scenes = []) {
  const text = JSON.stringify((Array.isArray(scenes) ? scenes : []).map(stableScriptScene));
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `vs1-${hash.toString(16).padStart(16, "0")}`;
}

export function estimateNarrationSeconds(text, wordsPerMinute = VISUAL_SCRIPT_WORDS_PER_MINUTE) {
  const words = clean(text).split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  return Math.round((words / Math.max(60, finite(wordsPerMinute, VISUAL_SCRIPT_WORDS_PER_MINUTE))) * 60 * 1000) / 1000;
}

export function maxWordsForVisualDuration(durationMs, wordsPerMinute = VISUAL_SCRIPT_WORDS_PER_MINUTE) {
  const seconds = Math.max(0, finite(durationMs, 0) / 1000);
  // Leave a modest safety margin for punctuation, natural pauses and TTS variance.
  return Math.max(1, Math.floor((seconds * Math.max(60, finite(wordsPerMinute, VISUAL_SCRIPT_WORDS_PER_MINUTE)) / 60) * 0.86));
}

export function fitNarrationToVisual(text, durationMs, wordsPerMinute = VISUAL_SCRIPT_WORDS_PER_MINUTE) {
  const original = clean(text);
  if (!original) return "";
  const maxWords = maxWordsForVisualDuration(durationMs, wordsPerMinute);
  const words = original.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return original;

  const candidates = original.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  let fitted = "";
  for (const sentence of candidates) {
    const next = clean([fitted, sentence].filter(Boolean).join(" "));
    if (next.split(/\s+/).filter(Boolean).length > maxWords) break;
    fitted = next;
  }
  if (fitted) return fitted;
  const clipped = words.slice(0, maxWords).join(" ").replace(/[,:;\-]+$/, "");
  return clipped ? `${clipped.replace(/[.!?]+$/, "")}.` : "";
}

function scriptSceneFrom(slide = {}, visualScene = {}, index = 0, previousScene = null) {
  const id = sceneId(visualScene, index) || sceneId(slide, index);
  const mode = voiceMode(
    visualScene?.voiceover_mode
    ?? slide?.voiceover_mode
    ?? (slide?.voiceover?.enabled === false ? "silent" : "narrated")
  );
  const priorText = clean(previousScene?.narration_text);
  const slideText = clean(
    slide?.narration_text
    ?? slide?.voiceover_text
    ?? slide?.voiceover?.text
  );
  const durationMs = Math.max(1, Math.round(finite(
    visualScene?.duration_ms
    ?? slide?.duration_ms
    ?? finite(slide?.duration_seconds, 0) * 1000,
    4000
  )));
  return {
    scene_id: id,
    ordinal: index + 1,
    voiceover_mode: mode,
    narration_locked: bool(
      previousScene?.narration_locked
      ?? slide?.narration_locked
      ?? visualScene?.narration_locked,
      false
    ),
    narration_text: mode === "silent" ? "" : (priorText || slideText),
    duration_ms: durationMs,
    max_words: maxWordsForVisualDuration(durationMs),
  };
}

export function buildVisualScriptState(slides = [], visualTimeline = null, {
  previousState = null,
} = {}) {
  const baseSlides = Array.isArray(slides) ? slides : [];
  const visualScenes = Array.isArray(visualTimeline?.scenes) && visualTimeline.scenes.length
    ? visualTimeline.scenes.filter((scene) => scene?.include !== false)
    : baseSlides;
  const slideById = new Map(baseSlides.map((slide, index) => [sceneId(slide, index), slide]));
  const previousById = new Map(
    (Array.isArray(previousState?.scenes) ? previousState.scenes : [])
      .map((scene, index) => [sceneId(scene, index), scene])
  );
  const scenes = visualScenes.map((visualScene, index) => {
    const id = sceneId(visualScene, index);
    const slide = slideById.get(id) || baseSlides[index] || {};
    return scriptSceneFrom(slide, visualScene, index, previousById.get(id) || null);
  });
  const hash = visualScriptHash(scenes);
  const priorRevision = Math.max(0, Math.round(finite(previousState?.revision, 0)));
  const priorHash = clean(previousState?.script_hash ?? previousState?.scriptHash);
  const revision = priorHash && priorHash === hash
    ? Math.max(1, priorRevision)
    : Math.max(1, priorRevision + 1);
  return {
    schema_version: VISUAL_SCRIPT_SCHEMA_VERSION,
    revision,
    script_hash: hash,
    visual_revision: Math.max(0, Math.round(finite(visualTimeline?.revision, 0))),
    visual_sequence_hash: clean(visualTimeline?.sequence_hash ?? visualTimeline?.sequenceHash),
    scenes,
    history: Array.isArray(previousState?.history) ? previousState.history.slice(-VISUAL_SCRIPT_HISTORY_LIMIT) : [],
  };
}

function generatedTextFor(generated, scene, index) {
  if (generated instanceof Map) return clean(generated.get(scene.scene_id) ?? generated.get(String(index + 1)));
  if (Array.isArray(generated)) {
    const exact = generated.find((row, offset) => sceneId(row, offset) === scene.scene_id);
    return clean(
      exact?.proposed_text
      ?? exact?.narration_text
      ?? exact?.voiceover_text
      ?? exact?.text
      ?? generated[index]?.proposed_text
      ?? generated[index]?.narration_text
      ?? generated[index]?.voiceover_text
      ?? generated[index]?.text
    );
  }
  if (generated && typeof generated === "object") {
    const exact = generated[scene.scene_id] ?? generated[String(index + 1)];
    return clean(exact?.proposed_text ?? exact?.narration_text ?? exact?.voiceover_text ?? exact?.text ?? exact);
  }
  return "";
}

export function buildVisualScriptProposal(currentState, visualTimeline, generated = null, {
  mode = "all",
  selectedSceneIds = [],
  locks = {},
  source = "fallback",
} = {}) {
  const current = currentState && typeof currentState === "object" ? currentState : { scenes: [] };
  const selected = new Set((Array.isArray(selectedSceneIds) ? selectedSceneIds : []).map(clean).filter(Boolean));
  const selectedMode = clean(mode).toLowerCase() === "selected";
  const visualById = new Map(
    (Array.isArray(visualTimeline?.scenes) ? visualTimeline.scenes : [])
      .map((scene, index) => [sceneId(scene, index), scene])
  );

  const scenes = (Array.isArray(current.scenes) ? current.scenes : []).map((scene, index) => {
    const id = sceneId(scene, index);
    const visual = visualById.get(id) || {};
    const durationMs = Math.max(1, Math.round(finite(visual.duration_ms ?? scene.duration_ms, 4000)));
    const modeValue = voiceMode(visual.voiceover_mode ?? scene.voiceover_mode);
    const locked = bool(
      locks?.[id]
      ?? (Array.isArray(locks) ? locks.includes(id) : undefined)
      ?? scene.narration_locked,
      false
    );
    const currentText = modeValue === "silent" ? "" : clean(scene.narration_text);
    const eligible = modeValue !== "silent" && !locked && (!selectedMode || selected.has(id));
    const generatedText = eligible ? generatedTextFor(generated, scene, index) : "";
    const proposedText = modeValue === "silent"
      ? ""
      : locked || (selectedMode && !selected.has(id))
        ? currentText
        : fitNarrationToVisual(generatedText || currentText, durationMs);
    const currentSeconds = estimateNarrationSeconds(currentText);
    const proposedSeconds = estimateNarrationSeconds(proposedText);
    return {
      scene_id: id,
      ordinal: index + 1,
      voiceover_mode: modeValue,
      narration_locked: locked,
      selected: selectedMode ? selected.has(id) : eligible,
      duration_ms: durationMs,
      max_words: maxWordsForVisualDuration(durationMs),
      current_text: currentText,
      proposed_text: proposedText,
      changed: currentText !== proposedText || Boolean(scene.narration_locked) !== locked,
      current_estimated_seconds: currentSeconds,
      proposed_estimated_seconds: proposedSeconds,
      fits_visual: proposedSeconds <= (durationMs / 1000) + 0.05,
      reason: modeValue === "silent"
        ? "silent"
        : locked
          ? "locked"
          : selectedMode && !selected.has(id)
            ? "not_selected"
            : generatedText
              ? "generated"
              : "fitted_fallback",
    };
  });

  const proposedHash = visualScriptHash(scenes.map((scene) => ({
    scene_id: scene.scene_id,
    voiceover_mode: scene.voiceover_mode,
    narration_locked: scene.narration_locked,
    narration_text: scene.proposed_text,
  })));
  return {
    schema_version: VISUAL_SCRIPT_SCHEMA_VERSION,
    proposal_id: `proposal-${Date.now()}-${proposedHash.slice(-8)}`,
    source: clean(source) || "fallback",
    mode: selectedMode ? "selected" : "all",
    selected_scene_ids: [...selected],
    base_script_revision: Math.max(0, Math.round(finite(current.revision, 0))),
    base_script_hash: clean(current.script_hash),
    base_visual_revision: Math.max(0, Math.round(finite(visualTimeline?.revision, 0))),
    base_visual_sequence_hash: clean(visualTimeline?.sequence_hash ?? visualTimeline?.sequenceHash),
    proposed_script_hash: proposedHash,
    scenes,
    changed_scene_ids: scenes.filter((scene) => scene.changed).map((scene) => scene.scene_id),
  };
}

export function assertVisualScriptRevision(expectedRevision, expectedHash, currentState) {
  const currentRevision = Math.max(0, Math.round(finite(currentState?.revision, 0)));
  const currentHash = clean(currentState?.script_hash ?? currentState?.scriptHash);
  if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== "") {
    const expected = Math.max(0, Math.round(finite(expectedRevision, 0)));
    if (expected !== currentRevision) {
      throw new Error(`outdated narration script: expected revision ${expected}, current revision ${currentRevision}`);
    }
  }
  if (expectedHash && clean(expectedHash) !== currentHash) {
    throw new Error("outdated narration script: script hash no longer matches");
  }
  return true;
}

function historySnapshot(state, metadata = {}) {
  return {
    revision: Math.max(0, Math.round(finite(state?.revision, 0))),
    script_hash: clean(state?.script_hash),
    accepted_at: metadata.acceptedAt || state?.accepted_at || null,
    accepted_by: metadata.acceptedBy || state?.accepted_by || null,
    scenes: (Array.isArray(state?.scenes) ? state.scenes : []).map((scene, index) => ({
      scene_id: sceneId(scene, index),
      voiceover_mode: voiceMode(scene.voiceover_mode),
      narration_locked: Boolean(scene.narration_locked),
      narration_text: clean(scene.narration_text),
      duration_ms: Math.max(1, Math.round(finite(scene.duration_ms, 4000))),
    })),
  };
}

export function acceptVisualScriptProposal(currentState, visualTimeline, proposal, {
  acceptedAt = new Date().toISOString(),
  acceptedBy = null,
} = {}) {
  if (!proposal || !Array.isArray(proposal.scenes)) throw new Error("visual script proposal is required");
  assertVisualScriptRevision(proposal.base_script_revision, proposal.base_script_hash, currentState);

  const visualRevision = Math.max(0, Math.round(finite(visualTimeline?.revision, 0)));
  const visualHash = clean(visualTimeline?.sequence_hash ?? visualTimeline?.sequenceHash);
  if (Number(proposal.base_visual_revision ?? visualRevision) !== visualRevision || (
    proposal.base_visual_sequence_hash && clean(proposal.base_visual_sequence_hash) !== visualHash
  )) {
    throw new Error("outdated visual sequence: script proposal no longer matches the visual timeline");
  }

  const currentById = new Map(
    (Array.isArray(currentState?.scenes) ? currentState.scenes : [])
      .map((scene, index) => [sceneId(scene, index), scene])
  );
  const proposalById = new Map(proposal.scenes.map((scene, index) => [sceneId(scene, index), scene]));
  const visualScenes = (Array.isArray(visualTimeline?.scenes) ? visualTimeline.scenes : [])
    .filter((scene) => scene?.include !== false);
  const selectedMode = clean(proposal.mode).toLowerCase() === "selected";
  const selected = new Set(
    (Array.isArray(proposal.selected_scene_ids) ? proposal.selected_scene_ids : [])
      .map(clean)
      .filter(Boolean)
  );

  const scenes = visualScenes.map((visual, index) => {
    const id = sceneId(visual, index);
    const current = currentById.get(id) || {};
    const proposed = proposalById.get(id) || {};
    const mode = voiceMode(visual.voiceover_mode ?? proposed.voiceover_mode ?? current.voiceover_mode);
    const locked = bool(proposed.narration_locked ?? current.narration_locked, false);
    return {
      scene_id: id,
      ordinal: index + 1,
      voiceover_mode: mode,
      narration_locked: locked,
      narration_text: mode === "silent"
        ? ""
        : (locked || (selectedMode && !selected.has(id)))
          ? clean(current.narration_text)
          : clean(proposed.proposed_text ?? proposed.narration_text ?? current.narration_text),
      duration_ms: Math.max(1, Math.round(finite(visual.duration_ms ?? current.duration_ms, 4000))),
      max_words: maxWordsForVisualDuration(visual.duration_ms ?? current.duration_ms ?? 4000),
    };
  });
  for (const scene of scenes) {
    if (scene.voiceover_mode === "silent" || !scene.narration_text) continue;
    const estimated = estimateNarrationSeconds(scene.narration_text);
    const available = Number(scene.duration_ms || 0) / 1000;
    if (estimated > available + 0.05) {
      throw new Error(
        `Narration for scene ${scene.scene_id} exceeds its visual duration (${estimated.toFixed(2)}s > ${available.toFixed(2)}s)`
      );
    }
  }

  const hash = visualScriptHash(scenes);
  const currentHash = clean(currentState?.script_hash);
  const changed = hash !== currentHash;
  const previousHistory = Array.isArray(currentState?.history) ? currentState.history : [];
  const history = changed
    ? [...previousHistory, historySnapshot(currentState)].slice(-VISUAL_SCRIPT_HISTORY_LIMIT)
    : previousHistory.slice(-VISUAL_SCRIPT_HISTORY_LIMIT);

  return {
    schema_version: VISUAL_SCRIPT_SCHEMA_VERSION,
    revision: changed
      ? Math.max(1, Math.round(finite(currentState?.revision, 0)) + 1)
      : Math.max(1, Math.round(finite(currentState?.revision, 1))),
    script_hash: hash,
    visual_revision: visualRevision,
    visual_sequence_hash: visualHash,
    accepted_at: acceptedAt,
    accepted_by: acceptedBy,
    scenes,
    history,
  };
}

export function visualScriptChangedSceneIds(beforeState, afterState) {
  const before = new Map(
    (Array.isArray(beforeState?.scenes) ? beforeState.scenes : [])
      .map((scene, index) => [sceneId(scene, index), stableScriptScene(scene)])
  );
  return (Array.isArray(afterState?.scenes) ? afterState.scenes : [])
    .filter((scene, index) => {
      const id = sceneId(scene, index);
      return JSON.stringify(before.get(id) || null) !== JSON.stringify(stableScriptScene(scene));
    })
    .map((scene, index) => sceneId(scene, index));
}

export function applyVisualScriptToSlides(slides = [], scriptState = null) {
  if (!scriptState || !Array.isArray(scriptState.scenes)) return Array.isArray(slides) ? slides : [];
  const byId = new Map(scriptState.scenes.map((scene, index) => [sceneId(scene, index), scene]));
  return (Array.isArray(slides) ? slides : []).map((slide, index) => {
    const id = sceneId(slide, index);
    const scene = byId.get(id);
    if (!scene) return slide;
    const silent = voiceMode(scene.voiceover_mode) === "silent";
    return {
      ...slide,
      scene_id: id,
      voiceover_mode: silent ? "silent" : "narrated",
      narration_locked: Boolean(scene.narration_locked),
      narration_text: silent ? "" : clean(scene.narration_text),
      voiceover: {
        ...(slide.voiceover || {}),
        enabled: !silent,
        text: silent ? "" : clean(scene.narration_text),
      },
    };
  });
}
