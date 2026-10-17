import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(here, "assets/visual-timeline-trim.js"), "utf8");
const context = {};
vm.runInNewContext(source, context);
const math = context.VisualTimelineTrimEditor.__test;

test("trim range normalizes bounds and enforces a minimum duration", () => {
  assert.deepEqual({ ...math.normalizeRange(-2, 2, 10) }, { start: 0, end: 2 });
  assert.deepEqual({ ...math.normalizeRange(9.98, 9.99, 10) }, { start: 9.9, end: 10 });
});

test("whole-window sliding preserves duration and clamps at source edges", () => {
  const original = math.normalizeRange(2, 7, 20);
  const moved = math.slideRange(original.start, original.end, 4, 20);
  assert.equal(Number((moved.end - moved.start).toFixed(3)), 5);
  assert.deepEqual({ ...moved }, { start: 6, end: 11 });

  const clamped = math.slideRange(original.start, original.end, 50, 20);
  assert.deepEqual({ ...clamped }, { start: 15, end: 20 });
});

test("frame nudges keep the opposite boundary stable and never invert the range", () => {
  const movedStart = math.nudgeBoundary(2, 5, "start", 1, 10, 30);
  assert.ok(movedStart.start > 2);
  assert.equal(movedStart.end, 5);

  const movedEnd = math.nudgeBoundary(2, 5, "end", -1, 10, 30);
  assert.equal(movedEnd.start, 2);
  assert.ok(movedEnd.end < 5);
});

test("frame timecode is deterministic", () => {
  assert.equal(math.formatTimecode(65.5, 30), "00:01:05:15");
  assert.equal(Number(math.frameSeconds(25).toFixed(3)), 0.04);
});

test("trim editor source contains exact loop, pointer, touch-compatible and write-back behavior", () => {
  assert.match(source, /Loop selected range/);
  assert.match(source, /pointerdown/);
  assert.match(source, /pointermove/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /sourceIn\.dataset\.trimTouched = "true"/);
  assert.match(source, /sourceOut\.dataset\.trimTouched = "true"/);
  assert.match(source, /canvas\.toDataURL\("image\/jpeg"/);
  assert.match(source, /requestAnimationFrame\(tick\)/);
  assert.match(source, /MAX_WAVEFORM_BYTES/);
  assert.match(source, /method: "HEAD"/);
  assert.match(source, /decodeAudioData/);
  assert.match(source, /Waveform skipped/);
});
