import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homeApprovedCalendarCounts } from "./home-approved-calendar-counts.mjs";
import { homeOutputContribution } from "./profile-summary-classification.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worker = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
const ui = fs.readFileSync(path.join(root, "apps/studio-web/assets/all-profiles-overview-1007.js"), "utf8");
const index = fs.readFileSync(path.join(root, "apps/studio-web/index.html"), "utf8");
const at = Date.parse("2026-10-20T12:00:00Z");
const stampFuture = "2026-10-20T12:01:00Z";
const stampPast = "2026-10-20T11:59:00Z";
const approved = (platform, date, type="Reel") => ({
  id: "rec12345678901234", platform, platform_output_type:type,
  review_status:"Approved", studio_state:"Scheduled",
  output_status:"Approved for Publishing", publish_status:"Ready to Publish",
  scheduled_post_date:date,
});

test("calendar breakdown counts individual approved future outputs, including two formats on same platform", () => {
  const rows = [
    approved("Instagram", stampFuture, "Reel"),
    approved("Instagram", stampFuture, "Story"),
    approved("YouTube", stampFuture, "Short"),
    approved("TikTok", stampPast, "Draft"),
    approved("Facebook", "", "Story"),
  ];
  const c = homeApprovedCalendarCounts(rows, at);
  assert.equal(c.future,3);
  assert.deepEqual(c.future_by_platform, {Facebook:0,Instagram:2,TikTok:0,YouTube:1});
  assert.equal(c.past_due,1);
  assert.equal(c.missing_date,1);
  assert.equal(c.slots.Instagram.length,2);
});

test("same approved output moves from future to past due as clock passes without Airtable write", () => {
  const rows=[approved("Miami",stampFuture),approved("Instagram",stampFuture)];
  assert.equal(homeApprovedCalendarCounts(rows,at).future,1);
  assert.equal(homeApprovedCalendarCounts(rows,at+60000).future,0);
  assert.equal(homeApprovedCalendarCounts(rows,at+60000).past_due,1);
});

test("never count not-final-approved, published, excluded, or draft delivered as published", () => {
  const future=approved("Facebook",stampFuture);
  const rows=[
    future,
    {...future,review_status:"Pending"},
    {...future,studio_state:"Published"},
    {...future,published_at:stampPast},
    {...future,do_not_publish:true},
    {...future,platform_post_url:"https://example.com/post"},
  ];
  assert.equal(homeApprovedCalendarCounts(rows,at).future,1);
  const tiktok=approved("TikTok",stampFuture);
  assert.equal(homeApprovedCalendarCounts([{...tiktok,publish_status:"Draft Delivered"}],at).future,1);
});

test("past due includes approved output with failed platform dispatch, but not published records", () => {
  const late=approved("Instagram",stampPast);
  assert.equal(homeApprovedCalendarCounts([{...late,publish_status:"Failed"}],at).past_due,1);
  assert.equal(homeApprovedCalendarCounts([{...late,publish_status:"Published"}],at).past_due,0);
  assert.equal(homeOutputContribution(late).approved_unpublished,1);
});

test("Home uses platform-output timestamps, explicit future and past due columns, no parenthesized number", () => {
  assert.match(worker,/homeApprovedCalendarCounts\(mappedOutputs\)/);
  assert.match(worker,/approved_future_by_platform: calendar\.future_by_platform/);
  assert.match(worker,/approved_calendar_slots: calendar\.slots/);
  assert.match(ui,/studio\.allProfilesOverview\.v6/);
  assert.match(ui,/Approved · Future/);
  assert.match(ui,/Approved · Past Due/);
  assert.match(ui,/Approved · No Date/);
  assert.match(ui,/approvedCalendarCounts\(row, now = Date\.now\(\)\)/);
  assert.match(ui,/calendar\.pipelineByPlatform\[p\]/);
  assert.doesNotMatch(ui,/approvedUnpublishedTotal\(row\)/);
  assert.match(index,/all-profiles-overview-1007\.js\?v=.*cache=pipeline-future-review-v6/);
});

test("rendered awaiting human approval adds to future-output pipeline, not approved count", () => {
  const review=(platform, renderStatus="Rendered")=>({
    id:"rec12345678901234",platform,studio_state:"Ready for Review",
    output_status:"Ready for Review",render_status:renderStatus,
    review_status:"",publish_status:"",
  });
  const rows=[
    approved("Instagram",stampFuture),
    approved("Facebook",stampPast),
    review("Instagram"), review("YouTube"),
    review("TikTok","Queued"), review("Facebook","Rendering"),
  ];
  const c=homeApprovedCalendarCounts(rows,at);
  assert.equal(c.future,1);
  assert.equal(c.past_due,1);
  assert.equal(c.awaiting,2);
  assert.equal(c.pipeline_total,3);
  assert.deepEqual(c.pipeline_by_platform,{Facebook:0,Instagram:2,TikTok:0,YouTube:1});
  assert.deepEqual(c.awaiting_by_platform,{Facebook:0,Instagram:1,TikTok:0,YouTube:1});
  assert.equal(c.missing_date,0);
});
test("Home UI combines future and human-review per platform, not rendering queue",()=>{
  assert.match(worker,/awaiting_final_by_platform: calendar.awaiting_by_platform/);
  assert.match(worker,/pipeline_total: calendar.pipeline_total/);
  assert.match(ui,/Future \+ Review platform outputs/);
  assert.match(ui,/Pipeline · Total/);
  assert.match(ui,/Ideas Needed/);
  assert.match(ui,/const pipelineTotal = future \+ awaiting/);
  assert.match(ui,/Math.ceil\(Math.max\(0, 500 - pipelineTotal\) \/ 5\)/);
});
