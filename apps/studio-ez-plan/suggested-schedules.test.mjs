import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSuggestedScheduleMap,
  planScheduleItems,
  suggestedChicagoIso,
} from "./suggested-schedules.mjs";

const SATURDAY_EVENING = new Date("2026-09-05T19:35:00-05:00");

test("suggested windows use Chicago time, not UTC wall clock", () => {
  const iso = suggestedChicagoIso(["11:00-13:00"], SATURDAY_EVENING);
  assert.equal(iso, "2026-09-06T16:00:00.000Z");
});

test("vertical video stamps Reels before Stories and keeps 90 minutes on the same platform", () => {
  const items = planScheduleItems({
    items: [
      { platform: "Instagram", output_type: "Reel" },
      { platform: "Facebook", output_type: "Reel" },
      { platform: "TikTok", output_type: "Video Draft" },
      { platform: "YouTube", output_type: "Short" },
    ],
    extras: ["Instagram::Story", "Facebook::Story"],
  });
  assert.deepEqual(items.map((item) => `${item.platform}::${item.output_type}`), [
    "Instagram::Reel",
    "Facebook::Reel",
    "TikTok::Video Draft",
    "YouTube::Short",
    "Instagram::Story",
    "Facebook::Story",
  ]);

  const stamps = buildSuggestedScheduleMap(items, {}, SATURDAY_EVENING);
  assert.equal(stamps.get("Instagram::Reel"), "2026-09-06T16:00:00.000Z");
  assert.equal(stamps.get("Facebook::Reel"), "2026-09-06T17:00:00.000Z");
  assert.equal(stamps.get("TikTok::Video Draft"), "2026-09-07T00:00:00.000Z");
  assert.equal(stamps.get("YouTube::Short"), "2026-09-06T19:00:00.000Z");
  assert.equal(stamps.get("Instagram::Story"), "2026-09-06T21:00:00.000Z");
  assert.equal(stamps.get("Facebook::Story"), "2026-09-06T21:00:00.000Z");
});

test("a typed Reel time wins, and a Story in the same window moves 90 minutes later", () => {
  const stamps = buildSuggestedScheduleMap([
    { platform: "Instagram", output_type: "Reel", scheduled_at: "2026-09-06T21:00:00.000Z" },
    { platform: "Instagram", output_type: "Story" },
  ], {}, SATURDAY_EVENING);
  assert.equal(stamps.get("Instagram::Reel"), "2026-09-06T21:00:00.000Z");
  assert.equal(stamps.get("Instagram::Story"), "2026-09-06T22:30:00.000Z");
});
