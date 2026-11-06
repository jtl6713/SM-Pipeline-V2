import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPS_QUEUE_REVIEW_FORMULA } from "./ops-queue.mjs";
import { evaluateReviewPackage, factoryReviewVisibility } from "./review-package-readiness.mjs";
import { partitionFactoryLanes } from "./factory-desk.mjs";

const heldVideo = {
  id: "recFF3lX5lJlzSTiw",
  fields: {
    Output_Status: "Ready for Review",
    Review_Status: "Review Sent",
    Render_Status: "Rendered",
    Publish_Status: "Not Ready",
    Do_Not_Publish: true,
    Studio_Render_Review_Hold_Active: false,
    Studio_Output_Type: "Reel",
    Platform: "Instagram",
    Output_Caption: "Review the newly rendered short",
    Final_File_URL: "https://drive.google.com/file/d/review-only/view",
    Thumbnail_URL: "https://media.chicagoshining.com/studio/previews/thumbnails/example/cover-9x16.png",
  },
};

test("Factory review discovery includes explicitly review-sent Do Not Publish rows", () => {
  // Airtable's independent review lane must find outputs not in the capped
  // main queue, even if their publishing flag stays held.
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /AND\(\{Do_Not_Publish\},\{Output_Status\}="Ready for Review",\{Review_Status\}="Review Sent"\)/);
  assert.doesNotMatch(OPS_QUEUE_REVIEW_FORMULA, /AND\(\{Do_Not_Publish\},\{Studio_Render_Review_Hold_Active\}/);
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /\{Test_Run_ID\}=BLANK\(\)/);
});

test("Review-held finished videos are visible for inspection without releasing publishing hold", () => {
  const packageStatus = evaluateReviewPackage(heldVideo);
  assert.equal(packageStatus.readiness, "READY");
  const visibility = factoryReviewVisibility(heldVideo, packageStatus, "Ready for Review", true);
  assert.equal(visibility.visible, true);
  const row = {
    kind: "output",
    id: heldVideo.id,
    output_id: 9831,
    studio_state: "Ready for Review",
    output_status: "Ready for Review",
    review_status: "Review Sent",
    render_status: "Rendered",
    review_package_ready: visibility.visible,
    do_not_publish: true,
    profile_id: "recT2rbKX3MF7cVFU",
  };
  const factory = partitionFactoryLanes([row]);
  assert.equal(factory.summary.needs_eyes, 1);
  assert.equal(factory.lanes.needs_eyes[0].do_not_publish, true);

  // Keep the independent human-approval guard. Neither listing nor counting
  // a held record authorizes Approve, batch approval, scheduling, or publishing.
  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  const guard = ui.slice(ui.indexOf("function canReviewActions("), ui.indexOf("function canDelete("));
  assert.match(guard, /card\.review_hold_active === true \|\| card\.do_not_publish === true/);
});

test("Changes Requested and unfinished reviews are not added to the held-review discovery branch", () => {
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /\{Review_Status\}="Review Sent"/);
  assert.doesNotMatch(OPS_QUEUE_REVIEW_FORMULA, /\{Review_Status\}="Changes Requested"/);
  const changed = {
    ...heldVideo,
    fields: { ...heldVideo.fields, Review_Status: "Changes Requested" },
  };
  assert.equal(evaluateReviewPackage(changed).readiness, "IN_PROGRESS");
  const visibility = factoryReviewVisibility(changed, evaluateReviewPackage(changed), "Ready for Review", true);
  assert.equal(visibility.visible, false);
});
