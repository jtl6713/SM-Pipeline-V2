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

test("seven-day window can be anchored beyond the initial week", () => {
  const future = grid.sevenDayWindow(new Date(2026, 8, 28, 0, 0, 0, 0));
  assert.equal(grid.dayKey(future.days[0]), "2026-09-28");
  assert.equal(grid.dayKey(future.days[6]), "2026-10-04");
  const later = grid.sevenDayWindow(new Date(2026, 9, 5, 0, 0, 0, 0));
  assert.equal(grid.dayKey(later.days[0]), "2026-10-05");
  assert.equal(grid.dayKey(later.days[6]), "2026-10-11");
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
  assert.match(html, /id="pipelineScheduleGridToggle" aria-expanded="false"[^>]*>Show calendar<\/button>/);
  assert.match(app, /let pipelineScheduleGridOpen = false/);
});


test("manual schedule overrides mark dirty then autosave on change/blur/Enter", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  assert.match(app, /manual_schedule_override:\s*true/);
  assert.match(app, /pipelineScheduleDirty\.add\(id\)/);
  assert.match(app, /status\.textContent = "Unsaved"/);
  assert.match(app, /const saveTypedValue = \(\) =>/);
  assert.match(app, /input\.addEventListener\("change", \(\) => \{\s*markDirty\(\);\s*saveTypedValue\(\);/);
  assert.match(app, /input\.addEventListener\("blur", saveTypedValue\)/);
  assert.match(app, /function creativeCanSetSchedule/);
  assert.match(app, /Manual schedule overrides are kept exactly as entered/);
  assert.match(html, /id="creativeScheduleAt"[\s\S]{0,200}id="creativeSaveSchedule"/);
});

test("automatic scheduling uses wider weekly spacing", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  assert.match(app, /PIPELINE_SCHEDULE_GAP_MS = 3 \* 60 \* 60 \* 1000/);
  assert.match(app, /spread across the week/);
});

test("Pipeline occupancy is platform-wide except Stories may stack", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  assert.match(app, /function pipelineScheduleIsStory\(record\)/);
  assert.match(app, /\$\{platform\}::story:\$\{id\}/);
  assert.match(app, /TikTok Video and Slideshow cannot both take 5:30/);
  assert.match(app, /if \(pipelineScheduleIsStory\(record\)\)/);
  // Non-story outputs must return the bare platform key (not platform::outputType).
  assert.match(app, /return platform;\n  \}/);
  assert.doesNotMatch(app, /return platform && outputType \? `\$\{platform\}::\$\{outputType\}` : platform/);
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

test("platform legend checkboxes filter scheduled bubbles and ready tray without changing saved schedules", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  assert.match(html, /data-pipeline-schedule-platform-filter="instagram" checked/);
  assert.match(html, /data-pipeline-schedule-platform-filter="facebook" checked/);
  assert.match(html, /data-pipeline-schedule-platform-filter="tiktok" checked/);
  assert.match(html, /data-pipeline-schedule-platform-filter="youtube" checked/);
  assert.match(app, /const pipelineScheduleVisiblePlatforms = new Set\(PIPELINE_SCHEDULE_PLATFORM_KEYS\)/);
  assert.match(app, /function pipelineScheduleRecordVisible/);
  assert.match(app, /visibleRecords = \(Array\.isArray\(records\) \? records : \[\]\)\.filter\(pipelineScheduleRecordVisible\)/);
  assert.match(app, /pipelineUnscheduledScheduleRecords\(\)\.filter\(pipelineScheduleRecordVisible\)/);
  assert.match(app, /checkbox\.addEventListener\("change"/);
  assert.match(app, /renderPipelineScheduleGrid\(pipelineScheduleGridRecords\)/);
});

test("30-minute schedule grid exposes slot helpers", () => {
  const day = new Date(2026, 8, 21, 0, 0, 0, 0);
  assert.equal(grid.slotDate(day, 31).getHours(), 15);
  assert.equal(grid.slotDate(day, 31).getMinutes(), 30);
  assert.match(grid.slotKey(new Date(2026, 8, 21, 15, 47)), /-15-30$/);
});


test("default schedule suggestions start off, clear on untick, and do not hide ready outputs from the tray", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  // Header toggle retired: restore is a no-op; intelligent rolling-14-day scheduling stays on.
  assert.match(app, /function restorePipelineUseDefaultSchedules\(\) \{\s*\/\/ Header toggle retired/);
  assert.match(app, /function clearDefaultSchedulesFromUnapprovedRows/);
  assert.match(app, /pipelineScheduleDrafts\.delete\(record\.id\)/);
  assert.match(app, /pipelineScheduleDirty\.delete\(record\.id\)/);
  assert.match(app, /creativeCanApproveForPublishing\(record\) && !pipelineRowHasSchedule\(record\)/);
  assert.match(app, /\.filter\(\(record\) => !studioEffectiveScheduleIso\(record\)\)/);
  assert.match(app, /<strong>Ready to schedule<\/strong>/);
  assert.match(app, /if \(next === "outputs"\)[\s\S]{0,220}previous !== "outputs"[\s\S]{0,220}restorePipelineUseDefaultSchedules\(\)[\s\S]{0,120}clearDefaultSchedulesFromUnapprovedRows\(\)/);
});


test("platform colors are visually distinct and the ready tray stays visible while the grid is collapsed", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(here, "assets", "styles-phase7-0621.css"), "utf8");
  assert.match(html, /data-platform="instagram"><input[^>]*data-pipeline-schedule-platform-filter="instagram"[^>]*checked><b>IG<\/b>/);
  assert.match(html, /data-platform="facebook"><input[^>]*data-pipeline-schedule-platform-filter="facebook"[^>]*checked><b>FB<\/b>/);
  assert.match(html, /data-platform="tiktok"><input[^>]*data-pipeline-schedule-platform-filter="tiktok"[^>]*checked><b>TT<\/b>/);
  assert.match(html, /data-platform="youtube"><input[^>]*data-pipeline-schedule-platform-filter="youtube"[^>]*checked><b>YT<\/b>/);
  assert.match(css, /pipeline-schedule-entry\[data-platform="instagram"\][^\n]*border-color: #c13584/);
  assert.match(css, /pipeline-schedule-entry\[data-platform="facebook"\][^\n]*border-color: #1877f2/);
  assert.match(css, /pipeline-schedule-entry\[data-platform="tiktok"\][^\n]*border-color: #111827/);
  assert.match(css, /pipeline-schedule-entry\[data-platform="youtube"\][^\n]*border-color: #ff0000/);
  assert.match(css, /pipeline-schedule-legend input\[type="checkbox"\][^\n]*appearance: auto !important/);
  assert.match(css, /pipeline-schedule-collapsed \.pipeline-schedule-grid-scroll,[\s\S]{0,120}display: none/);
  assert.doesNotMatch(css, /pipeline-schedule-collapsed #pipelineScheduleGridBody \{ display: none; \}/);
});

test("global Pipeline calendar navigates across rolling seven-day windows", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(here, "assets", "styles-phase7-0621.css"), "utf8");
  assert.match(app, /let pipelineScheduleGridAnchorDate = null/);
  assert.match(app, /function shiftPipelineScheduleGridWindow\(days\)/);
  assert.match(app, /function resetPipelineScheduleGridWindow\(\)/);
  assert.match(app, /data-pipeline-schedule-window-shift="-7"/);
  assert.match(app, /data-pipeline-schedule-window-shift="7"/);
  assert.match(app, /data-pipeline-schedule-window-today/);
  assert.match(app, /pipelineScheduleGridAnchorDate instanceof Date/);
  assert.match(app, /loadPipelineScheduleGridWindow/);
  assert.match(app, /scheduleGeneration === pipelineScheduleGridLoadGeneration/);
  assert.match(html, /Use Previous 7 days, Today, or Next 7 days to move across the schedule/);
  assert.match(css, /\.pipeline-schedule-window-toolbar/);
  assert.match(css, /pipeline-schedule-collapsed \.pipeline-schedule-window-toolbar/);
  assert.match(css, /\.pipeline-schedule-window-range \{[^}]*padding: 7px 11px;[^}]*border-radius: 10px;/);
  assert.match(css, /\.pipeline-schedule-grid-table thead th \{[^}]*padding: 10px 10px;/);
  assert.match(css, /\.pipeline-schedule-day-date \{[^}]*margin-top: 4px;/);
});


test("calendar grid windows and slots use the selected profile timezone", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-04T06:00:00Z"); // 11 PM on Oct 3 in Los Angeles
  const window = grid.sevenDayWindow(now, zone);
  assert.equal(window.start.toISOString(), "2026-10-03T07:00:00.000Z");
  assert.equal(grid.dayKey(window.days[0], zone), "2026-10-03");
  const fourAm = grid.slotDate(window.days[0], 8, zone);
  assert.equal(fourAm.toISOString(), "2026-10-03T11:00:00.000Z");
  assert.equal(grid.slotKey(fourAm, zone), "2026-10-03-04-00");
});
