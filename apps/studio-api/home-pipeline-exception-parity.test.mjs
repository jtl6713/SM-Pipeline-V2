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
