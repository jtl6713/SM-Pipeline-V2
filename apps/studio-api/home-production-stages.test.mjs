import test from "node:test";
import assert from "node:assert/strict";
import { homeOutputInProduction, homeOutputContribution, combineHomeContributions } from "./profile-summary-classification.mjs";

const active = (patch = {}) => ({
  id: "rec00000000000001",
  platform: "Instagram",
  studio_state: "In Production",
  output_status: "In Production",
  review_status: "",
  render_status: "Waiting in Render Queue",
  ...patch,
});

test("unfinished active platform output belongs to Production but not Factory", () => {
  const contribution = homeOutputContribution(active());
  assert.equal(homeOutputInProduction(active()), true);
  assert.equal(contribution.in_production, 1);
  assert.equal(contribution.awaiting_approval, 0);
});

test("incomplete Ready for Review remains in Production until Factory has a real package", () => {
  const missing = active({ output_status: "Ready for Review", studio_state: "Ready for Review", render_status: "Rendered" });
  assert.equal(homeOutputInProduction(missing), true);
  assert.equal(homeOutputContribution(missing).awaiting_approval, 0);
});

test("ready-to-review Factory output cannot be counted as still in Production", () => {
  const complete = active({
    output_status: "Ready for Review",
    review_status: "Review Sent",
    studio_state: "Ready for Review",
    render_status: "Rendered",
    output_caption: "Ready for human review",
    final_file_url: "https://media.chicagoshining.com/video.mp4",
    thumbnail_url: "https://media.chicagoshining.com/cover.jpg",
    studio_output_type: "Reel",
  });
  assert.equal(homeOutputContribution(complete).awaiting_approval, 1);
  assert.equal(homeOutputContribution(complete).in_production, 0);
});

test("exclude approved, failed, archived, and empty historical shells from Production", () => {
  for (const row of [
    active({ review_status: "Approved", output_status: "Approved for Publishing", studio_state: "Scheduled" }),
    active({ output_status: "Failed", studio_state: "Failed", render_status: "Failed" }),
    active({ output_status: "Published", studio_state: "Published" }),
    active({ output_status: "", studio_state: "" }),
    active({ output_status: "Skipped", studio_state: "Skipped" }),
    active({ do_not_publish: true }),
    active({ test_run_id: "smoke" }),
  ]) {
    assert.equal(homeOutputInProduction(row), false, JSON.stringify(row));
  }
});

test("per-output Production counters sum without inflating the Factory review lane", () => {
  const counters = combineHomeContributions([
    homeOutputContribution(active()),
    homeOutputContribution(active({ platform: "TikTok", output_status: "Ready for Render" })),
  ]);
  assert.equal(counters.in_production, 2);
  assert.equal(counters.awaiting_approval, 0);
});
