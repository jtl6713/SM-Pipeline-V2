const test = require("node:test");
const assert = require("node:assert/strict");
const { authoritativeRenderPlan } = require("./authoritative-duration");

test("authoritative timing keeps imported frames and drops the voiceover tail", () => {
  const clips = [
    { durationFrames: 210, timingMode: "authoritative" },
    { durationFrames: 390, timingSource: "timed_script" },
  ];
  const plan = authoritativeRenderPlan({
    timingMode: "authoritative",
    timingSource: "timed_script",
    voiceoverTailSeconds: 2,
    durationIsExplicit: false,
  }, clips);
  assert.equal(plan.finalDurationFrames, 600);
  assert.equal(plan.effectiveTailSeconds, 0);
  assert.equal(plan.endHoldFrames, 0);
  assert.equal(plan.keepClipDurations, true);
});

test("normal renders are left to the existing duration engine", () => {
  const plan = authoritativeRenderPlan(
    { durationIsExplicit: true },
    [{ durationFrames: 90, beatSync: true }],
  );
  assert.equal(plan, null);
});
