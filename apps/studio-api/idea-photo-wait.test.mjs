import assert from "node:assert/strict";
import test from "node:test";

import { ideaPhotoWaitApplies, selectMatchedPhotos } from "./idea-photo-wait.mjs";

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
