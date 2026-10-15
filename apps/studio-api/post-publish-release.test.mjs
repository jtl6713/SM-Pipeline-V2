import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  POST_PUBLISH_RELEASE_COOLDOWN_MS,
  POST_PUBLISH_RELEASE_DRY_RUN_SETTING,
  collectPublishedR2CleanupKeys,
  contentGroupReadyForMediaRelease,
  contentItemDerivedDriveIds,
  dryRunFlagEnabled,
  evaluatePublishedOutputRelease,
  isFillCropAssetName,
  normalizeReleaseGroupState,
  postPublishReleaseCandidateFormula,
  publicMediaCleanupKey,
  publishedGroupCoolDownElapsed,
  publishedReleaseStampFields,
} from "./post-publish-release.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

function output(fields, id = "recOUT1") {
  return { id, fields };
}

test("health and cron advertise post-publish release", () => {
  assert.match(worker, /version: "0.10.609-supabase-phase3-stable"/);
  assert.match(worker, /studio_post_publish_release_v1: true/);
  assert.match(worker, /studioSweepPostPublishMediaRelease/);
  assert.match(worker, /releasePublishedOutputMedia/);
  assert.match(worker, /POST_PUBLISH_RELEASE_DRY_RUN_SETTING/);
});

test("low-urgency IG and native-photo heals are heavy-gated", () => {
  const scheduled = worker.slice(
    worker.indexOf("async scheduled(event, env, ctx)"),
    worker.indexOf("class HttpError")
  );
  const heavyGate = scheduled.indexOf("if (!cadence.heavy) return;");
  assert.ok(heavyGate > 0, "burn-kill light early-return missing");
  const afterHeavy = scheduled.slice(heavyGate);
  assert.match(afterHeavy, /studioHealIgCarouselTooManyChildren/);
  assert.match(afterHeavy, /studioHealNativePhotoReviewStrands/);
  assert.match(afterHeavy, /studioSweepPostPublishMediaRelease/);
  const beforeHeavy = scheduled.slice(0, heavyGate);
  assert.doesNotMatch(beforeHeavy, /studioHealIgCarouselTooManyChildren/);
  assert.doesNotMatch(beforeHeavy, /studioHealNativePhotoReviewStrands/);
  assert.doesNotMatch(beforeHeavy, /studioSweepPostPublishMediaRelease/);
});

test("cleanup keys include staged covers and skip branding", () => {
  assert.equal(
    publicMediaCleanupKey("https://media.chicagoshining.com/publish/platform-output-9/cover.jpg"),
    "publish/platform-output-9/cover.jpg"
  );
  assert.equal(
    publicMediaCleanupKey("https://media.chicagoshining.com/studio/previews/branding/chicagoshining-watermark.png"),
    ""
  );
  const keys = collectPublishedR2CleanupKeys(output({
    Studio_Preview_URL: "https://media.chicagoshining.com/studio/previews/recOUT1/current.mp4",
    Publish_Asset_URL: "https://media.chicagoshining.com/publish/platform-output-9/driveFinal.mp4",
    Thumbnail_URL: "https://media.chicagoshining.com/publish/platform-output-9/cover.jpg",
  }));
  assert.deepEqual(keys.sort(), [
    "publish/platform-output-9/cover.jpg",
    "publish/platform-output-9/driveFinal.mp4",
    "studio/previews/recOUT1/current.mp4",
  ].sort());
});

test("release stamp clears Drive, preview, publish pointers and optional blobs", () => {
  const fields = publishedReleaseStampFields({ clearBlobs: true });
  assert.equal(fields.Final_File_Storage_Status, "Released");
  assert.equal(fields.Studio_Preview_URL, null);
  assert.equal(fields.Publish_Asset_URL, null);
  assert.equal(fields.Selected_Assets_JSON, null);
  assert.equal(fields.Render_Clip_List_JSON, null);
  assert.equal("Published_At" in fields, false);
});

test("group ready requires Published/Skipped/Draft Delivered and excludes Scheduled", () => {
  assert.equal(normalizeReleaseGroupState(output({ Output_Status: "Published" })), "Published");
  assert.equal(normalizeReleaseGroupState(output({
    Output_Status: "Approved for Publishing",
    TikTok_Draft_Status: "Publish Complete",
  })), "Draft Delivered");
  assert.equal(contentGroupReadyForMediaRelease([
    output({ Output_Status: "Published" }),
    output({ Output_Status: "Skipped" }),
  ]), true);
  assert.equal(contentGroupReadyForMediaRelease([
    output({ Output_Status: "Published" }),
    output({ Output_Status: "Scheduled" }),
  ]), false);
});

test("cool-down waits 24h after latest Published_At", () => {
  const now = Date.parse("2026-10-11T12:00:00.000Z");
  const fresh = [
    output({ Published_At: "2026-10-11T00:00:00.000Z", Output_Status: "Published" }),
  ];
  const aged = [
    output({ Published_At: "2026-10-09T12:00:00.000Z", Output_Status: "Published" }),
  ];
  assert.equal(publishedGroupCoolDownElapsed(fresh, { now }), false);
  assert.equal(publishedGroupCoolDownElapsed(aged, { now }), true);
  assert.equal(POST_PUBLISH_RELEASE_COOLDOWN_MS, 24 * 60 * 60 * 1000);
});

test("evaluate refuses masters, incomplete groups, and cool-down", () => {
  const live = output({
    Published_At: "2026-10-01T12:00:00.000Z",
    Platform_Post_URL: "https://instagram.com/p/abc",
    Final_File_ID: "driveFinal1",
    Output_Status: "Published",
  });
  const master = evaluatePublishedOutputRelease(live, { masterDriveIds: ["driveFinal1"] });
  assert.equal(master.ok, false);
  assert.match(master.error, /ITEM4-MASTER|STUDIO_MASTER/);

  const incomplete = evaluatePublishedOutputRelease(live, {
    requireGroupComplete: true,
    siblingRecords: [
      live,
      output({ Output_Status: "Ready for Review" }, "recOUT2"),
    ],
    now: Date.parse("2026-10-11T12:00:00.000Z"),
  });
  assert.equal(incomplete.reason, "group_incomplete");

  const cooling = evaluatePublishedOutputRelease(live, {
    requireGroupComplete: true,
    siblingRecords: [live],
    now: Date.parse("2026-10-01T18:00:00.000Z"),
  });
  assert.equal(cooling.reason, "cool_down");

  const ok = evaluatePublishedOutputRelease(live, {
    requireGroupComplete: true,
    siblingRecords: [live],
    now: Date.parse("2026-10-11T12:00:00.000Z"),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.final_file_id, "driveFinal1");
});

test("fill-crop detector and VO drive ids", () => {
  assert.equal(isFillCropAssetName("Streeterville__9x16__fill-crop-v2.jpg"), true);
  assert.equal(isFillCropAssetName("Navy Pier 4"), false);
  assert.deepEqual(contentItemDerivedDriveIds(output({
    Voiceover_URL: "https://drive.google.com/file/d/voDrive1/view",
    Thumbnail_URL: "https://drive.google.com/uc?id=thumbDrive9",
  })), ["voDrive1", "thumbDrive9"]);
});

test("candidate formula and dry-run setting helpers", () => {
  const formula = postPublishReleaseCandidateFormula();
  assert.match(formula, /Published_At/);
  assert.match(formula, /Final_File_Storage_Status/);
  assert.equal(POST_PUBLISH_RELEASE_DRY_RUN_SETTING, "STUDIO_POST_PUBLISH_RELEASE_DRY_RUN");
  assert.equal(dryRunFlagEnabled("1"), true);
  assert.equal(dryRunFlagEnabled("off"), false);
});

test("desk inventory lists request fields[]", () => {
  assert.match(worker, /DESK_INVENTORY_OUTPUT_FIELDS/);
  assert.match(worker, /DESK_INVENTORY_REQUEST_FIELDS/);
  assert.match(worker, /fields: DESK_INVENTORY_OUTPUT_FIELDS/);
});
