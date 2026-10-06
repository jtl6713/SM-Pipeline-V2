import assert from "node:assert/strict";
import test from "node:test";

import {
  isTikTokPostUrl,
  tiktokCompleteEligibility,
  tiktokManualPublishFields,
  tiktokMusicStatusFromChoice,
  tiktokNeedsUrlEntry,
} from "./tiktok-complete.mjs";

const waiting = {
  platform: "TikTok",
  do_not_publish: false,
  publish_status: "Publishing",
  output_status: "Approved",
  tiktok_draft_status: "Draft Delivered — Manual Action Required",
  manual_completion_status: "Required",
  studio_state: "Manual Action Required",
};

test("accepts live TikTok post URLs and rejects empty or off-platform links", () => {
  assert.equal(isTikTokPostUrl("https://www.tiktok.com/@chicago.shining/video/123"), true);
  assert.equal(isTikTokPostUrl("https://vm.tiktok.com/ZMabc/"), true);
  assert.equal(isTikTokPostUrl(""), false);
  assert.equal(isTikTokPostUrl("https://instagram.com/p/abc"), false);
});

test("Studio can record a URL while the draft is waiting for manual posting", () => {
  assert.equal(tiktokCompleteEligibility(waiting), null);
  assert.equal(tiktokNeedsUrlEntry(waiting), true);
  assert.equal(tiktokCompleteEligibility({ ...waiting, platform: "Facebook" }), "not_tiktok");
  assert.equal(tiktokCompleteEligibility({ ...waiting, do_not_publish: true }), "do_not_publish");
  assert.equal(tiktokCompleteEligibility({ ...waiting, publish_status: "Published" }), "already_published");
  assert.equal(tiktokCompleteEligibility({
    ...waiting,
    tiktok_draft_status: "Processing",
    manual_completion_status: "",
    studio_state: "Uploading",
  }), "manual_completion_not_required");
});

test("draft-delivered status is enough even if the helper flag is stale", () => {
  assert.equal(tiktokCompleteEligibility({
    ...waiting,
    manual_completion_status: "",
    studio_state: "Draft Delivered",
  }), null);
});

test("music choice maps the same labels TTD4 writes", () => {
  assert.equal(tiktokMusicStatusFromChoice("yes").status, "Completed Manually");
  assert.equal(tiktokMusicStatusFromChoice("not_requested").status, "Not Required");
  assert.equal(tiktokMusicStatusFromChoice("no").status, "Manual Action Required");
  assert.equal(tiktokMusicStatusFromChoice("", "Manual Action Required").status, "Manual Action Required");
});

test("publish fields mark the output Published with the TikTok URL", () => {
  const fields = tiktokManualPublishFields({
    url: "https://www.tiktok.com/@chicago.shining/video/9",
    now: "2026-09-06T13:00:00.000Z",
    existingNotes: "TTD3 sent",
    musicStatus: "Not Required",
  });
  assert.equal(fields.Platform_Post_URL, "https://www.tiktok.com/@chicago.shining/video/9");
  assert.equal(fields.Manual_Published_URL, "https://www.tiktok.com/@chicago.shining/video/9");
  assert.equal(fields.Publish_Status, "Published");
  assert.equal(fields.Output_Status, "Published");
  assert.equal(fields.TikTok_Draft_Status, "Published");
  assert.equal(fields.Manual_Completion_Status, "Completed");
  assert.match(fields.Output_Notes, /Studio TikTok publication confirmed/);
  assert.equal(fields.Publish_Retry_Eligible, false);
});
