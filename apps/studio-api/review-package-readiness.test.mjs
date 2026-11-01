import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReviewPackage, verifyReviewImages, safeReviewPromotion } from "./review-package-readiness.mjs";

const cdn = "https://media.chicagoshining.com/";
const asRecord = (fields, id = "recPilsenReady0001") => ({ id, fields });
const photo = {
  Output_Status: "Ready for Review",
  Render_Status: "Native Photo Route",
  Platform: "Instagram",
  Studio_Output_Type: "Carousel",
  Output_Caption: "Eight mural photos",
  Thumbnail_URL: cdn + "studio/previews/thumbnails/pilsen/cover-4x5.png",
  Studio_Preview_URL: cdn + "studio/previews/lettered/ig/0.jpg",
  Selected_Clip_Count: 8,
  "Carousel Slides": Array.from({ length: 8 }, (_, i) => ({ id: "recSlide" + i })),
  Selected_Assets_JSON: JSON.stringify({
    validation_status: "Valid",
    selected_clips: Array.from({ length: 8 }, (_, i) => ({ url: cdn + "studio/previews/lettered/ig/" + i + ".jpg" })),
  }),
};

test("Pilsen Murals Instagram, Facebook and TikTok native packages are review-ready without MP4", () => {
  for (const [id, platform, type] of [[9682, "Instagram", "Carousel"], [9683, "Facebook", "Multi-Image Post"], [9684, "TikTok", "Multi-Photo"]]) {
    const record = asRecord({ ...photo, Platform: platform, Studio_Output_Type: type }, "recPilsen" + id);
    const state = evaluateReviewPackage(record);
    assert.equal(state.readiness, "READY", platform);
    assert.equal(state.review_asset_urls.length, 9);
    assert.deepEqual(state.missing_requirements, []);
  }
});

test("missing required preview, missing slide or bad manifest prevents review", () => {
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Studio_Preview_URL: "" })).readiness, "BLOCKED");
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Selected_Clip_Count: 9 })).readiness, "BLOCKED");
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Selected_Assets_JSON: "{broken" })).readiness, "BLOCKED");
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Output_Caption: "" })).readiness, "BLOCKED");
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Selected_Assets_JSON: "" })).readiness, "READY", "compact queue projection uses linked canonical slides");
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Selected_Assets_JSON: "", "Carousel Slides": [] })).readiness, "READY", "Supabase compact review projection has selected count and CDN cover and preview");
  assert.equal(evaluateReviewPackage(asRecord({ ...photo, Output_Status: "In Production", Selected_Assets_JSON: "", "Carousel Slides": [] })).readiness, "BLOCKED", "automatic recovery requires full manifest or canonical slide links");
});

test("active job, failed preparation, completed approval and revision cannot be promoted", () => {
  for (const [change, expected] of [
    [{ Render_Status: "Rendering" }, "IN_PROGRESS"],
    [{ Render_Status: "Failed" }, "FAILED"],
    [{ Review_Status: "Changes Requested" }, "IN_PROGRESS"],
    [{ Review_Status: "Approved" }, "BLOCKED"],
    [{ Output_Status: "Published" }, "BLOCKED"],
    [{ Studio_Render_Review_Hold_Active: true }, "IN_PROGRESS"],
  ]) assert.equal(evaluateReviewPackage(asRecord({ ...photo, ...change })).readiness, expected);
});

test("missing image bytes block approval even when Airtable metadata looks ready", async () => {
  const state = evaluateReviewPackage(asRecord(photo));
  let checked = 0;
  const result = await verifyReviewImages(state, {
    fetchImpl: async url => {
      checked++;
      return { ok: !url.endsWith("/4.jpg"), headers: { get: () => "image/jpeg" }, body: { cancel: async () => {} } };
    },
  });
  assert.equal(checked, 9);
  assert.equal(result.readiness, "BLOCKED");
  assert.equal(result.reason, "review_asset_unreachable");
  const all = await verifyReviewImages(state, {
    fetchImpl: async () => ({ ok: true, headers: { get: () => "image/jpeg" }, body: { cancel: async () => {} } }),
  });
  assert.equal(all.readiness, "READY");
  assert.equal(all.evidence_level, "http_probed");
});

test("ready video requires actual finished file; reconcile only unheld unapproved stale production", () => {
  const video = asRecord({
    Output_Status: "In Production", Render_Status: "Rendered",
    Platform: "YouTube", Studio_Output_Type: "Short",
    Output_Caption: "Chicago tour", Thumbnail_URL: cdn + "cover.jpg",
    Final_File_URL: "https://drive.google.com/file/d/abc/view",
  });
  const ready = evaluateReviewPackage(video);
  assert.equal(ready.readiness, "READY");
  assert.equal(safeReviewPromotion(video, ready), true);
  assert.equal(safeReviewPromotion(asRecord({ ...video.fields, Publish_Status: "Scheduled" }), ready), false);
  assert.equal(safeReviewPromotion(asRecord({ ...video.fields, Review_Status: "Changes Requested" }), ready), false);
  assert.equal(evaluateReviewPackage(asRecord({ ...video.fields, Final_File_URL: "" })).readiness, "BLOCKED");
});
