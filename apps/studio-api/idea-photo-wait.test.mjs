import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIdeaLibraryKeys,
  ideaAutoListenContentType,
  ideaPhotoWaitApplies,
  ideaProductionConfigFields,
  mergeIdeaProductionNotes,
  parseIdeaNotedMediaIds,
  productionPhotoWaitAutoOff,
  productionPhotoWaitRejectedIds,
  rankIdeaLibraryFields,
  selectMatchedPhotos,
  shouldAttachPhotoWaitAssets,
  withProductionPhotoWaitManual,
} from "./idea-photo-wait.mjs";

test("generated ideas always get a listen-capable content type", () => {
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Thread"],
  }), "Feed Post");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Story"],
  }), "Feed Post");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Text Post"],
  }), "Feed Post");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Event / Flyer Post"],
  }), "Feed Post");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Thumbnail / Promo Still"],
  }), "Feed Post");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Longform Video"],
  }), "Vertical Short Video");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Carousel"],
  }), "Carousel");
  assert.equal(ideaAutoListenContentType({
    suggestedFormats: ["Vertical Short Video"],
  }), "Vertical Short Video");
  assert.equal(ideaAutoListenContentType({}), "Carousel");
  assert.equal(ideaAutoListenContentType({
    productionContentType: "Photo Set",
    suggestedFormats: ["Thread"],
  }), "Photo Set");
});

test("wait-range applies only to real-photo image ideas", () => {
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Carousel",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Manual Upload",
  }), true);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Photo Set",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Wait for matching photos",
  }), true);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Carousel",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Make AI Generated",
  }), false);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Carousel",
    carousel_slide_count_mode: "Exact",
    carousel_image_mode: "Manual Upload",
  }), false);
  assert.equal(ideaPhotoWaitApplies({
    content_type: "Vertical Short Video",
    carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Manual Upload",
  }), false);
});

test("min 3 max 10 takes all 7 high-confidence matches, newest first", () => {
  const matches = [
    { id: "recOld", confidence: "high", intake_date: "2026-08-01", score: 90 },
    { id: "recA", confidence: "high", intake_date: "2026-08-29", score: 10 },
    { id: "recB", confidence: "high", intake_date: "2026-08-29", score: 40 },
    { id: "recC", confidence: "high", intake_date: "2026-08-29", score: 30 },
    { id: "recD", confidence: "high", intake_date: "2026-08-29", score: 20 },
    { id: "recE", confidence: "high", intake_date: "2026-08-28", score: 80 },
    { id: "recF", confidence: "high", intake_date: "2026-08-29", score: 50 },
    { id: "recLow", confidence: "medium", intake_date: "2026-08-29", score: 99 },
  ];
  const result = selectMatchedPhotos({ matches, min: 3, max: 10 });
  assert.equal(result.action, "ready");
  assert.equal(result.selected.length, 7);
  assert.deepEqual(result.selected.map((row) => row.id), [
    "recF", "recB", "recC", "recD", "recA", "recE", "recOld",
  ]);
});

test("below min keeps waiting", () => {
  const matches = [
    { id: "rec1", confidence: "high", intake_date: "2026-08-29", score: 10 },
    { id: "rec2", confidence: "high", intake_date: "2026-08-29", score: 9 },
    { id: "rec3", confidence: "low", intake_date: "2026-08-29", score: 8 },
  ];
  const result = selectMatchedPhotos({ matches, min: 3, max: 10 });
  assert.equal(result.action, "wait");
  assert.equal(result.high_count, 2);
  assert.deepEqual(result.selected, []);
});

test("more than max keeps the newest 10", () => {
  const matches = Array.from({ length: 12 }, (_, index) => ({
    id: `rec${String(index + 1).padStart(2, "0")}`,
    confidence: "high",
    intake_date: index < 10 ? "2026-08-29" : "2026-08-01",
    score: 12 - index,
  }));
  const result = selectMatchedPhotos({ matches, min: 3, max: 10 });
  assert.equal(result.action, "ready");
  assert.equal(result.selected.length, 10);
  assert.ok(!result.selected.some((row) => row.intake_date === "2026-08-01"));
});

test("same intake batch still classifying does not lock the set", () => {
  const matches = [
    { id: "rec1", confidence: "high", intake_date: "2026-08-29", score: 30, intake_batch_id: "BATCH-7" },
    { id: "rec2", confidence: "high", intake_date: "2026-08-29", score: 20, intake_batch_id: "BATCH-7" },
    { id: "rec3", confidence: "high", intake_date: "2026-08-29", score: 10, intake_batch_id: "BATCH-7" },
  ];
  const waiting = selectMatchedPhotos({
    matches,
    min: 3,
    max: 10,
    pendingBatchIds: ["BATCH-7"],
  });
  assert.equal(waiting.action, "wait_batch");
  assert.deepEqual(waiting.selected, []);

  const forced = selectMatchedPhotos({
    matches,
    min: 3,
    max: 10,
    pendingBatchIds: ["BATCH-7"],
    force: true,
  });
  assert.equal(forced.action, "ready");
  assert.equal(forced.selected.length, 3);
});

test("operator photo deletes lock photo-wait so cron cannot restore or reshuffle", () => {
  assert.equal(shouldAttachPhotoWaitAssets({ action: "wait_batch" }), false);
  assert.equal(shouldAttachPhotoWaitAssets({ action: "wait" }), false);
  assert.equal(shouldAttachPhotoWaitAssets({ action: "ready" }), true);
  assert.equal(shouldAttachPhotoWaitAssets({ action: "ready", autoOff: true }), false);
  const notes = withProductionPhotoWaitManual("", ["recAbcdefghijklm1", "not-an-id"]);
  assert.match(notes, /ez-photo-wait=off/);
  assert.deepEqual(productionPhotoWaitRejectedIds(notes), ["recAbcdefghijklm1"]);
  assert.equal(productionPhotoWaitAutoOff(notes), true);
  const again = withProductionPhotoWaitManual(notes, ["recNopqrstuvwxyz2"]);
  assert.deepEqual(productionPhotoWaitRejectedIds(again), ["recAbcdefghijklm1", "recNopqrstuvwxyz2"]);
});

test("CTA idea keys ignore cars/ride and keep train subject words", () => {
  const keys = buildIdeaLibraryKeys({
    primaryLocation: "Chicago",
    title: "Ride the CTA: Chicago trains from the platform",
    summary: "Show visitors how Chicago’s trains actually look — CTA cars at the station, tracks, and the platform crush.",
  });
  assert.ok(!keys.placeKeys.includes("chicago"));
  assert.ok(!keys.subjectKeys.includes("cars"));
  assert.ok(!keys.subjectKeys.includes("ride"));
  assert.ok(keys.subjectKeys.includes("trains") || keys.subjectKeys.includes("train"));
  assert.ok(keys.subjectKeys.includes("platform"));
  assert.ok(keys.subjectKeys.includes("cta"));
});

test("parked-car Andersonville still is not high for a CTA idea", () => {
  const keys = buildIdeaLibraryKeys({
    primaryLocation: "Chicago",
    title: "Ride the CTA: Chicago trains from the platform",
    summary: "CTA cars at the station and the platform crush",
  });
  const patio = rankIdeaLibraryFields({
    location: "Andersonville",
    name: "Andersonville 3.jpg",
    haystack: "andersonville restaurant patio parked cars chicago street scene",
    ...keys,
    strongIdeaTokens: keys.subjectKeys,
    ideaTokens: ["chicago", "trains", "platform", "cars"],
    queryTokens: [],
  });
  assert.equal(patio, null);

  const train = rankIdeaLibraryFields({
    location: "Chicago",
    name: "CTA Train 14.jpeg",
    haystack: "cta train 14 chicago commuter train rail station train platform public transit",
    ...keys,
    strongIdeaTokens: keys.subjectKeys,
    ideaTokens: ["chicago", "trains", "platform"],
    queryTokens: [],
    today: "2026-08-29",
    intakeDate: "2026-08-29",
  });
  assert.equal(train.confidence, "high");
  assert.ok(train.match_reasons.some((reason) => reason.startsWith("asset_name:") || reason.startsWith("subject:")));
});

test("neighborhood place on Location or Asset Name stays high", () => {
  const keys = buildIdeaLibraryKeys({
    primaryLocation: "Pilsen",
    title: "Pilsen murals — color on 18th Street",
    summary: "Color on 18th Street",
  });
  const mural = rankIdeaLibraryFields({
    location: "Pilsen",
    name: "Pilsen mural 4.jpg",
    haystack: "pilsen mural 18th street chicago",
    ...keys,
    strongIdeaTokens: keys.subjectKeys,
    ideaTokens: ["pilsen", "murals", "color"],
    queryTokens: [],
  });
  assert.equal(mural.confidence, "high");
  assert.ok(mural.match_reasons.includes("location:pilsen"));
});

test("idea save persists platforms and exact slide count", () => {
  assert.deepEqual(ideaProductionConfigFields({ title: "Only title" }), {});
  const fields = ideaProductionConfigFields({
    save_production_config: true,
    content_type: "Carousel",
    platforms: ["Facebook", "Instagram", "Instagram"],
    include_voiceover: "Yes",
    include_background_music: "No",
    include_thumbnail: "Use Profile Default",
    video_duration: 30,
    video_clip_count: "Auto",
    voiceover_tail_seconds: 2,
    carousel_slide_count: 7,
    carousel_slide_count_mode: "Exact",
    carousel_image_mode: "Manual Upload",
    production_notes: "Seven slides",
  });
  assert.deepEqual(fields.Production_Target_Platforms, ["Facebook", "Instagram"]);
  assert.equal(fields.Production_Content_Type, "Carousel");
  assert.equal(fields.Production_Carousel_Slide_Count, 7);
  assert.equal(fields.Production_Carousel_Slide_Count_Mode, "Exact");
  assert.equal(fields.Production_Video_Clip_Count, null);
  assert.equal(fields.Production_Config_Notes, "Seven slides");
});

test("idea save rejects a slide count outside 1-20", () => {
  assert.throws(() => ideaProductionConfigFields({
    save_production_config: true,
    platforms: ["Instagram"],
    carousel_slide_count: 0,
  }), /Slide count must be between 1 and 20/);
  assert.throws(() => ideaProductionConfigFields({
    save_production_config: true,
    platforms: ["Threads"],
  }), /Unsupported target platforms/);
});

test("idea save keeps origin and photo ids when production notes are blank", () => {
  const existing = "origin=autonomous\nmedia_asset_ids=recPhoto1,recPhoto2\ncluster=bridge";
  const kept = mergeIdeaProductionNotes(existing, "", null);
  assert.match(kept, /origin=autonomous/);
  assert.match(kept, /media_asset_ids=recPhoto1,recPhoto2/);
  assert.match(kept, /cluster=bridge/);
  assert.deepEqual(parseIdeaNotedMediaIds(existing), ["recPhoto1", "recPhoto2"]);
  const fields = ideaProductionConfigFields({
    save_production_config: true,
    platforms: ["Instagram"],
    production_notes: "",
  }, existing);
  assert.match(fields.Production_Config_Notes, /origin=autonomous/);
  assert.match(fields.Production_Config_Notes, /media_asset_ids=recPhoto1,recPhoto2/);
});

test("idea save persists checked library stills and does not drop origin", () => {
  const fields = ideaProductionConfigFields({
    save_production_config: true,
    platforms: ["Instagram"],
    production_notes: "Keep the river light",
    library_asset_ids: ["recStillA", "recStillA", "recStillB"],
  }, "origin=autonomous\nmedia_asset_ids=recOld");
  assert.deepEqual(fields.Studio_Matched_Media_Assets, ["recStillA", "recStillB"]);
  assert.match(fields.Production_Config_Notes, /origin=autonomous/);
  assert.match(fields.Production_Config_Notes, /media_asset_ids=recStillA,recStillB/);
  assert.match(fields.Production_Config_Notes, /Keep the river light/);
  assert.doesNotMatch(fields.Production_Config_Notes, /recOld/);
});


test("explicit AI image mode stops listening and clears auto-matched library photos", () => {
  const fields = ideaProductionConfigFields({
    save_production_config: true,
    platforms: ["Instagram"],
    content_type: "Carousel",
    carousel_slide_count_mode: "Exact",
    carousel_slide_count: 6,
    carousel_image_mode: "Make AI Generated",
  }, "media_asset_ids=recOldA,recOldB\nKeep the neon look.");

  assert.equal(fields.Production_Carousel_Image_Mode, "Make AI Generated");
  assert.equal(fields.Production_Carousel_Slide_Count_Mode, "Exact");
  assert.equal(fields.Production_Carousel_Slide_Count, 6);
  assert.equal(fields.Studio_Photo_Wait_Status, null);
  assert.equal(fields.Studio_Photo_Match_JSON, null);
  assert.deepEqual(fields.Studio_Matched_Media_Assets, []);
  assert.equal(fields.Production_Config_Notes, "Keep the neon look.");
});

test("explicit listen mode keeps the automatic listener enabled", () => {
  const fields = ideaProductionConfigFields({
    save_production_config: true,
    platforms: ["Instagram"],
    content_type: "Carousel",
    carousel_slide_count_min: 3,
    carousel_slide_count_max: 8,
    carousel_image_mode: "Wait for matching photos",
  });

  assert.equal(fields.Production_Carousel_Image_Mode, "Manual Upload");
  assert.equal(fields.Production_Carousel_Slide_Count_Mode, "Target range");
  assert.equal(fields.Studio_Photo_Wait_Status, "Waiting");
});
