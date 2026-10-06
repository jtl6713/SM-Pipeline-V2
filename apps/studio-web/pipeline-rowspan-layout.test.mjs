import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-0625.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("Pipeline content cell spans all platform outputs", () => {
  assert.match(app, /item4-0\.6\.514-pipeline-mobile-scroll/);
  assert.match(app, /class="pipeline-content-cell" rowspan="\$\{rowSpan\}"/);
  assert.match(app, /pipelineRow\(row, group\.records, index === 0 \? contentCell : ""\)/);
  assert.match(app, /pipeline-content-card/);
  assert.match(app, /pipeline-content-thumb/);
  assert.match(app, /Schedule \(Your Time\)/);
});

test("Repeated schedule guidance is hidden while suggestion hooks remain", () => {
  assert.match(app, /pipeline-schedule-hidden-meta/);
  assert.match(app, /data-pipeline-schedule-suggest=/);
  assert.match(app, /data-pipeline-use-suggested=/);
  assert.match(css, /\.pipeline-schedule-hidden-meta\{display:none!important\}/);
});

test("Row-spanned mockup styling defines content, platform, status, progress, schedule, actions", () => {
  assert.match(css, /PIPELINE_ROWSPAN_MOCKUP_0_6_509/);
  assert.match(css, /pipeline-content-card/);
  assert.match(css, /pipeline-content-package\[data-pipeline-tone="approved"\]/);
  assert.match(css, /pipeline-content-title/);
  assert.match(css, /pipeline-profile-pill/);
});
