import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-0625.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

test("UI prefers Studio_Scheduled_At over occupancy-bumped Scheduled_Post_Date", () => {
  assert.match(app, /function studioEffectiveScheduleIso\(record\)/);
  assert.match(app, /record\?\.scheduled_at\s*\|\|\s*record\?\.scheduled_post_date/);
  assert.match(app, /studioOutputTimingLabel[\s\S]*studioEffectiveScheduleIso\(record\)/);
  assert.match(app, /creativeScheduleAt[\s\S]*studioEffectiveScheduleIso\(output\)/);
});

test("ops schedule form locks the exact operator time", () => {
  assert.match(app, /data-ops-schedule[\s\S]*manual_schedule_override:\s*true/);
});

test("build id and cache bust for yt schedule thumb handoff", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.380-branch-reconcile"/);
  assert.match(html, /app-item4-0625\.js\?v=0\.6\.380-branch-reconcile/);
});
