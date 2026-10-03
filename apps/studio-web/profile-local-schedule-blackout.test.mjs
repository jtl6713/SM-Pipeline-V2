import test from "node:test";
import assert from "node:assert/strict";

await import("./assets/ez-plan.js");
const plan = globalThis.window?.ChicagoShiningEzPlan || globalThis.ChicagoShiningEzPlan;

function localParts(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

test("automatic suggestions respect each profile local timezone", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  for (const timeZone of ["America/Chicago", "America/New_York", "America/Los_Angeles"]) {
    const iso = plan.ezPickBalancedSuggestedIso(["19:00-21:00"], now, { days: [], timeZone });
    const local = localParts(iso, timeZone);
    assert.equal(local.hour, 19);
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), timeZone), false);
  }
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
