import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPS_QUEUE_REVIEW_FORMULA } from "./ops-queue.mjs";
import { evaluateReviewPackage, factoryReviewVisibility, safeReviewPromotion } from "./review-package-readiness.mjs";
import { partitionFactoryLanes } from "./factory-desk.mjs";

const media = "https://media.chicagoshining.com/";
const publishedMedia = "https://drive.google.com/file/d/factory-private-test/view";
function privateReviewRecord(id) {
  return { id, fields: {
    Output_Status: "Ready for Review",
    Review_Status: "Review Sent",
    Render_Status: "Rendered",
    Publish_Status: "Not Ready",
    Do_Not_Publish: true,
    Studio_Render_Review_Hold_Active: false,
    Platform: "Instagram",
    Studio_Output_Type: "Reel",
    Output_Caption: "Ready for a private visual review",
    Final_File_URL: publishedMedia,
    Thumbnail_URL: media + "studio/previews/thumbnails/private-review/cover-9x16.png",
  }};
}

test("review-only Airtable selector includes eligible held Ready for Review without a completed review", () => {
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /AND\(\{Do_Not_Publish\},\{Output_Status\}="Ready for Review",OR\(\{Review_Status\}=BLANK\(\)/);
  assert.doesNotMatch(OPS_QUEUE_REVIEW_FORMULA, /Studio_Render_Review_Hold_Active/);
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /\{Test_Run_ID\}=BLANK\(\)/);
});

test("Chicago #9831 and #9832 remain in Needs Eyes for inspection while publication is blocked", () => {
  const ids = ["recFF3lX5lJlzSTiw", "reci9Wv5saieGBhsw"];
  const rows = ids.map((id, index) => {
    const record = privateReviewRecord(id);
    const readiness = evaluateReviewPackage(record);
    assert.equal(readiness.readiness, "READY", id);
    const visibility = factoryReviewVisibility(record, readiness, "Ready for Review", true);
    assert.equal(visibility.visible, true);
    assert.equal(visibility.held_preview_only, false);
    return {
      id, kind: "output", output_id: 9831 + index,
      profile_id: "recT2rbKX3MF7cVFU",
      output_status: "Ready for Review", review_status: "Review Sent",
      render_status: "Rendered", publish_status: "Not Ready",
      studio_state: "Ready for Review", review_package_ready: visibility.visible,
      do_not_publish: true, review_hold_active: false,
      final_file_url: record.fields.Final_File_URL,
      thumbnail_url: record.fields.Thumbnail_URL,
    };
  });
  const desk = partitionFactoryLanes(rows);
  assert.equal(desk.summary.needs_eyes, 2);
  assert.deepEqual(desk.lanes.needs_eyes.map(row => row.output_id), [9831, 9832]);
  assert.ok(desk.lanes.needs_eyes.every(row => row.do_not_publish && row.can_preview));
  // An eligible review is NOT a publishing authorization. Do_Not_Publish
  // continues to deny even an otherwise complete in-production promotion.
  const promote = privateReviewRecord("recFF3lX5lJlzSTiw");
  promote.fields.Output_Status = "In Production";
  assert.equal(safeReviewPromotion(promote, evaluateReviewPackage(promote)), false);
  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  assert.match(ui, /card\.review_hold_active === true \|\| card\.do_not_publish === true/);
});

test("private but unfinished or changes-requested rows do not inflate actionable review counts", () => {
  const pending = privateReviewRecord("recPrivateQueue0001");
  pending.fields.Render_Status = "Waiting in Render Queue";
  assert.equal(evaluateReviewPackage(pending).readiness, "IN_PROGRESS");
  const changes = privateReviewRecord("recPrivateChanges01");
  changes.fields.Review_Status = "Changes Requested";
  assert.equal(evaluateReviewPackage(changes).readiness, "IN_PROGRESS");
  const approved = privateReviewRecord("recPrivateApproved1");
  approved.fields.Review_Status = "Approved";
  assert.equal(evaluateReviewPackage(approved).readiness, "BLOCKED");
});
