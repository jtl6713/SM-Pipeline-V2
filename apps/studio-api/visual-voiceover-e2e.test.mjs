import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVisualTimelineToSlides,
  buildVisualTimeline,
} from "./visual-timeline.mjs";
import {
  acceptVisualScriptProposal,
  applyVisualScriptToSlides,
  buildVisualScriptProposal,
  buildVisualScriptState,
  visualScriptChangedSceneIds,
} from "./visual-script.mjs";

function fixtureTimeline(previousTimeline = null, trim = { source_in_ms: 2000, source_out_ms: 7000 }) {
  return buildVisualTimeline([
    { id: "intro", duration_ms: 1500, voiceover_mode: "silent" },
    {
      id: "walk",
      media_type: "video/mp4",
      source_duration_ms: 20000,
      ...trim,
      trim_user_set: true,
      voiceover_mode: "narrated",
      native_audio_mode: "mute",
    },
    { id: "gap", duration_ms: 1200, voiceover_mode: "silent" },
    { id: "detail", duration_ms: 3000, voiceover_mode: "narrated", narration_locked: true },
    { id: "outro", duration_ms: 1000, voiceover_mode: "silent" },
  ], { previousTimeline });
}

const baseSlides = [
  { id: "intro", duration_seconds: 1.5, voiceover: { enabled: false, text: "must never speak" } },
  {
    id: "walk",
    media_type: "video/mp4",
    source_duration_seconds: 20,
    duration_seconds: 5,
    voiceover: { enabled: true, text: "Walk narration stays here." },
  },
  { id: "gap", duration_seconds: 1.2, voiceover: { enabled: false, text: "old gap words" } },
  {
    id: "detail",
    duration_seconds: 3,
    narration_locked: true,
    voiceover: { enabled: true, text: "Locked detail narration." },
  },
  { id: "outro", duration_seconds: 1, voiceover: { enabled: false, text: "old outro words" } },
];

test("visual voiceover acceptance preserves trims, gaps, locks, and selective audio reuse", () => {
  const timeline = fixtureTimeline();
  const visualSlides = applyVisualTimelineToSlides(baseSlides, timeline);
  const current = buildVisualScriptState(visualSlides, timeline);
  current.scenes.find((scene) => scene.scene_id === "detail").narration_locked = true;

  const proposal = buildVisualScriptProposal(current, timeline, {
    walk: "Fresh walking narration.",
    detail: "Generated text that must not replace the locked scene.",
  }, {
    mode: "selected",
    selectedSceneIds: ["walk", "detail"],
  });

  const accepted = acceptVisualScriptProposal(current, timeline, proposal);
  const renderedSlides = applyVisualScriptToSlides(visualSlides, accepted);

  assert.deepEqual(timeline.ordered_scene_ids, ["intro", "walk", "gap", "detail", "outro"]);
  assert.deepEqual(timeline.voiceover_intervals.map((row) => row.scene_id), ["walk", "detail"]);
  assert.equal(timeline.scenes[1].source_in_ms, 2000);
  assert.equal(timeline.scenes[1].source_out_ms, 7000);
  assert.equal(timeline.scenes[1].duration_ms, 5000);
  assert.equal(timeline.scenes[1].native_audio_mode, "mute");

  assert.equal(renderedSlides[0].voiceover.enabled, false);
  assert.equal(renderedSlides[2].voiceover.enabled, false);
  assert.equal(renderedSlides[4].voiceover.enabled, false);
  assert.equal(renderedSlides[1].voiceover.text, "Fresh walking narration.");
  assert.equal(renderedSlides[3].voiceover.text, "Locked detail narration.");
  assert.deepEqual(visualScriptChangedSceneIds(current, accepted), ["walk"]);
});

test("a trim move makes an older narration proposal stale before acceptance", () => {
  const timeline = fixtureTimeline();
  const slides = applyVisualTimelineToSlides(baseSlides, timeline);
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { walk: "Proposed before trim move." });

  const moved = fixtureTimeline(timeline, { source_in_ms: 5000, source_out_ms: 10000 });
  assert.equal(moved.revision, timeline.revision + 1);
  assert.notEqual(moved.sequence_hash, timeline.sequence_hash);
  assert.throws(
    () => acceptVisualScriptProposal(current, moved, proposal),
    /outdated visual sequence/,
  );
});

test("narration can be regenerated safely after a trim move using the new visual revision", () => {
  const timeline = fixtureTimeline();
  const moved = fixtureTimeline(timeline, { source_in_ms: 5000, source_out_ms: 10000 });
  const movedSlides = applyVisualTimelineToSlides(baseSlides, moved);
  const current = buildVisualScriptState(movedSlides, moved);
  const proposal = buildVisualScriptProposal(current, moved, {
    walk: "New narration for the moved five second range.",
  }, {
    mode: "selected",
    selectedSceneIds: ["walk"],
  });
  const accepted = acceptVisualScriptProposal(current, moved, proposal);
  assert.equal(accepted.visual_revision, moved.revision);
  assert.equal(accepted.visual_sequence_hash, moved.sequence_hash);
  assert.equal(accepted.scenes.find((scene) => scene.scene_id === "walk").narration_text,
    "New narration for the moved five second range.");
});
