import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

test("Pipeline rows offer Publish Now for Ready to Publish outputs", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.576-pipeline-publish-now"/);
  assert.match(html, /UI build 0.6.576/);
  assert.match(app, /function pipelineCanPublishNow\(record\)/);
  assert.match(app, /if \(!creativeCanReschedule\(record\)\) return false/);
  assert.match(app, /publishing\|published/);
  assert.match(app, /return \/\^ready to publish\$\/i\.test\(pipelinePublishStatusLabel\(record\)\)/);
  assert.match(app, /data-pipeline-publish-now=/);
  assert.match(app, /scheduled_post_date: "immediate"/);
  assert.match(app, /publish_now: true/);
  assert.match(app, /\/api\/operations\/outputs\/\$\{encodeURIComponent\(recordId\)\}\/schedule/);
  assert.match(css, /#outputsList \.pipeline-actions-cell>\.pipeline-publish-now/);
});
