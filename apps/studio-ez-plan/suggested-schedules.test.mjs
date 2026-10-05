import assert from "node:assert/strict";
import test from "node:test";

import {
  SUGGESTED_HORIZON_DAYS,
  addCivilDays,
  buildSuggestedScheduleMap,
  chicagoDateTimeParts,
  chicagoWallToUtcMs,
  civilKey,
  listHorizonCivils,
  planScheduleItems,
  suggestedChicagoIso,
} from "./suggested-schedules.mjs";

const SATURDAY_EVENING = new Date("2026-09-05T19:35:00-05:00");

function civilFromIso(iso) {
  const parts = chicagoDateTimeParts(new Date(iso));
  return civilKey(parts.year, parts.month, parts.day);
}

test("suggested windows use Chicago time, not UTC wall clock", () => {
  const iso = suggestedChicagoIso(["11:00-13:00"], SATURDAY_EVENING);
  assert.equal(iso, "2026-09-06T16:00:00.000Z");
});

test("preferred weekdays can land later than tomorrow inside 7 days", () => {
  const iso = suggestedChicagoIso(["11:00-13:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
  });
  assert.equal(civilFromIso(iso), "2026-09-08");
  assert.equal(iso, "2026-09-08T16:00:00.000Z");
});

test("a packed today and tomorrow moves the suggestion later in the 7-day horizon", () => {
  const chicago = chicagoDateTimeParts(SATURDAY_EVENING);
  const occupiedMs = [];
  for (let i = 0; i < 2; i++) {
    const civil = i === 0
      ? { year: chicago.year, month: chicago.month, day: chicago.day }
      : addCivilDays(chicago.year, chicago.month, chicago.day, i);
    occupiedMs.push(chicagoWallToUtcMs(civil.year, civil.month, civil.day, 11, 0));
    occupiedMs.push(chicagoWallToUtcMs(civil.year, civil.month, civil.day, 18, 0));
  }
  const iso = suggestedChicagoIso(["11:00-13:00", "18:00-21:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
    occupiedMs,
  });
  const horizon = new Set(listHorizonCivils(SATURDAY_EVENING).map((day) => day.key));
  assert.ok(horizon.has(civilFromIso(iso)));
  assert.notEqual(civilFromIso(iso), "2026-09-05");
  assert.notEqual(civilFromIso(iso), "2026-09-06");
  const ageDays = (Date.parse(iso) - SATURDAY_EVENING.getTime()) / 86400000;
  assert.ok(ageDays <= SUGGESTED_HORIZON_DAYS);
});

test("vertical video stamps stay in the 7-day window and spread across days", () => {
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
  const horizon = new Set(listHorizonCivils(SATURDAY_EVENING).map((day) => day.key));
  for (const iso of stamps.values()) {
    assert.ok(Date.parse(iso) > SATURDAY_EVENING.getTime());
    assert.ok(horizon.has(civilFromIso(iso)), `outside 7-day horizon: ${iso}`);
  }
  const mainDays = new Set([
    stamps.get("Instagram::Reel"),
    stamps.get("Facebook::Reel"),
    stamps.get("TikTok::Video Draft"),
    stamps.get("YouTube::Short"),
  ].map(civilFromIso));
  assert.ok(mainDays.size >= 2, "empty calendar should not park every platform on one day");
});

test("a busy non-preferred day does not beat an open analytics window", () => {
  const occupiedMs = [
    chicagoWallToUtcMs(2026, 9, 6, 11, 0),
    chicagoWallToUtcMs(2026, 9, 6, 18, 0),
    chicagoWallToUtcMs(2026, 9, 7, 11, 0),
  ];
  const iso = suggestedChicagoIso(["11:00-13:00", "18:00-21:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
    occupiedMs,
  });
  assert.equal(civilFromIso(iso), "2026-09-08");
  const parts = chicagoDateTimeParts(new Date(iso));
  assert.ok([11, 18].includes(parts.hour));
});

test("cross-platform crowding moves the next suggestion to a less crowded preferred day", () => {
  const occupiedMs = [chicagoWallToUtcMs(2026, 9, 8, 12, 0)];
  const iso = suggestedChicagoIso(["11:00-13:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
    occupiedMs,
    platformOccupiedMs: [],
  });
  assert.equal(civilFromIso(iso), "2026-09-09");
});

test("a booked preferred-day window moves the next suggestion later inside 7 days", () => {
  const occupiedMs = [chicagoWallToUtcMs(2026, 9, 8, 11, 0)];
  const iso = suggestedChicagoIso(["11:00-13:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
    occupiedMs,
    platformOccupiedMs: occupiedMs,
  });
  const horizon = new Set(listHorizonCivils(SATURDAY_EVENING).map((day) => day.key));
  assert.ok(horizon.has(civilFromIso(iso)));
  assert.notEqual(iso, "2026-09-08T16:00:00.000Z");
  assert.equal(iso, "2026-09-09T16:00:00.000Z");
});

test("a typed Reel time wins, and a Story may share that platform's wall-clock slot", () => {
  const stamps = buildSuggestedScheduleMap([
    { platform: "Instagram", output_type: "Reel", scheduled_at: "2026-09-06T21:00:00.000Z" },
    { platform: "Instagram", output_type: "Story" },
  ], {}, SATURDAY_EVENING);
  assert.equal(stamps.get("Instagram::Reel"), "2026-09-06T21:00:00.000Z");
  const story = Date.parse(stamps.get("Instagram::Story"));
  assert.ok(Number.isFinite(story));
  // Stories are exempt from the platform lane, so they are free to land on/near the Reel.
});

test("same-platform posts prefer different days before doubling up", () => {
  const first = suggestedChicagoIso(["12:00-13:00", "18:00-20:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
  });
  const second = suggestedChicagoIso(["12:00-13:00", "18:00-20:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
    occupiedMs: [Date.parse(first)],
    platformOccupiedMs: [Date.parse(first)],
  });
  assert.notEqual(civilFromIso(second), civilFromIso(first));
});

test("repeated suggestions rotate time windows as well as days", () => {
  const first = suggestedChicagoIso(["12:00-13:00", "18:00-20:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
  });
  const second = suggestedChicagoIso(["12:00-13:00", "18:00-20:00"], SATURDAY_EVENING, {
    days: ["Tue", "Wed", "Thu"],
    occupiedMs: [Date.parse(first)],
    platformOccupiedMs: [],
  });
  const firstParts = chicagoDateTimeParts(new Date(first));
  const secondParts = chicagoDateTimeParts(new Date(second));
  assert.notEqual(secondParts.hour, firstParts.hour);
});
