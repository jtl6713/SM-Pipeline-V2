import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-0625.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(here, "../studio-api/worker.js"), "utf8");

test("UI enables Save schedule for Ready for Review (Output 1795)", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.518-mae-28-day-schedule"/);
  assert.match(html, /UI build 0\.6\.518/);
  assert.match(html, /app-item4-0625\.js\?v=0\.6\.518-mae-28-day-schedule/);
  // setCreativeBusy must gate Save on creativeCanSetSchedule, not only approved reschedule.
  assert.match(
    app,
    /const canSaveSchedule = creativeCanSetSchedule\(\);\s*const canReschedule = creativeCanReschedule\(\);\s*if \(\$\("creativeSaveSchedule"\)\) \$\("creativeSaveSchedule"\)\.disabled = !canSaveSchedule;/
  );
  // After schedule POST, Save stays enabled for approvable outputs.
  assert.match(
    app,
    /const canSaveSchedule = creativeCanSetSchedule\(activeCreativeOutput\);\s*const canReschedule = creativeCanReschedule\(activeCreativeOutput\);\s*if \(saveBtn\) saveBtn\.disabled = !canSaveSchedule;/
  );
  // syncCreativeScheduleActions owns disabled + hidden for Save.
  assert.match(app, /save\.hidden = !canSave;\s*save\.disabled = !canSave;/);
  // Pipeline content view uses the same gate (not studio_state === Ready for Review alone).
  assert.match(app, /const editableSchedule = !publishedSchedule && creativeCanSetSchedule\(r\);/);
});

test("Worker keeps Ready for Review over Ready to Schedule until Approve", () => {
  assert.match(worker, /version: "0\.10\.466-mae-28-day-schedule"/);
  // Ready to Schedule / Ready to Publish must not be in approvedOrScheduledEarly.
  const block = worker.match(
    /A pre-filled Publish_Status of "Ready to Schedule"[\s\S]{0,400}const approvedOrScheduledEarly =([\s\S]{0,500}?);/
  );
  assert.ok(block, "approvedOrScheduledEarly block with Output 1795 comment");
  const early = block[1];
  assert.doesNotMatch(early, /ready to schedule/i);
  assert.doesNotMatch(early, /ready to publish/i);
  assert.match(early, /Review_Status", "approved"/);
  assert.match(early, /approved for publishing/);
});
