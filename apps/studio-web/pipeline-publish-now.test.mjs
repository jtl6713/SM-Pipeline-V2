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
  assert.match(app, /BUILD_ID = "item4-0.6.674-factory-content-send-back"/);
  assert.match(html, /UI build 0.6.674/);
  const gateStart = app.indexOf("function pipelineCanPublishNow(record)");
  const gateEnd = app.indexOf("function creativeCanSetSchedule", gateStart);
  const gate = app.slice(gateStart, gateEnd);
  assert.match(gate, /if \(!creativeCanReschedule\(record\)\) return false/);
  assert.match(gate, /publishing\|published/);
  assert.doesNotMatch(gate, /ready to publish/);
  assert.match(gate, /In Production/);
  assert.match(css, /nth-child\(6\)\{width:18%\}/);
  assert.match(app, /data-pipeline-publish-now=/);
  assert.match(app, /scheduled_post_date: "immediate"/);
  assert.match(app, /publish_now: true/);
  assert.match(app, /\/api\/operations\/outputs\/\$\{encodeURIComponent\(recordId\)\}\/schedule/);
  assert.match(css, /#outputsList \.pipeline-actions-cell>\.pipeline-publish-now/);
});
