import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

await import("./assets/pipeline-schedule-grid-0622.js");
const grid = globalThis.PipelineScheduleGrid;

test("seven-day window starts at local midnight and has seven columns", () => {
  const now = new Date(2026, 8, 21, 20, 5, 0, 0);
  const window = grid.sevenDayWindow(now);
  assert.equal(window.days.length, 7);
  assert.equal(window.start.getHours(), 0);
  assert.equal(window.start.getMinutes(), 0);
  assert.equal(grid.dayKey(window.days[0]), "2026-09-21");
  assert.equal(grid.dayKey(window.days[6]), "2026-09-27");
});

test("aggregate counts scheduled outputs by local 30-minute slot and platform", () => {
  const now = new Date(2026, 8, 21, 10, 0, 0, 0);
  const window = grid.sevenDayWindow(now);
  const records = [
    { id: "a", platform: "Instagram", scheduled_post_date: new Date(2026, 8, 21, 15, 5).toISOString() },
    { id: "b", platform: "Instagram", scheduled_post_date: new Date(2026, 8, 21, 15, 45).toISOString() },
    { id: "c", platform: "TikTok", scheduled_post_date: new Date(2026, 8, 21, 15, 30).toISOString() },
    { id: "d", platform: "YouTube", scheduled_post_date: new Date(2026, 8, 28, 1, 0).toISOString() },
  ];
  const cells = grid.aggregate(records, window);
  const threePm = cells.get(grid.slotKey(new Date(2026, 8, 21, 15, 0)));
  const threeThirty = cells.get(grid.slotKey(new Date(2026, 8, 21, 15, 30)));
  assert.equal(threePm.total, 1);
  assert.equal(threePm.platforms.Instagram, 1);
  assert.equal(threeThirty.total, 2);
  assert.equal(threeThirty.platforms.Instagram, 1);
  assert.equal(threeThirty.platforms.TikTok, 1);
  assert.equal(cells.size, 2);
});

test("platform abbreviations are stable", () => {
  assert.equal(grid.platformCode("Instagram"), "IG");
  assert.equal(grid.platformCode("Facebook"), "FB");
  assert.equal(grid.platformCode("TikTok"), "TT");
  assert.equal(grid.platformCode("YouTube"), "YT");
});


test("Pipeline schedule overview defaults collapsed", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  assert.match(html, /pipeline-schedule-overview pipeline-schedule-collapsed/);
  assert.match(html, /id="pipelineScheduleGridToggle" aria-expanded="false"[^>]*>Expand<\/button>/);
  assert.match(app, /let pipelineScheduleGridOpen = false/);
});


test("manual schedule overrides require an explicit save", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  assert.match(app, /data-pipeline-schedule-save/);
  assert.match(app, /manual_schedule_override:\s*true/);
  assert.match(app, /pipelineScheduleDirty\.add\(id\)/);
  assert.match(app, /Unsaved — click Save/);
  assert.match(app, /function creativeCanSetSchedule/);
  assert.match(app, /Manual schedule overrides are kept exactly as entered/);
  assert.doesNotMatch(app, /input\.addEventListener\("change",[\s\S]{0,240}savePipelineScheduleInput/);
  assert.doesNotMatch(app, /creativeScheduleAt"\)\?\.addEventListener\("keydown"/);
  assert.match(html, /id="creativeScheduleAt"[\s\S]{0,200}id="creativeSaveSchedule"/);
});

test("automatic scheduling uses wider weekly spacing", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  assert.match(app, /PIPELINE_SCHEDULE_GAP_MS = 3 \* 60 \* 60 \* 1000/);
  assert.match(app, /spread across the week/);
});


test("Pipeline calendar supports drag/drop scheduling with full output identity tooltips", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  assert.match(html, /Drag-and-drop publishing calendar/);
  assert.match(html, /id="pipelineScheduleGridMessage"[^>]*aria-live="polite"/);
  assert.match(html, /Hover or focus a bubble to see its full Platform Output name and ID/);
  assert.match(app, /function savePipelineScheduleFromGrid/);
  assert.match(app, /data-pipeline-schedule-entry/);
  assert.match(app, /data-pipeline-schedule-drop/);
  assert.match(app, /Platform Output ID/);
  assert.match(app, /phase6BindTooltipTarget\(button, tooltip\)/);
  assert.match(app, /event\.dataTransfer\.setData\("text\/plain", id\)/);
  assert.match(app, /manual_schedule_override:\s*true/);
  assert.match(app, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(app, /pipelineUnscheduledScheduleRecords/);
});

test("30-minute schedule grid exposes slot helpers", () => {
  const day = new Date(2026, 8, 21, 0, 0, 0, 0);
  assert.equal(grid.slotDate(day, 31).getHours(), 15);
  assert.equal(grid.slotDate(day, 31).getMinutes(), 30);
  assert.match(grid.slotKey(new Date(2026, 8, 21, 15, 47)), /-15-30$/);
});
