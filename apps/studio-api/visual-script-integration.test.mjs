import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");

test("visual script is independently gated and exposed separately from the visual timeline", () => {
  assert.match(worker, /visualScriptEnabled/);
  assert.match(worker, /visual_script_v1:\s*visualScriptOn/);
  assert.match(worker, /phase6VisualScriptEnabledForOutput\(env, outputRecord\)/);
});

test("script actions are blocked outside creative review", () => {
  assert.match(worker, /function phase6AssertVisualScriptReviewAllowed/);
  assert.match(worker, /Narration can be revised only before publishing approval/);
  assert.match(worker, /Narration can be revised only while this output is in creative review/);
  assert.match(worker, /phase6AssertVisualScriptReviewAllowed\(outputRecord\)/);
});

test("proposal is review-only and accept does not start TTS or render", () => {
  assert.match(worker, /visual_script_action: "proposal"/);
  assert.match(worker, /nothing has been saved or rendered/);
  assert.match(worker, /visual_script_action: "accepted"/);
  assert.match(worker, /render_started: false/);
  assert.match(worker, /tts_started: false/);
  assert.match(worker, /TTS\/render will start only after an explicit rerender action/);
});

test("accepted narration persists script state and invalidates only changed audio", () => {
  assert.match(worker, /visual_script: acceptedScript/);
  assert.match(worker, /phase6VisualScriptAudioChangedIds/);
  assert.match(worker, /Slide_Voiceover_Status = "Ready"/);
  assert.match(worker, /Slide_Voiceover_URL = null/);
  assert.match(worker, /Slide_Voiceover_Duration_Seconds = null/);
});

test("proposal generation reuses ITS1 and sends exact visual timing context", () => {
  assert.match(worker, /item4PulsePipelineStage\(env, "its1"/);
  assert.match(worker, /source: "studio-visual-aware-script"/);
  assert.match(worker, /duration_seconds:/);
  assert.match(worker, /max_words:/);
  assert.match(worker, /Write only narration that fits this exact visual window/);
});


test("ordinary creative saves cannot erase accepted visual script history", () => {
  assert.match(worker, /visual_script: _clientVisualScript/);
  assert.match(worker, /existingVisualScript/);
  assert.match(worker, /existingVisualScript \? \{ visual_script: existingVisualScript \} : \{\}/);
});


test("preview render manifest carries accepted visual and script revision authority", () => {
  assert.match(worker, /const visualScriptOn = phase6VisualScriptEnabledForOutput\(env, outputRecord\)/);
  assert.match(worker, /visualScript: visualScriptOn && visualScript \? \{/);
  assert.match(worker, /studioRevision: \{/);
  assert.match(worker, /visualRevision:/);
  assert.match(worker, /visualSequenceHash:/);
  assert.match(worker, /scriptRevision:/);
  assert.match(worker, /scriptHash:/);
  assert.match(worker, /sceneId: clip\.sceneId/);
  assert.match(worker, /sourceInMs: clip\.sourceInMs/);
  assert.match(worker, /sourceOutMs: clip\.sourceOutMs/);
  assert.match(worker, /nativeAudioMode: clip\.nativeAudioMode/);
  assert.match(worker, /sceneVoiceoverAuthority: visualTimelineOn/);
});


test("old voice prep cleanup cannot clear a newer request token", () => {
  assert.match(worker, /const currentSlide = await airtableFetch\(env, PHASE6_CAROUSEL_SLIDES_TABLE, slideId\)/);
  assert.match(worker, /Studio_Voice_Prep_Request_ID"\) \|\| ""\)\.trim\(\) !== requestId/);
});


test("voice prep request identity includes the accepted script revision and hash", () => {
  assert.match(worker, /function phase6VoicePrepRevisionIdentity/);
  assert.match(worker, /script\.revision/);
  assert.match(worker, /script\.script_hash \|\| script\.scriptHash/);
  assert.match(worker, /phase6VoicePrepRevisionIdentity\(outputRecord\)/);
  assert.match(worker, /Studio_Voice_Prep_Request_ID: requestId/);
});


test("Studio TTS pulses are exact-slide scoped instead of consuming any global Ready slide", () => {
  assert.match(worker, /const targetSlideId = String\(pending\[0\]\?\.id \|\| ""\)\.trim\(\)/);
  assert.match(worker, /extra: \{ slide_record_id: targetSlideId \}/);
  const exactScopedPulses = worker.match(/extra: \{ slide_record_id: targetSlideId \}/g) || [];
  assert.equal(exactScopedPulses.length, 2);
});

test("production canary accepts normalized snake_case slide durations when finding trimmable video", () => {
  assert.match(worker, /slide\?\.duration_seconds \|\| slide\?\.durationSeconds/);
  assert.match(worker, /sourceMs > durationMs \+ 250/);
});

test("nonpublishing visual timeline saves return the same persisted timeline contract used by production", () => {
  assert.match(worker, /visual_timeline_saved: Boolean\(nextVisualTimeline\)/);
  assert.match(worker, /visual_timeline: nextVisualTimeline \|\| \(/);
  assert.match(worker, /Publishing state was not changed; render\/TTS were not started/);
});

test("Phase 6 render continuation uses exact-target Python R4/R5 pulses instead of retired Make scenarios", () => {
  const start = worker.indexOf("export async function phase6PulseInactiveScenario");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:phase6PulseInactiveScenario__*/", start);
  assert.ok(start >= 0 && end > start);
  const block = worker.slice(start, end);
  assert.match(block, /item4PulseR4Python\(env/);
  assert.match(block, /item4PulseR5Python\(env/);
  assert.match(block, /outputRecordId/);
  assert.match(block, /backend: "python"/);
  assert.doesNotMatch(block, /phase6SetScenarioActive/);
  assert.doesNotMatch(block, /phase6RunScenario/);
});

