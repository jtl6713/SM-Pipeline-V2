"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {vibeReviewMusicFileId, vibeReviewAudioExtension} = require("./vibe-review-music-policy");

const SOURCE = "licensed_source_file_123456789";
const canonical = "https://drive.google.com/uc?export=download&id=" + SOURCE;
const review = {source:"rendering_review_vibe_cut", profile_id:"rec00000000000002"};
const identify = (url, context = review) =>
  vibeReviewMusicFileId({music:{enabled:true, url},studioRevision:context});

test("only canonical owned-Drive URL can feed protected Vibe music", () => {
  assert.equal(identify(canonical), SOURCE);
  assert.equal(identify("https://example.test/music.mp3", {source:"normal_production"}), null);
  const invalid = [
    "https://example.test/music.mp3",
    "http://drive.google.com/uc?export=download&id=" + SOURCE,
    "https://drive.google.com/file/d/" + SOURCE + "/view",
    canonical + "&id=" + SOURCE,
    canonical + "&something=else",
    canonical + "#fragment",
    "https://user:password@drive.google.com/uc?export=download&id=" + SOURCE,
    "https://drive.google.com/uc?id=" + SOURCE + "&export=download",
    "https://drive.google.com/uc?export=view&id=" + SOURCE,
    "https://drive.google.com.evil.test/uc?export=download&id=" + SOURCE,
    "https://drive.google.com/uc?export=download&id=short",
    "",
  ];
  for (const url of invalid) {
    assert.throws(() => identify(url), /vibe_review_music/);
  }
  assert.throws(() => vibeReviewMusicFileId({
    music:{enabled:false,url:canonical},studioRevision:review
  }),/source_missing/);
});

test("private media response must contain recognizable audio, never HTML or JSON", () => {
  const bytes=Buffer.alloc(32);
  bytes.write("ID3",0);
  assert.equal(vibeReviewAudioExtension(bytes,4096),".mp3");
  bytes.fill(0);bytes[0]=0xff;bytes[1]=0xfb;
  assert.equal(vibeReviewAudioExtension(bytes,4096),".mp3");
  bytes.fill(0);bytes.write("RIFF",0);bytes.write("WAVE",8);
  assert.equal(vibeReviewAudioExtension(bytes,4096),".wav");
  bytes.fill(0);bytes.write("OggS",0);
  assert.equal(vibeReviewAudioExtension(bytes,4096),".ogg");
  bytes.fill(0);bytes.write("fLaC",0);
  assert.equal(vibeReviewAudioExtension(bytes,4096),".flac");
  bytes.fill(0);bytes.write("ftyp",4);
  assert.equal(vibeReviewAudioExtension(bytes,4096),".m4a");
  for (const response of ["<!DOCTYPE html>","<html>Access denied",
                         "{\"error\":\"unauthorized\"}",""]) {
    assert.throws(() => vibeReviewAudioExtension(Buffer.from(response),4096),
      /not_audio/);
  }
  assert.throws(() => vibeReviewAudioExtension(Buffer.from("ID3"),200),
    /bytes_invalid/);
});
