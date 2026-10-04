import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

await import("./assets/platform-schedule-calendar-0924.js");
const calendar = globalThis.PlatformScheduleCalendar;
const here = path.dirname(fileURLToPath(import.meta.url));

test("calendar defaults to a rolling seven-day window starting Today", () => {
  const now = new Date(2026, 8, 24, 9, 15, 0, 0);
  const week = calendar.defaultWeek(now);
  assert.equal(week.days.length, 7);
  assert.equal(calendar.localDayKey(week.start), calendar.localDayKey(now));
  assert.equal(calendar.localDayKey(week.days[0]), calendar.localDayKey(now));
  assert.equal(calendar.inWindow(now, week), true);
  assert.equal(calendar.inWindow(calendar.addLocalDays(now, 7), week), false);
  assert.equal(week.start.getHours(), 0);
  assert.equal(week.end.getTime() > week.start.getTime(), true);
});

test("calendar groups platform posts into 30-minute slots", () => {
  const records = [
    { id: "one", platform: "Facebook", scheduled_post_date: new Date(2026, 9, 4, 10, 5).toISOString() },
    { id: "two", platform: "Facebook", scheduled_post_date: new Date(2026, 9, 4, 10, 45).toISOString() },
    { id: "three", platform: "Instagram", scheduled_post_date: new Date(2026, 9, 4, 10, 10).toISOString() },
  ];
  const slots = calendar.aggregateBySlot(records, "Facebook");
  assert.equal(slots.get(calendar.slotKey(new Date(2026, 9, 4, 10, 0))).length, 1);
  assert.equal(slots.get(calendar.slotKey(new Date(2026, 9, 4, 10, 30))).length, 1);
  assert.equal(slots.size, 2);
});

test("spacing warning reports the nearest same-platform post and ignores the edited output", () => {
  const candidate = new Date(2026, 9, 4, 15, 0);
  const records = [
    { id: "target", platform: "Facebook", scheduled_post_date: new Date(2026, 9, 4, 15, 0).toISOString() },
    { id: "near", platform: "Facebook", scheduled_post_date: new Date(2026, 9, 4, 14, 15).toISOString() },
    { id: "other-platform", platform: "Instagram", scheduled_post_date: new Date(2026, 9, 4, 14, 50).toISOString() },
  ];
  const warning = calendar.spacingWarning(candidate, records, "Facebook", "target");
  assert.equal(warning.record.id, "near");
  assert.match(warning.message, /45 minutes earlier/);
});

test("Platform Outputs expose a save-only calendar workflow", () => {
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const css = fs.readFileSync(path.join(here, "assets", "styles-phase7-0621.css"), "utf8");
  assert.match(html, /id="platformCalendarDialog"[^>]*role="dialog"/);
  assert.match(html, /id="platformCalendarSave"[^>]*>Save Schedule/);
  assert.match(html, /id="creativeScheduleCalendar"[^>]*>📅 Calendar/);
  assert.match(app, /data-pipeline-schedule-calendar/);
  assert.match(app, /manual_schedule_override:\s*true/);
  assert.match(app, /function openPlatformScheduleCalendar/);
  assert.match(app, /function savePlatformScheduleCalendar/);
  assert.match(app, /renderPlatformScheduleCalendar\(\{ scrollToHour: 0 \}\)/);
  assert.match(html, /id="platformCalendarDefaultWeek">Today<\/button>/);
  assert.match(app, /dayName = helper\.localDayKey\(day, workingStudioTimeZone\(\)\) === todayKey/);
  assert.match(app, /platformCalendarWeek = helper\.sevenDayWindow/);
  assert.match(css, /#platformCalendarWeekLabel \{[^}]*padding: 7px 11px;[^}]*border-radius: 10px;/);
  assert.match(css, /\.platform-calendar-table thead th \{[^}]*padding: 10px 10px;/);
  assert.match(css, /\.platform-calendar-day-date \{[^}]*margin-top: 4px;/);
  assert.doesNotMatch(app, /data-platform-calendar-slot[\s\S]{0,500}api\(/);
});


test("publish status labels follow schedule state", () => {
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  assert.match(app, /function pipelinePublishStatusLabel/);
  assert.match(app, /Needs Schedule/);
  assert.match(app, /Scheduled/);
  assert.match(app, /Ready to Publish/);
});


test("platform calendar week, slot keys, and slot dates use profile timezone", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-04T06:00:00Z"); // 11 PM on Oct 3 in Los Angeles
  const week = calendar.defaultWeek(now, zone);
  assert.equal(week.start.toISOString(), "2026-10-03T07:00:00.000Z");
  assert.equal(calendar.localDayKey(week.days[0], zone), "2026-10-03");
  const fourAm = calendar.slotDate(week.days[0], 8, zone);
  assert.equal(fourAm.toISOString(), "2026-10-03T11:00:00.000Z");
  assert.equal(calendar.slotKey(fourAm, zone), "2026-10-03-04-00");
});
