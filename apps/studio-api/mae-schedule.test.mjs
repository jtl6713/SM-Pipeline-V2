import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAE_PRIORITY_SCHEDULE_WINDOWS,
  maeBuildSuggestedScheduleMap,
  maeIsBlackoutLocalTime,
  maeNextOpenScheduleIso,
  maePickBalancedSuggestedIso,
  maeTimeZoneFromTheme,
} from "./mae-schedule.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

function localParts(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

test("nyc and miami map to America/New_York", () => {
  assert.equal(maeTimeZoneFromTheme("nyc"), "America/New_York");
  assert.equal(maeTimeZoneFromTheme("miami"), "America/New_York");
  assert.equal(maeTimeZoneFromTheme("la"), "America/Los_Angeles");
});

test("MAE never stamps NYC midnight or 1 AM for YouTube/Instagram", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 12; i++) {
    const iso = maePickBalancedSuggestedIso([], now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    picks.push(iso);
    occupied.push(Date.parse(iso));
    assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false, iso);
    const local = localParts(iso, zone);
    assert.ok(
      (local.hour === 5 && local.minute === 30)
      || (local.hour === 11 && local.minute === 30)
      || (local.hour === 16 && local.minute === 30),
      `off MAE: ${iso} ${local.hour}:${String(local.minute).padStart(2, "0")}`,
    );
  }
  const hours = picks.map((iso) => localParts(iso, zone).hour);
  assert.ok(!hours.includes(0) && !hours.includes(1) && !hours.includes(20) && !hours.includes(23), hours.join(","));
});

test("Worker MAE fills morning then afternoon then evening on the same day", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const occupied = [];
  const locals = [];
  for (let i = 0; i < 4; i++) {
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    locals.push(localParts(iso, zone));
    occupied.push(Date.parse(iso));
  }
  assert.deepEqual(locals.slice(0, 3).map((part) => `${part.hour}:${String(part.minute).padStart(2, "0")}`), [
    "5:30",
    "11:30",
    "16:30",
  ]);
  assert.equal(locals[3].hour, 5);
  assert.equal(locals[3].minute, 30);
});

test("two TikToks take Monday morning then Monday afternoon, not two mornings", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z"); // 4:00 AM EDT Monday
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "TikTok", output_type: "Video Draft", scheduled_at: "" },
      { platform: "TikTok", output_type: "Multi-Photo", scheduled_at: "" },
    ],
    {},
    now,
    { timeZone: zone },
  );
  const first = localParts(stamps.get("TikTok::Video Draft"), zone);
  const second = localParts(stamps.get("TikTok::Multi-Photo"), zone);
  const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  assert.equal(first.hour, 5);
  assert.equal(first.minute, 30);
  assert.equal(second.hour, 11);
  assert.equal(second.minute, 30);
  assert.equal(dayOf(stamps.get("TikTok::Video Draft")), dayOf(stamps.get("TikTok::Multi-Photo")));
});

test("blackout 12 AM NY is replaced with the next MAE slot, not +3h", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z"); // 4:00 AM EDT, so 5:30 is still open
  const midnight = "2026-10-09T04:00:00.000Z"; // 12:00 AM EDT
  assert.equal(maeIsBlackoutLocalTime(Date.parse(midnight), zone), true);
  const iso = maeNextOpenScheduleIso(midnight, [], undefined, { timeZone: zone, now });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
  assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("Chicago 23:00 would display as NY 12:00 AM and is rejected as blackout in NY", () => {
  const chicagoLate = Date.parse("2026-10-09T04:00:00.000Z"); // 11 PM CDT / 12 AM EDT
  assert.equal(maeIsBlackoutLocalTime(chicagoLate, "America/New_York"), true);
  assert.equal(maeIsBlackoutLocalTime(chicagoLate, "America/Chicago"), true);
});

test("suggested map ignores industry 20:00 YouTube windows and uses MAE", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "YouTube", output_type: "Short", scheduled_at: "" },
      { platform: "Instagram", output_type: "Reel", scheduled_at: "" },
    ],
    {},
    now,
    { timeZone: zone },
  );
  for (const iso of stamps.values()) {
    const local = localParts(iso, zone);
    assert.equal(local.hour, 5);
    assert.equal(local.minute, 30);
    assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
  }
});

test("existing blackout stamps are not reused", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const stamps = maeBuildSuggestedScheduleMap(
    [{ platform: "YouTube", output_type: "Short", scheduled_at: "2026-10-09T04:00:00.000Z" }],
    {},
    now,
    { timeZone: zone },
  );
  const iso = stamps.get("YouTube::Short");
  assert.notEqual(iso, "2026-10-09T04:00:00.000Z");
  assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("Worker stamp paths use MAE not industry evening windows", () => {
  assert.match(worker, /from "\.\/mae-schedule\.mjs"/);
  assert.match(worker, /studio_mae_schedule_v1: true/);
  assert.match(worker, /0\.10\.446-timed-script-apply-remeasure/);
  assert.match(worker, /MAE_PRIORITY_SCHEDULE_WINDOWS/);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("function studioBuildSuggestedScheduleMap")),
    /studioIndustryBestWindows\(platform, outputType\);\s*const iso = studioPickBalancedSuggestedIso\(industry\.windows/,
  );
  assert.match(worker, /maeIsBlackoutLocalTime\(existingMs, timeZone\)/);
});
