import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
await import("./assets/ez-plan.js");
const plan = globalThis.ChicagoShiningEzPlan;

function localParts(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

test("automatic suggestions use the first-priority morning window in each profile timezone", () => {
  const now = new Date("2026-10-03T08:00:00Z");
  for (const timeZone of ["America/Chicago", "America/New_York", "America/Los_Angeles"]) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone });
    const local = localParts(iso, timeZone);
    assert.equal(local.hour, 5);
    assert.equal(local.minute, 30);
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), timeZone), false);
  }
});

test("scheduler exhausts days 1-7 morning before using midday, then afternoon", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const firstSevenMornings = [];
  for (let day = 3; day <= 9; day++) {
    const dd = String(day).padStart(2, "0");
    firstSevenMornings.push(Date.parse(`2026-10-${dd}T10:30:00Z`)); // 5:30 AM CDT
  }
  const midday = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: firstSevenMornings });
  const local = localParts(midday, zone);
  assert.equal(local.hour, 11);
  assert.equal(local.minute, 30);

  const firstSevenMidday = [];
  for (let day = 3; day <= 9; day++) {
    const dd = String(day).padStart(2, "0");
    firstSevenMidday.push(Date.parse(`2026-10-${dd}T16:30:00Z`)); // 11:30 AM CDT
  }
  const afternoon = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    platformOccupiedMs: [...firstSevenMornings, ...firstSevenMidday],
  });
  const afternoonLocal = localParts(afternoon, zone);
  assert.equal(afternoonLocal.hour, 16);
  assert.equal(afternoonLocal.minute, 30);
});

test("scheduler moves to days 8-14 only after all three first-week passes are exhausted", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [];
  for (let day = 3; day <= 9; day++) {
    const dd = String(day).padStart(2, "0");
    occupied.push(Date.parse(`2026-10-${dd}T10:30:00Z`));
    occupied.push(Date.parse(`2026-10-${dd}T16:30:00Z`));
    occupied.push(Date.parse(`2026-10-${dd}T21:30:00Z`));
  }
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const local = localParts(iso, zone);
  assert.equal(localDate, "10/10/2026");
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
});

test("8 PM through 3:30 AM is a blackout in profile local time", () => {
  const zone = "America/New_York";
  const samples = [
    ["2026-10-04T00:00:00Z", true],  // 8:00 PM
    ["2026-10-04T07:30:00Z", true],  // 3:30 AM
    ["2026-10-04T07:31:00Z", false], // 3:31 AM
    ["2026-10-03T23:59:00Z", false], // 7:59 PM
  ];
  for (const [iso, expected] of samples) assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), expected);
});

test("conflict fallback advances out of overnight blackout", () => {
  const zone = "America/Los_Angeles";
  const candidate = "2026-10-04T02:00:00Z"; // 7:00 PM local
  const occupied = [Date.parse(candidate)];
  const iso = plan.ezNextOpenScheduleIso(candidate, occupied, 3 * 60 * 60 * 1000, { timeZone: zone });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 4);
  assert.equal(local.minute, 0);
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
});


test("scheduler uses 30-minute openings inside a priority window before dropping priorities", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [Date.parse("2026-10-03T10:30:00Z")]; // 5:30 AM local
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 6);
  assert.equal(local.minute, 0);
});

test("scheduler can use the inclusive end of each 90-minute priority window", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [
    Date.parse("2026-10-03T10:30:00Z"),
    Date.parse("2026-10-03T11:00:00Z"),
    Date.parse("2026-10-03T11:30:00Z"),
  ];
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 7);
  assert.equal(local.minute, 0);
});


test("scheduler balances the seven-day band before stacking a busier day", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupiedMs = [Date.parse("2026-10-03T10:30:00Z")];
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs,
    platformOccupiedMs: [],
  });
  const date = new Date(iso);
  const localDay = new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "2-digit" }).format(date);
  const local = localParts(iso, zone);
  assert.equal(localDay, "04");
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
});

test("earlier day wins when days have equal profile load", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: [],
    platformOccupiedMs: [],
  });
  const localDay = new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "2-digit" }).format(new Date(iso));
  assert.equal(localDay, "03");
});
