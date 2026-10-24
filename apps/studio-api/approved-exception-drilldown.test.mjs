import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homeApprovedCalendarCounts } from "./home-approved-calendar-counts.mjs";
import { readUiReleaseContract } from "../studio-web/ui-release-contract.mjs";
import { homeOutputContribution, homeApprovedUnpublished, homeOverdueDueAt } from "./profile-summary-classification.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(dir, "worker-functions-03.mjs"), "utf8");
const bundle = fs.readFileSync(path.join(dir, "../studio-web/assets/app-item4-1008.js"), "utf8");
const overview = fs.readFileSync(path.join(dir, "../studio-web/assets/all-profiles-overview-1007.js"), "utf8");
const html = fs.readFileSync(path.join(dir, "../studio-web/index.html"), "utf8");
const now = Date.parse("2026-10-21T23:59:00Z");
const base = { id: "rec12345678901234", platform: "Facebook",
  studio_state: "Approved", output_status: "Approved for Publishing",
  review_status: "Approved", publish_status: "Ready to Publish",
  scheduled_post_date: "" };

test("LA Facebook rate limit is counted in Failed, not ordinary No Date", () => {
  const row = { ...base, platform_output_type: "Story", publish_status: "Failed",
    studio_publish_dispatch_count: 8, publish_error_message: "Facebook rate limit (368)" };
  const metric = homeOutputContribution(row, now);
  const calendar = homeApprovedCalendarCounts([row], now);
  assert.equal(metric.failed_outputs, 1);
  assert.equal(metric.attention_outputs, 1);
  assert.equal(metric.approved_unpublished, 0);
  assert.equal(calendar.missing_date, 0);
  assert.equal(calendar.past_due, 0);
  assert.equal(homeApprovedUnpublished(row), false);
});

test("newly unscheduled approved Story remains No Date and not Failed", () => {
  const row = {...base, publish_status: "Ready to Schedule"};
  assert.equal(homeApprovedCalendarCounts([row],now).missing_date,1);
  assert.equal(homeOutputContribution(row,now).failed_outputs,0);
});

test("Facebook Pending Finalize stays overdue until authoritative public proof", () => {
  const row = { ...base, scheduled_post_date: "2026-10-14T10:00:00Z",
    publish_status: "Publishing", platform_publish_status: "Published Pending Finalize",
    platform_post_id: "831080826745798_122147173317022170" };
  assert.equal(homeApprovedCalendarCounts([row],now).past_due,1);
  assert.ok(homeOverdueDueAt(row) > 0);
  assert.equal(homeApprovedCalendarCounts([{...row,published_at:"2026-10-14T10:02:00Z"}],now).past_due,0);
});

test("specific deep-link bypasses newest-250 cache, profiles scoped, and never writes", () => {
  const start = worker.indexOf('const focusedMode = String(url.searchParams.get("mode")');
  const end = worker.indexOf('  // QA-PIPELINE-NEWEST-MISSING',start);
  assert.ok(start>=0 && end>start);
  const route = worker.slice(start,end);
  assert.match(route,/contentProfileFilterFormula\(profile\)/);
  assert.match(route,/studioPipelineContentIdsFromOutputs/);
  assert.match(route,/listRecords\(env, env\.AIRTABLE_OUTPUT_TABLE_ID/);
  assert.match(route,/read_source: "airtable"/);
  assert.match(route,/review.*Approved|Review_Status.*Approved/);
  assert.doesNotMatch(route,/(?:method:\s*["'](?:PATCH|POST|DELETE)|studioPublish|writeSupabase)/);
  const fetchPos = bundle.indexOf('const focused = await api("/api/outputs?mode=" + focusedMode');
  assert.ok(fetchPos > 0);
  assert.match(bundle.slice(fetchPos-380,fetchPos+950),/pipelineListExceptionScope = true/);
  assert.match(bundle,/pipelineListExceptionScope = false;/);
  assert.match(bundle,/clearPipelineColumnFilters\(\);[\s\S]{0,100}refreshPipelineOutputs\(\{ force: true \}\)/);
});

test("Home count cell keeps exact profile when navigating to Pipeline", () => {
  assert.match(overview,/studioOpenPipelineFilter\(view, \{ profileId: profileId \|\| "" \}\)/);
  assert.match(bundle,/window\.studioOpenPipelineFilter = \(filter, options = \{\}\)/);
  assert.match(bundle,/showStudioPage\("outputs", \{ pipelineFilter:/);
  const release=readUiReleaseContract(html,bundle);
  const asset=html.match(/\/assets\/all-profiles-overview-1007\.js\?[^"'<>]+/);
  assert.ok(asset,"Profile-scoped Home overview script must be included");
  assert.equal(new URL(asset[0],"https://studio.invalid").searchParams.get("v"),release.cacheKey);
});
