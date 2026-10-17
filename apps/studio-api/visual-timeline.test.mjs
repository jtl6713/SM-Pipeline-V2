import test from "node:test";
import assert from "node:assert/strict";
import {
  VISUAL_TIMELINE_VOICEOVER_SILENT,
  applyVisualTimelineToSlides,
  assertVisualTimelineRevision,
  buildVisualTimeline,
  buildVisualTimelineFromSlides,
  normalizeClipTrim,
  visualTimelineSequenceHash,
} from "./visual-timeline.mjs";

test("silent scenes create a true narration gap and narration resumes after it", () => {
  const timeline = buildVisualTimeline([
    { id: "scene-1", duration_ms: 3000, voiceover_mode: "narrated", narration_text: "Open here." },
    { id: "scene-2", duration_ms: 4000, voiceover_mode: "silent", narration_text: "must disappear" },
    { id: "scene-3", duration_ms: 2500, voiceover_mode: "narrated", narration_text: "Continue here." },
  ]);
  assert.equal(timeline.scenes[1].voiceover_mode, VISUAL_TIMELINE_VOICEOVER_SILENT);
  assert.equal(timeline.scenes[1].narration_text, "");
  assert.deepEqual(timeline.voiceover_intervals, [
    { scene_id: "scene-1", start_ms: 0, end_ms: 3000 },
    { scene_id: "scene-3", start_ms: 7000, end_ms: 9500 },
  ]);
});

test("multiple nonadjacent, leading and trailing silent scenes are preserved", () => {
  const timeline = buildVisualTimeline([
    { id: "a", duration_ms: 1000, voiceover_mode: "silent" },
    { id: "b", duration_ms: 1000, voiceover_mode: "narrated", narration_text: "B" },
    { id: "c", duration_ms: 1000, voiceover_mode: "silent" },
    { id: "d", duration_ms: 1000, voiceover_mode: "narrated", narration_text: "D" },
    { id: "e", duration_ms: 1000, voiceover_mode: "silent" },
  ]);
  assert.deepEqual(timeline.voiceover_intervals.map((row) => row.scene_id), ["b", "d"]);
});

test("user-set clip trim is authoritative over configured duration", () => {
  const trim = normalizeClipTrim({
    id: "clip-1",
    media_type: "video/mp4",
    duration_ms: 4000,
    source_duration_ms: 20000,
    source_in_ms: 6500,
    source_out_ms: 12500,
    trim_user_set: true,
  });
  assert.equal(trim.source_in_ms, 6500);
  assert.equal(trim.source_out_ms, 12500);
  assert.equal(trim.effective_duration_ms, 6000);
  assert.equal(trim.trim_user_set, true);
});

test("sliding an entire clip window preserves selected duration", () => {
  const original = normalizeClipTrim({
    media_type: "video",
    source_duration_ms: 30000,
    source_in_ms: 2000,
    source_out_ms: 7000,
    trim_user_set: true,
  });
  const moved = normalizeClipTrim({
    media_type: "video",
    source_duration_ms: 30000,
    source_in_ms: original.source_in_ms + 2000,
    source_out_ms: original.source_out_ms + 2000,
    trim_user_set: true,
  });
  assert.equal(original.effective_duration_ms, 5000);
  assert.equal(moved.effective_duration_ms, 5000);
  assert.deepEqual([moved.source_in_ms, moved.source_out_ms], [4000, 9000]);
});

test("invalid clip bounds are rejected", () => {
  assert.throws(() => normalizeClipTrim({
    media_type: "video",
    source_duration_ms: 10000,
    source_in_ms: -1,
    source_out_ms: 3000,
    trim_user_set: true,
  }), /0 ≤ source_in_ms/);
  assert.throws(() => normalizeClipTrim({
    media_type: "video",
    source_duration_ms: 10000,
    source_in_ms: 9000,
    source_out_ms: 11000,
    trim_user_set: true,
  }), /cannot exceed source duration/);
  assert.throws(() => normalizeClipTrim({
    media_type: "video",
    source_in_ms: 5000,
    source_out_ms: 5000,
    trim_user_set: true,
  }), /source_in_ms < source_out_ms/);
});

test("sequence revision changes only when authoritative scene state changes", () => {
  const first = buildVisualTimeline([
    { id: "a", duration_ms: 3000, voiceover_mode: "narrated", narration_text: "A" },
    { id: "b", duration_ms: 3000, voiceover_mode: "silent" },
  ]);
  const same = buildVisualTimeline(first.scenes, { previousTimeline: first });
  assert.equal(same.revision, first.revision);
  assert.equal(same.sequence_hash, first.sequence_hash);

  const changed = buildVisualTimeline([
    first.scenes[1],
    first.scenes[0],
  ], { previousTimeline: first });
  assert.equal(changed.revision, first.revision + 1);
  assert.notEqual(changed.sequence_hash, first.sequence_hash);
});

test("hash includes mute and trim directives", () => {
  const base = buildVisualTimeline([
    { id: "clip", media_type: "video", source_duration_ms: 10000, source_in_ms: 0, source_out_ms: 4000, trim_user_set: true, voiceover_mode: "narrated" },
  ]);
  const muted = buildVisualTimeline([
    { id: "clip", media_type: "video", source_duration_ms: 10000, source_in_ms: 0, source_out_ms: 4000, trim_user_set: true, voiceover_mode: "silent" },
  ]);
  const trimmed = buildVisualTimeline([
    { id: "clip", media_type: "video", source_duration_ms: 10000, source_in_ms: 1000, source_out_ms: 5000, trim_user_set: true, voiceover_mode: "narrated" },
  ]);
  assert.notEqual(base.sequence_hash, muted.sequence_hash);
  assert.notEqual(base.sequence_hash, trimmed.sequence_hash);
  assert.equal(visualTimelineSequenceHash(base.scenes), base.sequence_hash);
});

test("saved visual timeline reorders slides by stable scene identity and carries silent/trim state", () => {
  const slides = [
    { id: "photo-a", order: 1, duration_seconds: 3, voiceover: { enabled: true, text: "A" } },
    { id: "clip-b", order: 2, media_type: "video/mp4", source_duration_seconds: 12, duration_seconds: 4, voiceover: { enabled: true, text: "B" } },
  ];
  const timeline = buildVisualTimeline([
    { id: "clip-b", media_type: "video/mp4", source_duration_ms: 12000, source_in_ms: 3000, source_out_ms: 8000, trim_user_set: true, voiceover_mode: "silent" },
    { id: "photo-a", duration_ms: 3000, voiceover_mode: "narrated", narration_text: "A" },
  ]);
  const applied = applyVisualTimelineToSlides(slides, timeline);
  assert.deepEqual(applied.map((row) => row.id), ["clip-b", "photo-a"]);
  assert.equal(applied[0].duration_seconds, 5);
  assert.equal(applied[0].source_in_ms, 3000);
  assert.equal(applied[0].voiceover.enabled, false);
});

test("timeline can be built from current creative slide shape", () => {
  const timeline = buildVisualTimelineFromSlides([
    { id: "recSlide1", order: 1, duration_seconds: 4, voiceover: { enabled: true, text: "One" } },
    { id: "recSlide2", order: 2, duration_seconds: 4, voiceover: { enabled: false, text: "Two" } },
  ]);
  assert.deepEqual(timeline.ordered_scene_ids, ["recSlide1", "recSlide2"]);
  assert.equal(timeline.scenes[1].voiceover_mode, "silent");
});

test("stale revision/hash cannot be accepted over a newer visual sequence", () => {
  const current = buildVisualTimeline([{ id: "a", duration_ms: 3000 }]);
  assert.equal(assertVisualTimelineRevision(current.revision, current.sequence_hash, current), true);
  assert.throws(
    () => assertVisualTimelineRevision(current.revision - 1, current.sequence_hash, current),
    /outdated visual sequence/,
  );
  assert.throws(
    () => assertVisualTimelineRevision(current.revision, "vt1-deadbeef", current),
    /sequence hash no longer matches/,
  );
});


test("narration wording is versioned separately from the visual sequence", () => {
  const first = buildVisualTimeline([
    { id: "a", duration_ms: 3000, voiceover_mode: "narrated", narration_text: "Original wording." },
  ]);
  const rewritten = buildVisualTimeline([
    { id: "a", duration_ms: 3000, voiceover_mode: "narrated", narration_text: "Completely rewritten wording." },
  ], { previousTimeline: first });
  assert.equal(rewritten.sequence_hash, first.sequence_hash);
  assert.equal(rewritten.revision, first.revision);
  assert.notEqual(rewritten.scenes[0].narration_text, first.scenes[0].narration_text);
});


test("excluded scenes do not advance the visual master clock", () => {
  const timeline = buildVisualTimeline([
    { id: "a", duration_ms: 2000, include: true, voiceover_mode: "narrated", narration_text: "A" },
    { id: "removed", duration_ms: 9000, include: false, voiceover_mode: "silent" },
    { id: "b", duration_ms: 3000, include: true, voiceover_mode: "narrated", narration_text: "B" },
  ]);
  assert.equal(timeline.duration_ms, 5000);
  assert.deepEqual(timeline.ordered_scene_ids, ["a", "b"]);
  assert.deepEqual(timeline.voiceover_intervals, [
    { scene_id: "a", start_ms: 0, end_ms: 2000 },
    { scene_id: "b", start_ms: 2000, end_ms: 5000 },
  ]);
});


test("narration lock changes do not advance the visual sequence revision", () => {
  const first = buildVisualTimeline([
    { id: "a", duration_ms: 3000, voiceover_mode: "narrated", narration_locked: false },
  ]);
  const locked = buildVisualTimeline([
    { id: "a", duration_ms: 3000, voiceover_mode: "narrated", narration_locked: true },
  ], { previousTimeline: first });
  assert.equal(locked.sequence_hash, first.sequence_hash);
  assert.equal(locked.revision, first.revision);
});
