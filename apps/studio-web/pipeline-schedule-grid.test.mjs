import test from "node:test";
import assert from "node:assert/strict";

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

test("aggregate counts scheduled outputs by local hour and platform", () => {
  const now = new Date(2026, 8, 21, 10, 0, 0, 0);
  const window = grid.sevenDayWindow(now);
  const records = [
    { id: "a", platform: "Instagram", scheduled_post_date: new Date(2026, 8, 21, 15, 5).toISOString() },
    { id: "b", platform: "Instagram", scheduled_post_date: new Date(2026, 8, 21, 15, 45).toISOString() },
    { id: "c", platform: "TikTok", scheduled_post_date: new Date(2026, 8, 21, 15, 30).toISOString() },
    { id: "d", platform: "YouTube", scheduled_post_date: new Date(2026, 8, 28, 1, 0).toISOString() },
  ];
  const cells = grid.aggregate(records, window);
  const cell = cells.get(grid.cellKey(new Date(2026, 8, 21, 15, 0)));
  assert.equal(cell.total, 3);
  assert.equal(cell.platforms.Instagram, 2);
  assert.equal(cell.platforms.TikTok, 1);
  assert.equal(cells.size, 1);
});

test("platform abbreviations are stable", () => {
  assert.equal(grid.platformCode("Instagram"), "IG");
  assert.equal(grid.platformCode("Facebook"), "FB");
  assert.equal(grid.platformCode("TikTok"), "TT");
  assert.equal(grid.platformCode("YouTube"), "YT");
});
