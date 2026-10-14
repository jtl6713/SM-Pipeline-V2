import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "../studio-web/index.html"), "utf8");

test("Worker heal auto-starts Prepare for timeline drafts stuck at None", () => {
  assert.match(worker, /function item4TimelineAutoPrepareEligible/);
  assert.match(worker, /async function item4HealTimelineAutoPrepare/);
  assert.match(worker, /idea-vo-timeline=/);
  assert.match(worker, /timeline-auto-prepare/);
  assert.match(worker, /item4HealTimelineAutoPrepare\(env, ctx\)/);
  assert.match(worker, /Studio_Variant_Status\}="None"/);
  assert.match(worker, /FIND\("idea-vo-timeline=",\{Production_Notes\}\)/);
  assert.match(worker, /version: "0\.10\.594-revision-lock-heal"/);
});

test("Production UI kicks Prepare once for timeline drafts with Ready plan and None variants", () => {
  assert.match(app, /item4TimelineAutoPrepareKicked/);
  assert.match(app, /function item4TimelineAutoPrepareEligibleUi/);
  assert.match(app, /function maybeAutoPrepareTimelineVariants/);
  assert.match(app, /maybeAutoPrepareTimelineVariants\(status\)/);
  assert.match(app, /prepareItem4Variants\(\{ autoRetry: false \}\)/);
  assert.match(app, /BUILD_ID = "item4-0.6.681-factory-open-targets"/);
  assert.match(html, /app-item4-1008\.js\?v=0\.6\.681-factory-open-targets/);
  assert.match(html, /UI build 0\.6\.681/);
});
