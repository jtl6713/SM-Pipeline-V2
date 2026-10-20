import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHomeContribution, homeOutputContribution, homeIdeaContribution,
  combineHomeContributions, homeContributionDelta, homeOverdueDueAt,
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
});

test("scheduled requires authorized undelivered platform dispatch", () => {
  const approved = {
    ...base, studio_state: "Scheduled", review_status: "Approved",
    output_status: "Approved for Publishing", scheduled_post_date: "2026-10-20T11:00:00Z",
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
});

test("record contributions support correct reversible deltas and no double counting", () => {
  const before = homeOutputContribution(base);
  const after = homeOutputContribution({
    ...base, studio_state: "Scheduled", review_status: "Approved",
    output_status: "Approved for Publishing", scheduled_post_date: "2026-10-20T11:00:00Z",
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
