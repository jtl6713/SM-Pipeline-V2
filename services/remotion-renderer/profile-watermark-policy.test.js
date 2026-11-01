"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {selectedVibeWatermarkFileId} = require("./profile-watermark-policy");

const CHICAGO = "rec00000000000001";
const MIAMI = "rec00000000000002";
const CHICAGO_LOGO = "chicago_owned_watermark_123456789";
const MIAMI_LOGO = "miami_owned_watermark_123456789";
const map = JSON.stringify({[CHICAGO]: CHICAGO_LOGO, [MIAMI]: MIAMI_LOGO});
const url = (id) => "https://drive.google.com/uc?export=download&id=" + id;
const review = (id) => ({source: "rendering_review_vibe_cut", profile_id: id});
const choose = (profileId, logo = MIAMI_LOGO, json = map) =>
  selectedVibeWatermarkFileId({watermarkUrl: url(logo),
    studioRevision: review(profileId), profileWatermarksJson: json});

test("authorized Chicago and Miami Vibe Cut receive only their configured owned logo", () => {
  assert.equal(choose(CHICAGO, CHICAGO_LOGO), CHICAGO_LOGO);
  assert.equal(choose(MIAMI), MIAMI_LOGO);
});

test("non-Vibe production retains existing renderer policy", () => {
  assert.equal(selectedVibeWatermarkFileId({
    watermarkUrl: "https://somewhere.example/logo.png",
    studioRevision: {source: "rendering_review"},
    profileWatermarksJson: ""
  }), null);
});

test("never allow Chicago fallback for missing city branding", () => {
  assert.throws(() => choose(MIAMI, MIAMI_LOGO, JSON.stringify({[CHICAGO]: CHICAGO_LOGO})),
    /profile_asset_not_provisioned/);
  assert.throws(() => choose(CHICAGO, MIAMI_LOGO), /source_not_profile_owned/);
  assert.throws(() => choose(MIAMI, CHICAGO_LOGO), /source_not_profile_owned/);
});

test("unverified profile identity and bad config fail closed", () => {
  assert.throws(() => choose("invalid"), /profile_identity_missing/);
  assert.throws(() => choose(MIAMI, MIAMI_LOGO, "not JSON"),
    /mapping_unavailable/);
  assert.throws(() => choose(MIAMI, MIAMI_LOGO, "[]"),
    /mapping_unavailable/);
  assert.throws(() => choose(MIAMI, MIAMI_LOGO, JSON.stringify({[MIAMI]:"bad"})),
    /asset_not_provisioned/);
});

test("alternate host, duplicate id, extra parameters, viewer URLs and fragments denied", () => {
  const bad = [
    "http://drive.google.com/uc?export=download&id=" + MIAMI_LOGO,
    "https://evil.example/uc?export=download&id=" + MIAMI_LOGO,
    "https://drive.google.com/file/d/" + MIAMI_LOGO + "/view",
    url(MIAMI_LOGO) + "&id=" + MIAMI_LOGO,
    url(MIAMI_LOGO) + "&extra=1",
    url(MIAMI_LOGO) + "#fragment",
    "https://drive.google.com/uc?export=view&id=" + MIAMI_LOGO,
    "",
  ];
  for (const watermarkUrl of bad) {
    assert.throws(() => selectedVibeWatermarkFileId({
      watermarkUrl, studioRevision: review(MIAMI), profileWatermarksJson:map
    }), /vibe_watermark_source/);
  }
});
