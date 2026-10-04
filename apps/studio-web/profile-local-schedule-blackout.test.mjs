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


test("widest-gap fallback never schedules beyond the rolling 14-day horizon", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const base = new Date(Date.UTC(2026, 9, 3 + dayOffset, 0, 0, 0));
    for (const hour of [10, 13, 16, 19, 22]) occupied.push(base.getTime() + hour * 60 * 60 * 1000);
  }
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
  });
  if (iso) {
    const horizonEnd = new Date("2026-10-17T05:00:00Z").getTime();
    assert.ok(Date.parse(iso) < horizonEnd);
  }
});


test("initial suggested schedule map honors the active Los Angeles profile timezone", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-04T06:00:00Z"); // 11 PM on Oct 3 in Los Angeles
  const items = ["Photo", "Reel", "Story"].map((output_type) => ({ platform: "Facebook", output_type, scheduled_at: "" }));
  const schedules = plan.ezBuildSuggestedScheduleMap(items, {}, now, { timeZone: zone });
  const values = [...schedules.values()];
  assert.equal(values.length, items.length);
  const localDate = (iso) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(iso)).reduce((out, part) => (out[part.type] = part.value, out), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  for (const iso of values) {
    const date = localDate(iso);
    const local = localParts(iso, zone);
    assert.ok(date >= "2026-10-03" && date < "2026-10-17", `outside 14-day profile horizon: ${iso} (${date})`);
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
    assert.equal(local.hour, 5);
    assert.equal(local.minute, 30);
  }
  for (let left = 0; left < values.length; left++) {
    for (let right = left + 1; right < values.length; right++) {
      assert.ok(Math.abs(Date.parse(values[left]) - Date.parse(values[right])) >= 3 * 60 * 60 * 1000);
    }
  }
});


test("existing automatic schedule inside LA blackout is replaced using LA profile time", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-04T17:00:00Z");
  const items = [{
    platform: "Facebook",
    output_type: "Story",
    scheduled_at: "2026-10-09T09:00:00.000Z", // 2:00 AM PDT — forbidden in LA.
  }];
  const schedules = plan.ezBuildSuggestedScheduleMap(items, {}, now, { timeZone: zone });
  const iso = schedules.get("Facebook::Story");
  assert.ok(iso);
  assert.notEqual(iso, items[0].scheduled_at);
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
});


test("strict profile-wide picker fills first 7-day morning pass before afternoon", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 8; i++) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    picks.push(iso);
    occupied.push(Date.parse(iso));
  }
  const local = picks.map((iso) => new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso)));
  assert.ok(local.slice(0, 7).every((value) => value >= "05:30" && value <= "07:00"), local.join(", "));
  assert.ok(local[7] >= "11:30", local.join(", "));
  assert.ok(picks.every((iso) => !plan.ezIsBlackoutLocalTime(Date.parse(iso), zone)));
});
