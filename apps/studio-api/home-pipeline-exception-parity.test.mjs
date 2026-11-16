import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  homeApprovedExceptionKind,
  homeIsUnpublishedFailure,
  homeOutputContribution,
} from "./profile-summary-classification.mjs";
import { homeApprovedCalendarCounts } from "./home-approved-calendar-counts.mjs";

const now = Date.parse("2026-10-22T01:00:00Z");
const approved = {
  platform: "Facebook",
  review_status: "Approved",
  output_status: "Approved for Publishing",
  studio_state: "Approved",
  publish_status: "Ready to Schedule",
};
test("a failed LA Story belongs to Failed, not Approved No Date", () => {
  const LA = Array.from({length: 11}, (_,i) => ({
    ...approved, output_id: i + 1, publish_status: "Failed", scheduled_post_date: "",
  }));
  assert.equal(LA.filter(homeIsUnpublishedFailure).length, 11);
  assert.equal(LA.filter(x => homeApprovedExceptionKind(x, now)).length, 0);
  assert.equal(homeApprovedCalendarCounts(LA, now).missing_date, 0);
  assert.equal(LA.reduce((n,x) => n + homeOutputContribution(x, now).failed_outputs, 0), 11);
});
test("approved unscheduled and past-due records use one canonical predicate", () => {
  const missing = {...approved, scheduled_post_date: ""};
  const overdue = {...approved, scheduled_post_date: "2026-10-19T12:00:00Z"};
  const future = {...approved, scheduled_post_date: "2026-10-29T12:00:00Z"};
  const pending = {...overdue, platform_publish_status: "Published Pending Finalize"};
  const verified = {...pending, platform_post_url: "https://www.facebook.com/example/posts/123"};
  assert.equal(homeApprovedExceptionKind(missing, now), "approved_missing_date");
  assert.equal(homeApprovedExceptionKind(overdue, now), "approved_past_due");
  assert.equal(homeApprovedExceptionKind(pending, now), "approved_past_due");
  assert.equal(homeApprovedExceptionKind(future, now), "");
  assert.equal(homeApprovedExceptionKind(verified, now), "");
  const tally = homeApprovedCalendarCounts([missing, overdue, future, pending, verified], now);
  assert.equal(tally.missing_date, 1);
  assert.equal(tally.past_due, 2);
  assert.equal(tally.future, 1);
});
test("a Facebook Graph 368 cooldown leaves Past Due and Failed", () => {
  const story = {
    ...approved,
    platform_output_type: "Facebook Story",
    publish_status: "Failed",
    publish_error_stage: "FACEBOOK_STORY_RATE_LIMIT_368",
    scheduled_post_date: "2026-10-19T12:00:00Z",
  };
  const reel = { ...story, publish_error_stage: "FBS3_RATE_LIMIT" };
  const plain = { ...approved, publish_status: "Failed", scheduled_post_date: "2026-10-19T12:00:00Z" };
  assert.equal(homeApprovedExceptionKind(story, now), "");
  assert.equal(homeIsUnpublishedFailure(story), false);
  assert.equal(homeApprovedExceptionKind(reel, now), "");
  assert.equal(homeIsUnpublishedFailure(reel), false);
  assert.equal(homeIsUnpublishedFailure(plain), true);
  assert.equal(homeApprovedCalendarCounts([story, reel], now).past_due, 0);
});
test("a leftover carousel error stays out of Failed and Past Due until the publish status is terminal", () => {
  const queued = {
    ...approved,
    platform: "Instagram",
    publish_status: "Ready to Schedule",
    ig_carousel_error_message: "(#100) The parameter image_url is required.",
    scheduled_post_date: "2026-10-19T12:00:00Z",
    auto_publish_enabled: true,
    studio_publish_dispatch_count: 1,
  };
  const parked = { ...queued, publish_status: "Failed" };
  assert.equal(homeIsUnpublishedFailure(queued), false);
  assert.equal(homeApprovedExceptionKind(queued, now), "");
  assert.equal(homeIsUnpublishedFailure(parked), true);
  assert.equal(homeApprovedCalendarCounts([queued], now).past_due, 0);
});
test("an approved row with auto-publish off and no dispatch is not Past Due", () => {
  const manual = {
    ...approved,
    auto_publish_enabled: false,
    studio_publish_dispatch_count: 0,
    scheduled_post_date: "2026-10-19T12:00:00Z",
  };
  assert.equal(homeApprovedExceptionKind(manual, now), "");
  assert.equal(homeIsUnpublishedFailure(manual), false);
  assert.equal(homeApprovedCalendarCounts([manual], now).past_due, 0);
});
test("a public uploaded YouTube id leaves Past Due and a private id stays", () => {
  const live = {
    ...approved,
    platform: "YouTube",
    publish_status: "Publishing",
    scheduled_post_date: "2026-10-19T12:00:00Z",
    youtube_video_id: "z2cD65scT2M",
    youtube_upload_status: "Uploaded",
    youtube_privacy_status: "public",
  };
  const privateUpload = { ...live, youtube_privacy_status: "private" };
  const idOnly = { ...live, youtube_upload_status: "", youtube_privacy_status: "" };
  assert.equal(homeApprovedExceptionKind(live, now), "");
  assert.equal(homeApprovedCalendarCounts([live], now).past_due, 0);
  assert.equal(homeApprovedExceptionKind(privateUpload, now), "approved_past_due");
  assert.equal(homeApprovedExceptionKind(idOnly, now), "approved_past_due");
});
test("Failed excludes published evidence and publishing holds are not reapproved", () => {
  assert.equal(homeIsUnpublishedFailure({...approved, publish_status: "Failed",
    published_at: "2026-10-21T12:00:00Z"}), false);
  assert.equal(homeApprovedExceptionKind({...approved, do_not_publish: true}, now), "");
});
test("historic route and browser use Home's classifier, not newest-250 filtering", () => {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const api = fs.readFileSync(path.join(dirname, "worker-functions-03.mjs"), "utf8");
  const ui = fs.readFileSync(path.join(dirname, "../studio-web/assets/app-item4-1008.js"), "utf8");
  for(const mode of ["approved_past_due", "approved_missing_date", "failed"]) {
    assert.ok(api.includes('"' + mode + '"'));
    assert.ok(ui.includes('"' + mode + '"'));
  }
  assert.match(api, /homeApprovedExceptionKind\(output, observedAt\)/);
  assert.match(api, /homeIsUnpublishedFailure\(output\)/);
  assert.match(api, /focusedMode === "failed" \? row.home_failed/);
  assert.match(ui, /record\.home_failed/);
  assert.match(ui, /record\.home_exception_kind/);
  assert.match(ui, /const focusedMode = pipelineViewFilter/);
  assert.match(api, /filterFormula,\s+sortField: "Output_ID"/);
});
