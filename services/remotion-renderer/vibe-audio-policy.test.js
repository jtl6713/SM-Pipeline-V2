"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {noVoiceoverForVibeReview} = require("./vibe-audio-policy");

const valid = () => ({
  studioRevision: {source:"rendering_review_vibe_cut"},
  voiceover: {enabled:false},
  voiceoverText:"",
  spokenCaptionsEnabled:false,
  captionTrackMode:"none",
  music: {enabled:true, url:"https://drive.google.com/uc?export=download&id=licensed_song_id_12345678", volume:0.25}
});

test("real music-driven Vibe Cut requires no synthesized narration file", () => {
  assert.equal(noVoiceoverForVibeReview(valid()), undefined);
});

test("voiceover URL or invented narration always blocked", () => {
  const examples=[
    {voiceover:{enabled:false,url:"https://drive.google.com/uc?export=download&id=other"}},
    {voiceover:{enabled:true}},
    {voiceover:{url:"https://somewhere.example/music.mp3"}},
    {voiceoverUrl:"https://somewhere.example/voice.mp3"},
    {voiceoverText:"narrate this"},
    {spokenCaptionsEnabled:true},
    {captionTrackMode:"voiceover-subtitles"},
    {music:{enabled:false, url:"a", volume:0.5}},
    {music:{enabled:true,url:"a",volume:2}},
    {music:{enabled:true,url:"a",volume:NaN}},
  ];
  for(const overrides of examples) {
    const body={...valid(), ...overrides};
    assert.throws(() => noVoiceoverForVibeReview(body),/music_only_contract_invalid/);
  }
});

test("unrecognized render types cannot use the Vibe no-VO bypass", () => {
  assert.throws(() => noVoiceoverForVibeReview({
    ...valid(), studioRevision:{source:"rendering_review"}
  }), /scope_not_verified/);
});
