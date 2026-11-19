import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPS_QUEUE_REVIEW_FORMULA } from "./ops-queue.mjs";
import { evaluateReviewPackage, factoryReviewVisibility, factoryApprovalHoldReleaseEligibility, formalFactoryApprovalReady, safeReviewPromotion } from "./review-package-readiness.mjs";
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
  assert.ok(ui.includes("card?.safety_hold_active === true"));
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

test("Factory's Supabase review scan includes complete held outputs, independent of the main publishing queue", () => {
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export async function listSupabaseFactoryDeskPack");
  const end = source.indexOf("// Merge by authoritative output identity", start);
  assert.ok(start > 0 && end > start, "authoritative Factory Supabase pack exists");
  const pack = source.slice(start, end);
  assert.ok(pack.includes("platform_outputs?do_not_publish=eq.false&output_status=neq.Published"));
  assert.ok(pack.includes("platform_outputs?or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)"));
  assert.ok(!pack.includes("`platform_outputs?do_not_publish=eq.false`\n        + `&or=(output_status"));
});

test("Museum Mile #2212: all six complete held outputs are visible for inspection but neither approvable nor releaseable", () => {
  const numbers = [10827, 10828, 10829, 10830, 10831, 10832];
  const rows = numbers.map((number, index) => {
    const record = privateReviewRecord("recMuseumHeld" + String(number).padStart(5, "0"));
    record.fields.Review_Status = "";
    record.fields.Publish_Status = index === 5 ? "Publishing" : index > 2 ? "Ready to Publish" : "Not Ready";
    record.fields.Factory_Review_Handoff_Safety_Hold_At = "2026-11-19T17:03:00Z";
    const readiness = evaluateReviewPackage(record);
    assert.equal(readiness.readiness, "READY", number);
    const visibility = factoryReviewVisibility(record, readiness, "Review Held", true);
    assert.equal(visibility.visible, true, number);
    assert.equal(visibility.held_preview_only, true, number);
    assert.equal(formalFactoryApprovalReady(record, readiness), false, number);
    assert.equal(factoryApprovalHoldReleaseEligibility(record, readiness).eligible, false, number);
    return {
      kind: "output", id: record.id, output_id: number, studio_state: "Review Held",
      output_status: "Ready for Review", review_status: "",
      render_status: "Rendered", publish_status: record.fields.Publish_Status,
      do_not_publish: true, safety_hold_active: true, review_package_ready: visibility.visible,
      final_file_url: record.fields.Final_File_URL,
      thumbnail_url: record.fields.Thumbnail_URL,
    };
  });
  const desk = partitionFactoryLanes(rows);
  assert.equal(desk.summary.needs_eyes, 6);
  assert.deepEqual(desk.lanes.needs_eyes.map((row) => row.output_id), numbers);
  assert.ok(desk.lanes.needs_eyes.every((row) => row.do_not_publish && row.safety_hold_active && row.can_preview));

  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  assert.ok(ui.includes("card?.safety_hold_active === true"));
  assert.ok(ui.includes("card.safety_hold_active !== true"));
});
