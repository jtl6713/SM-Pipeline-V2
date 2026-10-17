import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Phase 1 visual timeline is feature gated and persisted through the existing creative authority", async () => {
  const worker = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");

  assert.match(worker, /from "\.\/visual-timeline\.mjs"/);
  assert.match(worker, /visualTimelineEnabled\(env\)/);
  assert.match(worker, /settings\.visual_timeline/);
  assert.match(worker, /applyVisualTimelineToSlides/);
  assert.match(worker, /assertVisualTimelineRevision/);
  assert.match(worker, /throw new HttpError\(\s*409,\s*error instanceof Error \? error\.message : "outdated visual sequence"/s);
  assert.match(worker, /Visual timeline editing is not enabled for this environment/);
  assert.match(worker, /visual_timeline_saved: Boolean\(nextVisualTimeline\)/);
  assert.match(worker, /render\/TTS were not started/);
});

test("preview render consumes authoritative visual duration, silent VO mode, and clip in-point only when gated on", async () => {
  const worker = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");

  assert.match(worker, /const visualTimelineOn = phase6VisualTimelineEnabledForOutput\(env, outputRecord\)/);
  assert.match(worker, /const durationFrames = visualTimelineOn \? requestedFrames/);
  assert.match(worker, /Studio will not silently change the visual timing/);
  assert.match(worker, /startFromSeconds: Math\.max\(0, Number\(slide\.source_in_ms\) \/ 1000\)/);
  assert.match(worker, /voiceoverMode: clip\.voiceover\?\.enabled === false \? "silent" : "narrated"/);
  assert.match(worker, /sequenceHash: visualTimeline\.sequence_hash/);
});

test("Remotion already supports source video start offsets and scene-scoped voiceover gaps", async () => {
  const renderer = await readFile(
    path.join(here, "../../services/remotion-renderer/src/ChicagoShiningPhotoSequence.tsx"),
    "utf8",
  );

  assert.match(renderer, /startFrom=\{clipStartFromFrames\(clip, fps\)\}/);
  assert.match(renderer, /clip\.voiceover\?\.enabled !== false && voiceSource/);
  assert.match(renderer, /sceneVoiceoverAuthority !== true/);
  assert.match(renderer, /keepSourceAudio/);
  assert.match(renderer, /forceMuted/);
  assert.match(renderer, /!forceMuted && \(Boolean\(clip\.keepSourceAudio\) \|\| clip\.muted === false\)/);
});


test("visual timeline edits cannot race an active render", async () => {
  const worker = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  assert.match(worker, /timelineMutationRequested && String\(f\(existingOutput, "Render_Status"\)/);
  assert.match(worker, /Wait until it finishes before changing the visual timeline/);
});


test("production visual flags fail closed to Do_Not_Publish canaries", async () => {
  const worker = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  assert.match(worker, /if \(!Boolean\(f\(outputRecord, "Do_Not_Publish"\)\)\) return false/);
  assert.match(worker, /STUDIO_VISUAL_CANARY_OUTPUT_IDS/);
  assert.match(worker, /if \(!allowlist\.length\) return true/);
  assert.match(worker, /allowlist\.includes\(outputId\)/);
  assert.match(worker, /visual_timeline_v1: visualTimelineOn/);
});
