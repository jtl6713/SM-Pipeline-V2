import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { homeOutputContribution, homeOverdueDueAt } from "./profile-summary-classification.mjs";
const worker = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
const classifier = fs.readFileSync(path.join(root, "apps/studio-api/profile-summary-classification.mjs"), "utf8");
const ui = fs.readFileSync(path.join(root, "apps/studio-web/assets/all-profiles-overview-1007.js"), "utf8");

test("profile overview includes overdue approved outputs separately from platform dispatch", () => {
  assert.match(worker, /overdue_unpublished: outputCounts.overdue_unpublished/);
  assert.match(worker, /overdue_unpublished: metrics.overdue_unpublished/);
  assert.ok(worker.includes("scheduled: studioOverviewScheduledCounts(mappedOutputs)"));
  const late = {
    id: "rec12345678901234", platform: "Instagram",
    studio_state: "Platform Processing", output_status: "Approved for Publishing",
    review_status: "Approved", scheduled_post_date: "2020-01-01T00:00:00Z",
    studio_publish_dispatch_at: "2020-01-01T00:00:01Z",
  };
  const contribution = homeOutputContribution(late);
  assert.equal(contribution.scheduled.Instagram, 0);
  assert.equal(contribution.overdue_unpublished, 1);
  assert.ok(homeOverdueDueAt(late) > 0);
  assert.equal(homeOutputContribution({ ...late, published_at: "2020-01-01T00:01:00Z" }).overdue_unpublished, 0);
});

test("awaiting approval is review-ready but not approved or rendering", () => {
  assert.match(classifier, /state !== "Ready for Review" && state !== "Awaiting Approval"/);
  assert.ok(classifier.includes('["approved", "rejected", "skipped"].includes(review)'));
  assert.ok(classifier.includes("ready for render|waiting in render queue"));
  const ready = { id: "rec12345678901234", studio_state: "Ready for Review",
    output_status: "Ready for Review", render_status: "Rendered", review_status: "" };
  assert.equal(homeOutputContribution(ready).awaiting_approval, 1);
  assert.equal(homeOutputContribution({ ...ready, render_status: "Queued" }).awaiting_approval, 0);
  assert.equal(homeOutputContribution({ ...ready, review_status: "Approved" }).awaiting_approval, 0);
});

test("parenthesized profile count uses all approved unpublished, not overdue or scheduled column sum", () => {
  assert.match(ui, /function approvedUnpublishedTotal\(row\)/);
  assert.match(ui, /approved_unpublished: Number\(row\.approved_unpublished\) \|\| 0/);
  assert.match(ui, /approved_unpublished"\]/);
  assert.doesNotMatch(ui, /scheduledTotal\(row\)/);
});
