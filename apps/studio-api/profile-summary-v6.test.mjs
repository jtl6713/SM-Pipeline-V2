import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeOutputContribution, homeIdeaContribution, combineHomeContributions, homeApprovedUpcomingAt } from "./profile-summary-classification.mjs";
import { homeApprovedCalendarCounts } from "./home-approved-calendar-counts.mjs";
import { buildProfileSummaryV6Row, validProfileSummaryV6Rows, profileSummaryV6StaticParity } from "./profile-summary-v6.mjs";

const PROFILE = { id: "rec00000000000001", city_label: "Chicago", version: 7 };
const at = Date.parse("2026-10-20T12:00:00Z");
const approved = (platform, scheduled_post_date) => ({
  platform, scheduled_post_date, review_status: "Approved",
  output_status: "Approved for Publishing", studio_state: "Scheduled",
  publish_status: "Ready to Publish",
});
const pending = (platform) => ({
  platform, review_status: "Pending", output_status: "Ready for Review",
  studio_state: "Ready for Review", render_status: "Complete",
});
const cityIds = ["rec00000000000001", "rec00000000000002", "rec00000000000003", "rec00000000000004"];
const cityNames = ["Chicago", "New York", "Los Angeles", "Miami"];

function makeV6(rows, when = at, profile = PROFILE) {
  const contributions = rows.map((row) => homeOutputContribution(row, when));
  const counts = combineHomeContributions(contributions);
  const approvedEntries = rows.map((row, i) => ({
    approved_future_at: homeApprovedUpcomingAt(row),
    contribution: JSON.stringify(contributions[i]),
  })).filter((entry) => entry.approved_future_at > 0);
  return buildProfileSummaryV6Row(profile, counts, approvedEntries, when);
}

test("incremental ledger reproduces complete authoritative V6 calendar by output", () => {
  const rows = [
    approved("Instagram", "2026-10-20T12:01:00Z"),
    approved("Instagram", "2026-10-20T12:01:00Z"),
    approved("TikTok", "2026-10-20T11:59:00Z"),
    approved("Facebook", ""),
    approved("YouTube", "2026-10-22T15:00:00Z"),
    pending("Instagram"),
    pending("YouTube"),
    { ...approved("Facebook", "2026-10-22T15:00:00Z"), publish_status: "Published" },
  ];
  const row = makeV6(rows);
  const calendar = homeApprovedCalendarCounts(rows, at);
  assert.equal(row.approved_future, 3);
  assert.equal(row.approved_past_due, 1);
  assert.equal(row.approved_missing_date, 1);
  assert.equal(row.pipeline_total, 5);
  assert.equal(row.approval, 2);
  assert.deepEqual(row.approved_calendar_slots, calendar.slots);
  assert.deepEqual(row.approved_future_by_platform, calendar.future_by_platform);
  assert.deepEqual(row.awaiting_final_by_platform, calendar.awaiting_by_platform);
  assert.deepEqual(row.pipeline_by_platform, calendar.pipeline_by_platform);
  assert.equal(row.approved_unpublished, 5);
  assert.equal(profileSummaryV6StaticParity({
    ...row, scheduled: { ...row.scheduled },
  }, row), true);
});

test("future/past-due recompute from indexed timestamps, no mutation or scan", () => {
  const rows = [approved("Instagram", "2026-10-20T12:01:00Z")];
  const a = makeV6(rows, at);
  const b = makeV6(rows, at + 60_001);
  assert.equal(a.approved_future, 1);
  assert.equal(a.approved_past_due, 0);
  assert.equal(b.approved_future, 0);
  assert.equal(b.approved_past_due, 1);
  assert.deepEqual(a.approved_calendar_slots, b.approved_calendar_slots);
});

test("V6 read eligibility rejects absent platform fields and inconsistent totals", () => {
  const valid = cityIds.map((id, i) => makeV6([], at, {id, city_label: cityNames[i], version: 7}));
  assert.equal(validProfileSummaryV6Rows(valid), true);
  assert.equal(validProfileSummaryV6Rows(valid.slice(0, 3)), false);
  assert.equal(validProfileSummaryV6Rows(valid.map((row, i) => i ? row : { ...row, approved_calendar_slots: {} })), false);
  assert.equal(validProfileSummaryV6Rows(valid.map((row, i) => i ? row : { ...row, pipeline_total: 10 })), false);
  assert.equal(validProfileSummaryV6Rows(valid.map((row, i) => i ? row : { ...row, approved_missing_date: -1 })), false);
});

test("V6 reconciliation and snapshot are wired to the same ledger assembly", () => {
  const doSource = readFileSync(new URL("./profile-summary-do.mjs", import.meta.url), "utf8");
  const controller = readFileSync(new URL("./profile-summary-controller.mjs", import.meta.url), "utf8");
  assert.match(doSource, /buildProfileSummaryV6Row\(p, counters, approvedByProfile\.get\(p\.id\), now\)/);
  assert.match(doSource, /profileSummaryV6StaticParity\(expected, actual\)/);
  assert.match(doSource, /home_summary_contract/);
  assert.match(controller, /homeApprovedCalendarCounts\(mapped\)/);
  assert.match(controller, /validateStudioProfilesOverviewRows\(expectedRows, profiles\)/);
  assert.match(controller, /validProfileSummaryV6Rows\(summary\.records\)/);
});


test("durable V6 excludes emailed TikTok draft but preserves Manual Needed and unpublished", () => {
  const draft = {
    ...approved("TikTok", "2026-10-19T09:00:00Z"),
    studio_state: "Manual Action Required", manual_completion_status: "Required",
    tiktok_draft_status: "Draft Delivered — Manual Action Required",
    tiktok_draft_email_sent_at: "2026-10-20T09:10:00Z",
  };
  const stillDue = { ...draft, tiktok_draft_email_sent_at: null };
  const row = makeV6([draft, approved("Instagram", "2026-10-19T09:00:00Z")], at);
  assert.equal(row.approved_past_due, 1);
  assert.equal(row.approved_missing_date, 0);
  assert.equal(row.manual, 1);
  assert.equal(row.approved_unpublished, 2);
  assert.deepEqual(row.approved_calendar_slots.TikTok, []);
  assert.equal(makeV6([stillDue], at).approved_past_due, 1);
});
