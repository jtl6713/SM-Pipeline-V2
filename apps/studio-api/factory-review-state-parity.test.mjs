import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { formalFactoryApprovalReady, evaluateReviewPackage, factoryReviewVisibility } from "./review-package-readiness.mjs";
import { partitionFactoryLanes } from "./factory-desk.mjs";

const src = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const marker = "export function normalizedOutputState(record) {";
const end = "/*__STUDIO_WORKER_END:normalizedOutputState__*/";
const startAt = src.indexOf(marker), endAt = src.indexOf(end, startAt);
assert.ok(startAt > 0 && endAt > startAt, "read real Pipeline mapping function");
const normalize = vm.runInNewContext(
  src.slice(startAt, endAt).replace("export function normalizedOutputState", "function normalizedOutputState")
    + "\nnormalizedOutputState;",
  {
    formalFactoryApprovalReady,
    studioMixRerenderInProgress: () => false,
    studioOutputHasReviewableDeliverable: row =>
      Boolean(row?.fields?.Final_File_URL || row?.fields?.Studio_Preview_URL),
    studioOutputIsNativePhoto: row => row?.fields?.Render_Status === "Native Photo Route",
    studioNativeStillsNeedLettering: () => false,
    isActiveRemotionHold: () => false,
    isFacebookPublishRateLimitError: () => false,
    youtubeLiveQuotaOnly: () => false,
    youtubeManualActionRequired: () => false,
    isRealRemotionRetryFailure: () => false,
    f: (row, key) => row?.fields?.[key],
  },
);
const CDN = "https://media.chicagoshining.com/";
const video = (fields = {}, id = "recFF3lX5lJlzSTiw") => ({
  id,
  fields: {
    Output_Status: "Ready for Review",
    Review_Status: "Review Sent",
    Render_Status: "Rendered",
    Publish_Status: "Not Ready",
    Do_Not_Publish: false,
    Studio_Render_Review_Hold_Active: false,
    Platform: "Instagram",
    Studio_Output_Type: "Reel",
    Output_Caption: "Verified media for human review",
    Final_File_URL: "https://drive.google.com/file/d/example/view",
    Thumbnail_URL: CDN + "studio/previews/thumbnails/review/cover.jpg",
    ...fields,
  },
});
const native = (fields = {}, id = "recgR4qFFBNsKPJD6") => ({
  id,
  fields: {
    Output_Status: "Ready for Review",
    Render_Status: "Native Photo Route",
    Platform: "Facebook",
    Studio_Output_Type: "Multi-Image Post",
    Output_Caption: "Ready for photo review",
    Selected_Clip_Count: 2,
    "Carousel Slides": ["recA", "recB", "recC", "recD"],
    Selected_Assets_JSON: JSON.stringify({
      selected_clips: [
        { url: CDN + "studio/previews/lettered/a.jpg" },
        { url: CDN + "studio/previews/lettered/b.jpg" },
      ],
    }),
    Studio_Preview_URL: CDN + "studio/previews/lettered/a.jpg",
    Thumbnail_URL: CDN + "studio/previews/thumbnails/review/a.jpg",
    Do_Not_Publish: false,
    ...fields,
  },
});
test("both video and native-photo formal review labels map into actionable Factory Needs Eyes", () => {
  for (const record of [video(), native()]) {
    assert.equal(formalFactoryApprovalReady(record), true);
    const status = normalize(record);
    assert.equal(status, "Ready for Review");
    const readiness = evaluateReviewPackage(record);
    const visibility = factoryReviewVisibility(record, readiness, status, true);
    assert.equal(visibility.visible, true);
    const row = {
      id: record.id, kind: "output",
      studio_state: status,
      output_status: record.fields.Output_Status,
      render_status: record.fields.Render_Status,
      review_status: record.fields.Review_Status || "",
      publish_status: record.fields.Publish_Status || "",
      do_not_publish: false, review_hold_active: false,
      review_package_ready: visibility.visible,
      final_file_url: record.fields.Final_File_URL || null,
      thumbnail_url: record.fields.Thumbnail_URL || null,
    };
    assert.equal(partitionFactoryLanes([row]).summary.needs_eyes, 1);
  }
});
test("a finished file alone or stale Review Sent cannot advertise formal review", () => {
  for (const row of [
    video({ Output_Status: "Rendered" }),
    video({ Output_Status: "In Production" }),
    video({ Output_Status: "Changes Requested" }),
    video({ Output_Status: "Ready for Review", Review_Status: "Changes Requested" }),
    video({ Output_Status: "Ready for Review", Output_Caption: "" }),
    video({ Output_Status: "Ready for Review", Thumbnail_URL: "" }),
    video({ Output_Status: "Ready for Review", Render_Status: "Waiting in Render Queue" }),
    video({ Output_Status: "Ready for Review", Test_Run_ID: "test-123" }),
    native({ Output_Status: "Ready for Review", Output_Caption: "" }),
  ]) {
    assert.equal(formalFactoryApprovalReady(row), false, String(row.fields.Output_Status));
    assert.notEqual(normalize(row), "Ready for Review", JSON.stringify(row.fields));
  }
});
test("held or returned review does not appear as Pipeline Ready for Review; held outputs remain discoverable for explicit operator release", () => {
  for (const held of [
    video({ Do_Not_Publish: true }),
    video({ Studio_Render_Review_Hold_Active: true, Do_Not_Publish: true }),
  ]) {
    assert.equal(normalize(held), "Review Held");
    const ready = evaluateReviewPackage(held);
    const visible = factoryReviewVisibility(held, ready, normalize(held), true);
    assert.equal(visible.visible, true, "held review should still be visible for release or creative QA");
  }
  assert.equal(normalize(video({ Review_Status: "Changes Requested" })), "Changes Requested");
});
test("already approved or published outputs are never relabeled as review-ready", () => {
  assert.notEqual(normalize(video({ Review_Status: "Approved", Output_Status: "Approved for Publishing" })), "Ready for Review");
  assert.equal(normalize(video({ Publish_Status: "Published", Output_Status: "Published" })), "Published");
});
