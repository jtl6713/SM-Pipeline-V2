import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReviewPackage, verifyReviewImages, safeReviewPromotion, factoryReviewVisibility, factoryApprovalHoldReleaseEligibility } from "./review-package-readiness.mjs";

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

test("Michigan 9593 held review stays previewable in Needs Eyes but cannot approve", () => {
  const held = asRecord({ ...photo, Output_Status: "Ready for Review", Review_Status: "Review Sent",
    Studio_Render_Review_Hold_Active: true, Do_Not_Publish: true }, "recPnNYghmcJYivOA");
  const status = evaluateReviewPackage(held);
  assert.equal(status.readiness, "IN_PROGRESS");
  const visibility = factoryReviewVisibility(held, status, "Ready for Review", true);
  assert.deepEqual(visibility, { visible: true, incomplete: false, held_preview_only: true });
  assert.equal(safeReviewPromotion(held, status), false);
  assert.equal(factoryReviewVisibility(held, status, "Ready for Review", false).visible, false);
  assert.equal(factoryReviewVisibility({ ...held, fields: { ...held.fields, Do_Not_Publish: false } }, status, "Ready for Review", true).visible, false);
});

test("missing deliverable is excluded from Needs Eyes and sent for repair", () => {
  const bad = asRecord({ ...photo, Studio_Preview_URL: "" });
  const readiness = evaluateReviewPackage(bad);
  assert.equal(readiness.readiness, "BLOCKED");
  const visibility = factoryReviewVisibility(bad, readiness, "Preparing Assets", false);
  assert.equal(visibility.visible, false);
  assert.equal(visibility.incomplete, true);
});

test("Factory Needs Eyes counts valid multi-ratio carousel variants by selected photos, not linked slides", () => {
  for (const [outputNumber, profile, selected, prepared, platform, outputType] of [
    [9757, "Chicago", 4, 8, "Facebook", "Multi-Image Post"],
    [9758, "Chicago", 4, 8, "TikTok", "Multi-Photo"],
    [9765, "Miami", 4, 8, "Instagram", "Carousel"],
    [9822, "New York", 8, 24, "Facebook", "Multi-Image Post"],
    [9823, "New York", 8, 16, "TikTok", "Multi-Photo"],
  ]) {
    const selectedClips = Array.from({ length: selected }, (_, i) => ({
      url: cdn + "studio/previews/lettered/output-" + outputNumber + "/" + i + ".jpg",
    }));
    const record = asRecord({
      ...photo,
      Platform: platform,
      Studio_Output_Type: outputType,
      Output_Caption: "Real, reviewed " + profile + " photo tour",
      Selected_Clip_Count: selected,
      "Carousel Slides": Array.from({ length: prepared }, (_, i) => ({ id: "recVariant" + i })),
      Selected_Assets_JSON: JSON.stringify({ validation_status: "Valid", selected_clips: selectedClips }),
    }, "recFactoryVariant" + outputNumber);
    const readiness = evaluateReviewPackage(record);
    assert.equal(readiness.readiness, "READY", "output " + outputNumber + " must not reject multi-ratio variants: " + readiness.missing_requirements);
    assert.equal(factoryReviewVisibility(record, readiness, "Ready for Review", true).visible, true);
    assert.equal(readiness.missing_requirements.length, 0);
  }
});

test("selected source count and CDN safety still fail closed independently of extra crop variants", () => {
  const good = JSON.parse(photo.Selected_Assets_JSON);
  for (const [problem, changes] of [
    ["selected clips too short", { Selected_Assets_JSON: JSON.stringify({
      ...good, selected_clips: good.selected_clips.slice(0, 3),
    }) }],
    ["non-CDN media", { Selected_Assets_JSON: JSON.stringify({
      ...good, selected_clips: good.selected_clips.map((row, i) => i === 0 ? { url: "https://example.com/bad.jpg" } : row),
    }) }],
    ["no caption", { Output_Caption: "" }],
    ["insufficient linked canonical source evidence", {
      Selected_Assets_JSON: "",
      "Carousel Slides": [{ id: "recOnlyOneSlide" }],
    }],
  ]) {
    const record = asRecord({
      ...photo, Selected_Clip_Count: 8, "Carousel Slides": Array.from({ length: 24 }, (_, i) => ({ id: "recVariant" + i })),
      ...changes,
    });
    const readiness = evaluateReviewPackage(record);
    assert.equal(readiness.readiness, "BLOCKED", problem);
  }
});

test("complete Do_Not_Publish review package can be released for separate formal approval without scheduling", () => {
  const video = asRecord({
    Output_Status: "Ready for Review", Review_Status: "Review Sent",
    Render_Status: "Rendered", Publish_Status: "Not Ready",
    Do_Not_Publish: true, Auto_Publish_Enabled: false,
    Output_Caption: "Private rendered preview", Platform: "Instagram",
    Studio_Output_Type: "Reel", Final_File_URL: "https://drive.google.com/file/d/ready/view",
    Thumbnail_URL: cdn + "factory/ready-cover.png",
  });
  const ready = factoryApprovalHoldReleaseEligibility(video);
  assert.equal(ready.eligible, true);
  assert.equal(factoryApprovalHoldReleaseEligibility(asRecord({...video.fields, Review_Status: ""})).eligible, true);
  for (const fields of [
    { Review_Status: "Changes Requested" },
    { Review_Status: "Approved" },
    { Publish_Status: "Scheduled" },
    { Render_Status: "Waiting in Render Queue" },
    { Studio_Render_Review_Hold_Active: true },
    { Output_Caption: "" },
    { Test_Run_ID: "test-protected" },
    { Do_Not_Publish: false },
  ]) {
    assert.equal(factoryApprovalHoldReleaseEligibility(asRecord({...video.fields, ...fields})).eligible, false, JSON.stringify(fields));
  }
});
