"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {clipFrameDurations} = require("./src/vibe-review-timing");

const vibe = {source:"rendering_review_vibe_cut"};
const cuts = [{durationFrames:6},{durationFrames:12},
              {durationFrames:15},{durationFrames:30},{durationFrames:177}];

test("6-frame beat cuts stay 6 frames in protected 30fps Vibe review", () => {
  assert.deepEqual(clipFrameDurations(cuts,30,vibe),[6,12,15,30,177]);
  assert.equal(clipFrameDurations(cuts,30,vibe).reduce((a,b)=>a+b,0),240);
});

test("normal PhotoSequence keeps original one-second minimum", () => {
  assert.deepEqual(clipFrameDurations(cuts,30,{}),[30,30,30,30,177]);
  assert.deepEqual(clipFrameDurations([{durationFrames:0},{}],30,undefined),[30,90]);
});

test("malformed or zero-length Vibe clips fail instead of adjusting runtime", () => {
  for(const invalid of [undefined,NaN,Infinity,0,1,5,7.5,901,-1]) {
    assert.throws(() => clipFrameDurations([{durationFrames:invalid}],30,vibe),
      /vibe_exact_cut_frames_invalid/);
  }
  assert.deepEqual(clipFrameDurations([{durationFrames:900}],30,vibe),[900]);
});

test("Vibe review does not alter another revision type", () => {
  assert.deepEqual(clipFrameDurations([{durationFrames:6}],30,
    {source:"rendering_review"}),[30]);
});
