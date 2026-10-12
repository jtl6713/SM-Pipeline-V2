import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "../studio-web");
const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
const app = fs.readFileSync(path.join(web, "assets/app-item4-1008.js"), "utf8");
const css = fs.readFileSync(path.join(web, "assets/styles-phase7-0621.css"), "utf8");

test("compact Pipeline build and cache bust stay aligned", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.613-photo-pipeline-fresh"/);
  assert.match(html, /UI build 0.6.613/);
  assert.match(html, /app-item4-1008\.js\?v=0.6.613-photo-pipeline-fresh/);
  assert.match(html, /styles-phase7-0621\.css\?v=0.6.613-photo-pipeline-fresh/);
  assert.match(css, /COMPACT_PIPELINE_V2_20261006/);
  assert.match(html, /home-density-0517\.css\?v=0.6.613-photo-pipeline-fresh/);
});

test("compact Pipeline exposes quick views, search, and advanced filters", () => {
  for (const view of ["all", "active", "rendering", "approval", "approved", "scheduled", "published", "failed", "attention"]) {
    assert.match(html, new RegExp(`data-pipeline-quick-view="${view}"`));
  }
  assert.match(html, /id="pipelineQuickSearch"/);
  assert.match(html, /id="pipelineAdvancedFilters"/);
  assert.match(html, /id="pipelineAdvancedFilterBody"/);
  assert.match(app, /function updatePipelineQuickTabs/);
  assert.match(app, /function renderPipelineAdvancedFilters/);
  assert.match(app, /filter === "rendering"/);
  assert.match(app, /filter === "approved"/);
  assert.match(app, /filter === "scheduled"/);
});

test("compact Pipeline keeps all operator actions wired", () => {
  assert.match(app, /data-pipeline-group-approve/);
  assert.match(app, /approvePipelineContentGroup/);
  assert.match(app, /data-pipeline-group-regenerate/);
  assert.match(app, /regeneratePipelineContentSchedule/);
  assert.match(app, /data-pipeline-schedule=/);
  assert.match(app, /data-pipeline-schedule-calendar=/);
  assert.match(app, /const saveTypedValue = \(\) =>/);
  assert.match(app, /saves automatically when you leave the field or press Enter/);
  assert.match(app, /data-pipeline-use-suggested=/);
  assert.match(app, /data-creative-output-id=/);
  assert.match(app, /pipeline-cover-download/);
  assert.match(app, /Open post ↗/);
  assert.match(app, /pipelineTiktokCompleteCell\(record\)/);
  assert.match(app, /pipelineYoutubeCompleteCell\(record\)/);
  assert.match(html, /id="pipelineApproveAll"/);
  assert.match(html, /id="pipelineScheduleGridToggle"/);
});

test("compact Pipeline preserves status detail instead of hiding workflow state", () => {
  assert.match(app, /function pipelineCompactStatusMarkup/);
  assert.match(app, /pipelineRenderLabel\(record\)/);
  assert.match(app, /record\?\.review_status/);
  assert.match(app, /pipelinePublishStatusLabel\(record\)/);
  assert.match(app, /pipeline-status-detail/);
  assert.match(app, /pipelineProgressCell\(r, groupRecords\)/);
  assert.match(app, /pipeline-compact-table/);
});

test("collapsed calendar and compact table are intentionally dense but responsive", () => {
  assert.match(css, /pipeline-schedule-collapsed \.pipeline-schedule-overview-heading/);
  assert.match(css, /pipeline-schedule-collapsed \.pipeline-schedule-unscheduled/);
  assert.match(css, /pipeline-compact-table/);
  assert.match(css, /pipeline-group-thumb/);
  assert.match(css, /pipeline-platform-pill/);
  assert.match(css, /pipeline-row-more-menu/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /PIPELINE_MOBILE_SCROLL_0_6_514/);
  assert.match(css, /#outputsList\{\s*overflow-x:auto;/);
});
