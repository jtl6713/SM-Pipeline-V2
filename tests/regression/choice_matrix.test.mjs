import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  autonomousPlanExtras,
  autonomousPlanOverrides,
  autonomousRequestNeedsContinue,
  isAutonomousOrigin,
} from "../../apps/studio-api/autonomous-produce.mjs";
import {
  AZ_OVERRIDES,
  isAzFinishedVideoOrigin,
} from "../../apps/studio-api/az-finished-video.mjs";
import { ideaPhotoWaitApplies } from "../../apps/studio-api/idea-photo-wait.mjs";
import {
  EZ_CAPTION_MODES,
  EZ_INPUTS,
  ezCaptionFields,
  ezOriginNotes,
  ezPlanFromPhotoCount,
  parseEzOriginNotes,
} from "../../apps/studio-ez-plan/contract.mjs";

const catalog = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "catalog.json"), "utf8"),
);

const IDEA_FORMATS = [
  "Vertical Short Video",
  "Carousel",
  "Feed Post",
  "Story",
  "Thumbnail / Promo Still",
  "Longform Video",
  "Thread",
  "Text Post",
  "Event / Flyer Post",
  "Photo Set",
];

const IDEA_QUALITIES = ["Highest Quality", "Balanced", "Quantity"];
const VO_MUSIC = ["Use Profile Default", "Yes", "No"];
const THUMB_MODES = ["Use Profile Default", "Yes", "No", "Use photo frame"];
const PUBLISH_MODES = ["Inherit", "Auto Publish", "Manual Review", "Do Not Publish"];
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "YouTube"];

test("catalog rotation covers every live id once", () => {
  const live = Object.keys(catalog.live);
  assert.deepEqual([...catalog.rotation].sort(), [...live].sort());
  assert.equal(new Set(catalog.rotation).size, catalog.rotation.length);
});

test("I1 formats never include Reel and cover the promote list", () => {
  assert.ok(!IDEA_FORMATS.includes("Reel"));
  for (const format of IDEA_FORMATS) {
    assert.ok(format.length > 3);
  }
  for (const quality of IDEA_QUALITIES) {
    assert.ok(["Highest Quality", "Balanced", "Quantity"].includes(quality));
  }
});

test("promote and production choice enums stay bounded", () => {
  assert.deepEqual(VO_MUSIC, ["Use Profile Default", "Yes", "No"]);
  assert.ok(THUMB_MODES.includes("Use photo frame"));
  assert.ok(PUBLISH_MODES.includes("Do Not Publish"));
  assert.deepEqual(PLATFORMS, ["Instagram", "Facebook", "TikTok", "YouTube"]);
  for (const seconds of [15, 30, 45, 60, 90]) {
    assert.ok(seconds >= 15 && seconds <= 90);
  }
});

test("photo-wait applies to carousel-family target-range real photos only", () => {
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Carousel",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Wait for matching photos",
  }), true);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Feed Post",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Manual Upload",
  }), true);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Vertical Short Video",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Manual Upload",
  }), false);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Carousel",
    carousel_slide_count_mode: "Exact",
    carousel_image_mode: "Manual Upload",
  }), false);
});

test("EZ caption modes map to production text modes", () => {
  assert.deepEqual([...EZ_CAPTION_MODES], ["manual", "none", "ai"]);
  assert.equal(ezCaptionFields("manual", { caption: "Hello Navy Pier" }).caption_mode, "Force exact");
  assert.equal(ezCaptionFields("none").caption_mode, "Leave blank");
  assert.equal(ezCaptionFields("ai").caption_mode, "AI decides");
});

test("EZ plan packages for single vs multi vs clips", () => {
  const single = ezPlanFromPhotoCount({ photoCount: 1, packageId: "slides" });
  assert.equal(single.overrides.Instagram, "Single Image");
  assert.equal(single.overrides.TikTok, "Single Photo");
  const slides = ezPlanFromPhotoCount({ photoCount: 3, packageId: "slides" });
  assert.equal(slides.overrides.Instagram, "Carousel");
  assert.equal(slides.overrides.YouTube, "Slideshow Video");
  const video = ezPlanFromPhotoCount({ photoCount: 4, packageId: "video" });
  assert.equal(video.overrides.Facebook, "Slideshow Reel");
  assert.deepEqual(video.extras, ["Instagram::Story", "Facebook::Story"]);
  const clips = ezPlanFromPhotoCount({
    photoCount: 2,
    packageId: "video",
    clipInput: true,
    inputKind: EZ_INPUTS.PHOTOS_AND_CLIPS,
  });
  assert.equal(clips.overrides.Facebook, "Reel");
});

test("wizard origin notes parse and stay on ez-button contract", () => {
  const notes = ezOriginNotes({ inputKind: "finished-video", captionMode: "ai", packageId: "video" });
  const parsed = parseEzOriginNotes(notes);
  assert.equal(parsed.inputKind, "finished-video");
  assert.equal(parsed.captionMode, "ai");
  assert.match(notes, /ez-package=video/);
});

test("autonomous origin continues through Submitted and uses reel or carousel packs", () => {
  assert.equal(isAutonomousOrigin("origin=autonomous; library stills"), true);
  assert.equal(autonomousRequestNeedsContinue("Submitted", "origin=autonomous"), true);
  assert.equal(autonomousRequestNeedsContinue("Submitted", "origin=ez-wizard"), false);
  assert.equal(autonomousPlanOverrides("Vertical Short Video").Instagram, "Reel");
  assert.equal(autonomousPlanOverrides("Carousel").Instagram, "Carousel");
  assert.deepEqual(autonomousPlanExtras().map((row) => `${row.platform}::${row.output_type}`), [
    "Instagram::Story",
    "Facebook::Story",
  ]);
});

test("AZ finished-video origin and four-platform reel pack", () => {
  assert.equal(isAzFinishedVideoOrigin("origin=az-finished-video; ez-input=finished-video; az-auto-queue=1"), true);
  assert.equal(AZ_OVERRIDES.YouTube, "Short");
  assert.equal(AZ_OVERRIDES.TikTok, "Video Draft");
});

test("catalog studio scenarios name a route and a private publish policy", () => {
  for (const [id, spec] of Object.entries(catalog.live)) {
    if (spec.kind !== "studio-scenario") continue;
    assert.ok(spec.expected_route, id);
    assert.ok(spec.publish, id);
    assert.notEqual(spec.publish.instagram, "public");
    assert.notEqual(spec.publish.facebook, "public");
    assert.notEqual(spec.publish.youtube, "public");
  }
});
