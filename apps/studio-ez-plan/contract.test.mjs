import assert from "node:assert/strict";
import test from "node:test";

import {
  EZ_ORIGIN,
  EZ_PHOTO_PASSES,
  ezCaptionFields,
  ezIdeaSummary,
  ezMasterContentType,
  ezOriginNotes,
  ezPackageFromContentType,
  ezPhotoCountKind,
  ezPlanFromPhotoCount,
  ezCanonicalOutputType,
  parseEzOriginNotes,
} from "./contract.mjs";

test("single photo defaults to native stills and leaves YouTube off", () => {
  const plan = ezPlanFromPhotoCount({ photoCount: 1 });
  assert.equal(plan.photo_count_kind, "single-photo");
  assert.equal(plan.master_content_type, "Feed Post");
  assert.equal(plan.youtube_enabled, false);
  assert.deepEqual(plan.overrides, { ...EZ_PHOTO_PASSES.single });
  assert.deepEqual(plan.platforms, ["Instagram", "Facebook", "TikTok"]);
  assert.equal(plan.overrides.Instagram, "Single Image");
  assert.equal(plan.overrides.Facebook, "Single Image");
  assert.equal(plan.overrides.TikTok, "Single Photo");
  assert.equal(plan.overrides.YouTube, undefined);
  assert.deepEqual(plan.extras || [], []);
});

test("multiple photos default to vertical video plus Stories", () => {
  const plan = ezPlanFromPhotoCount({ photoCount: 5 });
  assert.equal(plan.photo_count_kind, "multiple-photos");
  assert.equal(plan.master_content_type, "Photo Set");
  assert.equal(plan.youtube_enabled, true);
  assert.equal(plan.overrides.Instagram, "Reel");
  assert.equal(plan.overrides.Facebook, "Reel");
  assert.equal(plan.overrides.TikTok, "Video Draft");
  assert.equal(plan.overrides.YouTube, "Short");
  assert.deepEqual(plan.extras, ["Instagram::Story", "Facebook::Story"]);
});

test("slides package is swipeable stills and a YouTube rendered video", () => {
  const plan = ezPlanFromPhotoCount({ photoCount: 5, packageId: "slides" });
  assert.equal(plan.overrides.Instagram, "Carousel");
  assert.equal(plan.overrides.Facebook, "Multi-Image Post");
  assert.equal(plan.overrides.TikTok, "Multi-Photo");
  assert.equal(plan.overrides.YouTube, "Slideshow Video");
  assert.equal(plan.master_content_type, "Carousel");
  assert.deepEqual(plan.extras || [], []);
  assert.ok(!Object.values(plan.overrides).includes("Reel"));
  assert.ok(!Object.values(plan.overrides).includes("Slideshow Reel"));
});

test("Carousel content type without packageId recommends native stills, not Reels", () => {
  const plan = ezPlanFromPhotoCount({ photoCount: 6, contentType: "Carousel" });
  assert.equal(plan.overrides.Instagram, "Carousel");
  assert.equal(plan.overrides.Facebook, "Multi-Image Post");
  assert.equal(plan.overrides.TikTok, "Multi-Photo");
  assert.equal(plan.overrides.YouTube, "Slideshow Video");
  assert.equal(plan.master_content_type, "Carousel");
  assert.deepEqual(plan.extras || [], []);
});

test("Feed Post content type without packageId recommends single stills", () => {
  const plan = ezPlanFromPhotoCount({ photoCount: 1, contentType: "Feed Post" });
  assert.equal(plan.overrides.Instagram, "Single Image");
  assert.equal(plan.overrides.Facebook, "Single Image");
  assert.equal(plan.overrides.TikTok, "Single Photo");
  assert.equal(plan.master_content_type, "Feed Post");
  assert.deepEqual(plan.extras || [], []);
});

test("ezPackageFromContentType maps Carousel/Feed Post to slides", () => {
  assert.equal(ezPackageFromContentType("Carousel"), "slides");
  assert.equal(ezPackageFromContentType("Feed Post"), "slides");
  assert.equal(ezPackageFromContentType("Photo Set"), "video");
  assert.equal(ezPackageFromContentType("Vertical Short Video"), "video");
  assert.equal(ezPackageFromContentType(""), "");
});

test("video package from photos uses Facebook Reel plus Stories", () => {
  const plan = ezPlanFromPhotoCount({ photoCount: 4, packageId: "video" });
  assert.equal(plan.overrides.Facebook, "Reel");
  assert.deepEqual(plan.extras, ["Instagram::Story", "Facebook::Story"]);
});

test("photos-and-clips video package uses Facebook Reel plus Stories", () => {
  const plan = ezPlanFromPhotoCount({
    photoCount: 9,
    packageId: "video",
    clipInput: true,
    inputKind: "photos-and-clips",
  });
  assert.equal(plan.overrides.Instagram, "Reel");
  assert.equal(plan.overrides.Facebook, "Reel");
  assert.equal(plan.overrides.TikTok, "Video Draft");
  assert.equal(plan.overrides.YouTube, "Short");
  assert.ok(!Object.values(plan.overrides).includes("Slideshow Reel"));
  assert.deepEqual(plan.extras, ["Instagram::Story", "Facebook::Story"]);
});

test("explicit YouTube on a single still is still omitted", () => {
  const plan = ezPlanFromPhotoCount({
    photoCount: 1,
    platforms: ["Instagram", "Facebook", "TikTok", "YouTube"],
  });
  assert.equal(plan.overrides.YouTube, undefined);
  assert.ok(!plan.platforms.includes("YouTube"));
});

test("platform subset is preserved when those platforms have a photo default", () => {
  const plan = ezPlanFromPhotoCount({
    photoCount: 4,
    platforms: ["Instagram", "TikTok"],
  });
  assert.deepEqual(plan.platforms, ["Instagram", "TikTok"]);
  assert.deepEqual(plan.overrides, { Instagram: "Reel", TikTok: "Video Draft" });
});

test("TikTok Single Photo canonicalizes to the proven Multi-Photo draft route", () => {
  assert.equal(ezCanonicalOutputType("TikTok", "Single Photo"), "Multi-Photo");
  assert.equal(ezCanonicalOutputType("TikTok", "Multi-Photo"), "Multi-Photo");
  assert.equal(ezCanonicalOutputType("Instagram", "Single Image"), "Single Image");
});

test("zero photos uses the single-photo map so the client can seed before upload", () => {
  assert.equal(ezPhotoCountKind(0), "single-photo");
  assert.equal(ezMasterContentType(0), "Feed Post");
  assert.deepEqual(ezPlanFromPhotoCount({ photoCount: 0 }).overrides, { ...EZ_PHOTO_PASSES.single });
});

test("caption Manual / None / AI map onto existing Production Request text modes", () => {
  const manual = ezCaptionFields("manual", { caption: "Riverwalk at dusk" });
  assert.equal(manual.caption_mode, "Force exact");
  assert.equal(manual.requested_caption, "Riverwalk at dusk");
  assert.equal(manual.overlay_titles, true);

  const none = ezCaptionFields("none");
  assert.equal(none.caption_mode, "Leave blank");
  assert.equal(none.overlay_titles, false);
  assert.equal(none.live_fallback.caption_mode, "Force exact");
  assert.equal(none.live_fallback.requested_caption, " ");

  const ai = ezCaptionFields("ai");
  assert.equal(ai.caption_mode, "AI decides");
  assert.equal(ai.title_mode, "AI decides");
});

test("manual multiple photos join per-image captions", () => {
  const fields = ezCaptionFields("manual", { captions: ["First still", "", "Third still"] });
  assert.equal(fields.requested_caption, "First still\n\nThird still");
});

test("origin notes stay parseable without a dedicated Airtable origin field", () => {
  const notes = ezOriginNotes({ inputKind: "multiple-photos", captionMode: "none" });
  assert.match(notes, new RegExp(`origin=${EZ_ORIGIN}`));
  assert.deepEqual(parseEzOriginNotes(notes), {
    origin: EZ_ORIGIN,
    inputKind: "multiple-photos",
    captionMode: "none",
  });
  assert.match(ezIdeaSummary({ inputKind: "single-photo" }), /origin=ez-button/);
  assert.equal(parseEzOriginNotes("ordinary idea notes"), null);
});
