import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const overview = fs.readFileSync(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const start = app.indexOf("function pipelineApprovedExceptionKind(");
const end = app.indexOf("function pipelineFilterLabel(", start);
assert.ok(start >= 0 && end > start);
const classify = new Function(`${app.slice(start, end)}\nreturn pipelineApprovedExceptionKind;`)();

test("Home approved exceptions distinguish invalid, past-due, and future dates", () => {
  const now = Date.parse("2026-10-21T18:00:00Z");
  const base = { platform: "Instagram", review_status: "Approved", studio_state: "Scheduled", publish_status: "Ready to Publish" };
  assert.equal(classify({ ...base }, now), "approved_missing_date");
  assert.equal(classify({ ...base, scheduled_post_date: "invalid" }, now), "approved_missing_date");
  assert.equal(classify({ ...base, scheduled_at: "2026-10-22T18:00:00Z" }, now), "approved_missing_date");
  assert.equal(classify({ ...base, scheduled_post_date: "2026-10-21T18:00:00Z" }, now), "approved_past_due");
  assert.equal(classify({ ...base, scheduled_post_date: "2026-10-20T18:00:00Z" }, now), "approved_past_due");
  assert.equal(classify({ ...base, scheduled_post_date: "2026-10-22T18:00:00Z" }, now), "");
});

test("Do not show published or not finally approved outputs", () => {
  const base = { platform: "Facebook", review_status: "Approved", scheduled_post_date: "2020-01-01T00:00:00Z" };
  for (const exclusion of [
    { review_status: "Review Sent" }, { do_not_publish: true },
    { studio_state: "Published" }, { publish_status: "Published" },
    { platform_publish_status: "Posted" }, { manual_completion_status: "Completed" },
    { published_at: "2020-01-02T00:00:00Z" }, { platform_post_url: "https://example.com/post" },
    { manual_published_url: "https://example.com/post" }, { platform: "Unsupported" },
  ]) assert.equal(classify({ ...base, ...exclusion }), "", JSON.stringify(exclusion));
});

test("Home city-specific counts link to output-specific Pipeline filters", () => {
  assert.match(overview, /actionCount\(isTotal \? null : row, "approved_past_due"/);
  assert.match(overview, /actionCount\(isTotal \? null : row, "approved_missing_date"/);
  assert.match(overview, /window\.studioOpenPipelineFilter\(view, \{ profileId: profileId \|\| "" \}\)/);
  assert.match(app, /select\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(app, /showStudioPage\("outputs", \{ pipelineFilter:/);
  assert.match(app, /pipelineViewFilter === "approved_past_due" \|\| pipelineViewFilter === "approved_missing_date"/);
  assert.match(app, /return all\.filter\(\(record\) => pipelineRecordMatchesFilter\(record\)/);
  assert.match(html, /drilldown=approved-exceptions-v1/);
  assert.match(app, /if \(profileAtRequest !== selectedProfileId\) return;/);
  assert.match(app, /if \(pipelineViewFilter === "approved_past_due" \|\| pipelineViewFilter === "approved_missing_date"\) return true;/);
});
