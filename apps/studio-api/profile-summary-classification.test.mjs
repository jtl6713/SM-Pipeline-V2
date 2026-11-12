import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHomeContribution, homeOutputContribution, homeIdeaContribution,
  combineHomeContributions, homeContributionDelta, homeOverdueDueAt, homeApprovedUpcomingAt, homeApprovedUnpublished,
} from "./profile-summary-classification.mjs";

const base = {
  id: "rec00000000000001",
  platform: "Instagram",
  studio_state: "Ready for Review",
  output_status: "Ready for Review",
  review_status: "Pending",
  render_status: "Complete",
  publish_status: "",
};

test("review count is actionable, not merely Ready for Review state", () => {
  assert.equal(homeOutputContribution(base).awaiting_approval, 1);
  for (const patch of [
    { render_status: "Waiting in render queue" },
    { render_status: "Rendering" },
    { output_status: "Approved for Publishing" },
    { review_status: "Approved" },
    { do_not_publish: true },
    { output_notes: "origin=az-finished-video" },
  ]) assert.equal(homeOutputContribution({ ...base, ...patch }).awaiting_approval, 0);
  // Overview drops file URLs, so the shared label becomes Preparing Assets
  // while Output_Status is still Ready for Review.
  assert.equal(homeOutputContribution({
    ...base,
    studio_state: "Preparing Assets",
  }).awaiting_approval, 1);
  assert.equal(homeOutputContribution({
    ...base,
    studio_state: "Preparing Assets",
    review_status: "Approved",
  }).awaiting_approval, 0);
});

test("scheduled requires authorized undelivered platform dispatch", () => {
  const approved = {
    ...base, studio_state: "Scheduled", review_status: "Approved",
    output_status: "Approved for Publishing", scheduled_post_date: "2099-10-20T11:00:00Z",
  };
  assert.equal(homeOutputContribution(approved).scheduled.Instagram, 1);
  for (const patch of [
    { review_status: "Rejected" },
    { platform_post_url: "https://example.test/post" },
    { studio_publish_dispatch_count: 1 },
    { publish_status: "Published" },
    { do_not_publish: true },
  ]) assert.equal(homeOutputContribution({ ...approved, ...patch }).scheduled.Instagram, 0);
});

test("idea count excludes promoted or linked content", () => {
  const idea = { id: "rec00000000000002", content_item_links: [] };
  assert.equal(homeIdeaContribution(idea).ideas_not_in_production, 1);
  assert.equal(homeIdeaContribution({ ...idea, promoted_content_record_id: "recContent" }).ideas_not_in_production, 0);
  assert.equal(homeIdeaContribution({ ...idea, content_item_links: ["recContent"] }).ideas_not_in_production, 0);
  assert.equal(homeIdeaContribution({ ...idea, status: "Promoted" }).ideas_not_in_production, 0);
  assert.equal(homeIdeaContribution({ ...idea, status: "Generated" }).ideas_not_in_production, 1);
});

test("record contributions support correct reversible deltas and no double counting", () => {
  const before = homeOutputContribution(base);
  const after = homeOutputContribution({
    ...base, studio_state: "Scheduled", review_status: "Approved",
    output_status: "Approved for Publishing", scheduled_post_date: "2099-10-20T11:00:00Z",
  });
  const delta = homeContributionDelta(before, after);
  assert.equal(delta.awaiting_approval, -1);
  assert.equal(delta.scheduled.Instagram, 1);
  assert.equal(delta.platform_outputs, 0);
  const inverse = homeContributionDelta(after, before);
  assert.equal(inverse.awaiting_approval, 1);
  assert.equal(inverse.scheduled.Instagram, -1);
  const current = combineHomeContributions([before]);
  const transition = combineHomeContributions([current, delta]);
  assert.equal(transition.awaiting_approval, 0);
  assert.equal(transition.scheduled.Instagram, 1);
  assert.deepEqual(homeContributionDelta(after, after), emptyHomeContribution());
});

test("failed and manual counters remain distinct while attention includes both", () => {
  const failure = homeOutputContribution({ ...base, studio_state: "Failed" });
  const manual = homeOutputContribution({ ...base, studio_state: "Manual Action Required" });
  const totals = combineHomeContributions([failure, manual]);
  assert.equal(totals.failed_outputs, 1);
  assert.equal(totals.manual_action_required, 1);
  assert.equal(totals.attention_outputs, 2);
  assert.equal(totals.active_outputs, 1);
});

test("overdue unpublished survives dispatch, but disappears after publication", () => {
  const late = {
    ...base, studio_state: "Platform Processing", review_status: "Approved",
    output_status: "Approved for Publishing", scheduled_post_date: "2020-01-01T00:00:00Z",
    studio_publish_dispatch_count: 1,
  };
  assert.equal(homeOutputContribution(late).scheduled.Instagram, 0);
  assert.equal(homeOutputContribution(late).overdue_unpublished, 1);
  assert.ok(homeOverdueDueAt(late) > 0);
  assert.equal(homeOutputContribution({ ...late, platform_post_url: "https://example.test/post" }).overdue_unpublished, 0);
  assert.equal(homeOverdueDueAt({ ...late, publish_status: "Published" }), 0);
  assert.equal(homeOutputContribution({
    ...late, scheduled_post_date: "2099-01-01T00:00:00Z",
  }).overdue_unpublished, 0);
});

test("Home approval transfers one record into approved-unpublished regardless of schedule clock", () => {
  const now = Date.parse("2026-10-20T11:00:00Z");
  const ready = { ...base, render_status: "Rendered", review_status: "",
    studio_state: "Ready for Review" };
  const before = homeOutputContribution(ready, now);
  assert.equal(before.awaiting_approval, 1);
  for (const scheduled_post_date of [
    "2026-10-20T11:00:00Z", "2026-10-21T11:00:00Z",
    "2026-10-20T10:59:59Z", null, "", "bad-date",
  ]) {
    const approved = { ...ready, review_status: "Approved",
      output_status: "Approved for Publishing", studio_state: "Scheduled",
      scheduled_post_date };
    const after = homeOutputContribution(approved, now);
    assert.equal(after.approved_unpublished, 1, String(scheduled_post_date));
    assert.equal(after.awaiting_approval, 0);
    assert.equal(homeContributionDelta(before, after).approved_unpublished, 1);
    assert.equal(after.overdue_unpublished, Number(["2026-10-20T10:59:59Z", "2026-10-20T11:00:00Z"].includes(scheduled_post_date)));
  }
  const future = { ...ready, review_status: "Approved", scheduled_post_date: "2026-10-21T11:00:00Z" };
  for (const patch of [
    { review_status: "Pending", output_status: "Approved for Publishing" },
    { review_status: "", output_status: "Approved" },
    { review_status: "Rejected" },
    { do_not_publish: true },
    { published_at: "2026-10-19T11:00:00Z" },
    { platform_post_url: "https://example.test/post" },
    { publish_status: "Published" },
    { studio_state: "Published" },
    { manual_completion_status: "Completed" },
  ]) {
    assert.equal(homeOutputContribution({ ...future, ...patch }, now).approved_unpublished,
      0, JSON.stringify(patch));
  }
  // A schedule-only candidate helper may continue to support diagnostics;
  // it no longer defines the approved-but-unpublished tally.
  assert.equal(homeApprovedUpcomingAt({ ...future, scheduled_post_date: "" }), 0);
  assert.equal(homeApprovedUnpublished(future, Date.parse("2026-10-22T11:00:00Z")), true,
    "overdue still counts until publication");
});

test("TikTok/YouTube draft handoff does not silently erase approved-but-unpublished", () => {
  const now = Date.parse("2026-10-20T11:00:00Z");
  for (const platform of ["Instagram", "Facebook", "TikTok", "YouTube"]) {
    for (const state of ["Completed", "Succeeded", "Uploaded", "Draft Delivered"]) {
      const row = { ...base, platform, review_status: "Approved",
        output_status: "Approved for Publishing", studio_state: "Platform Processing",
        publish_status: "Ready to Schedule", platform_publish_status: state,
        scheduled_post_date: "2026-10-19T11:00:00Z", studio_publish_dispatch_count: 1 };
      assert.equal(homeOutputContribution(row, now).approved_unpublished, 1, platform + " " + state);
      for (const published of [
        { published_at: "2026-10-19T11:00:00Z" },
        { platform_post_url: "https://example.test/post" },
        { publish_status: "Published" },
        { platform_publish_status: "Published" },
      ]) assert.equal(homeOutputContribution({ ...row, ...published }, now).approved_unpublished, 0);
    }
  }
});

test("approval and publication leave unchanged future scheduled backlog", () => {
  const now = Date.parse("2026-10-20T11:00:00Z");
  const approved = { ...base, review_status: "Approved", output_status: "Approved for Publishing",
    studio_state: "Scheduled", scheduled_post_date: "2026-10-25T11:00:00Z" };
  const before = combineHomeContributions([
    homeOutputContribution(approved, now), homeOutputContribution(base, now),
  ]);
  const after = combineHomeContributions([
    homeOutputContribution({ ...approved, published_at: "2026-10-20T02:00:00Z" }, now),
    homeOutputContribution({ ...base, review_status: "Approved", output_status: "Approved for Publishing",
      studio_state: "Scheduled", scheduled_post_date: "2026-10-25T11:00:00Z" }, now),
  ]);
  assert.equal(after.awaiting_approval, before.awaiting_approval - 1);
  assert.equal(after.approved_unpublished, before.approved_unpublished);
});


test("TikTok emailed manual drafts leave only Past Due, not unpublished or Manual Needed",()=>{
 const now=Date.parse("2026-10-27T05:00:00Z");
 const base={id:"recTT000000000001",platform:"TikTok",studio_state:"Manual Action Required",
   review_status:"Approved",output_status:"Approved for Publishing",
   publish_status:"Ready to Publish",scheduled_post_date:"2026-10-25T05:00:00Z",
   tiktok_draft_status:"Draft Delivered — Manual Action Required",manual_completion_status:"Required"};
 const notSent=homeOutputContribution(base,now);
 assert.equal(notSent.overdue_unpublished,1);
 assert.equal(notSent.manual_action_required,1);
 const sent={...base,tiktok_draft_email_sent_at:"2026-10-25T05:10:00Z"};
 const ready=homeOutputContribution(sent,now);
 assert.equal(ready.overdue_unpublished,0);
 assert.equal(ready.manual_action_required,1);
 assert.equal(ready.approved_unpublished,1); // no claim of public publication
 assert.equal(homeOverdueDueAt(sent),0);
 const processing={...sent,tiktok_draft_status:"Processing"};
 assert.equal(homeOutputContribution(processing,now).overdue_unpublished,1);
 const failed={...sent,publish_status:"Failed",studio_state:"Failed"};
 assert.equal(homeOutputContribution(failed,now).failed_outputs,1);
 assert.equal(homeOutputContribution(failed,now).overdue_unpublished,0);
});


test("email-confirmed TikTok handoff is excluded from the V6 calendar AND missing-date bucket", () => {
  const at = Date.parse("2026-10-27T05:00:00Z");
  const row = {
    platform: "TikTok", review_status: "Approved",
    output_status: "Approved for Publishing", studio_state: "Manual Action Required",
    publish_status: "Ready to Publish", manual_completion_status: "Required",
    scheduled_post_date: "2026-10-26T09:30:00Z",
    tiktok_draft_status: "Draft Delivered — Manual Action Required",
    tiktok_draft_email_sent_at: "2026-10-27T01:05:11Z",
  };
  assert.equal(homeApprovedUpcomingAt(row), 0, "email handoff must not enter V6 calendar date index");
  const c = homeOutputContribution(row, at);
  assert.equal(c.approved_unpublished, 1, "a draft is not a public post");
  assert.equal(c.approved_missing_date, 0, "email handoff is not an undated approval");
  assert.equal(c.overdue_unpublished, 0, "email handoff is not Past Due");
  assert.equal(c.manual_action_required, 1);
  assert.equal(homeApprovedUpcomingAt({ ...row, tiktok_draft_email_sent_at: null }) > 0, true);
  assert.equal(homeOutputContribution({ ...row, tiktok_draft_email_sent_at: null }, at).overdue_unpublished, 1);
});
