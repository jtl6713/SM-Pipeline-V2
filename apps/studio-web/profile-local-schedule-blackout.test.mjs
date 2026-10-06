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
  // en-CA DateTimeFormat yields YYYY-MM-DD.
  assert.equal(localDate, "2026-10-10");
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

test("conflict fallback re-picks MAE instead of walking into overnight blackout", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-03T12:00:00Z"); // 5:00 AM PDT, 5:30 still open
  const candidate = "2026-10-04T07:00:00Z"; // midnight PDT — blackout
  const occupied = [Date.parse(candidate)];
  const iso = plan.ezNextOpenScheduleIso(candidate, occupied, 3 * 60 * 60 * 1000, { timeZone: zone, now });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
});


test("scheduler uses same-day afternoon when morning is taken, not a second morning", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [Date.parse("2026-10-03T10:30:00Z")]; // 5:30 AM local
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  const local = localParts(iso, zone);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(iso));
  assert.equal(localDate, "2026-10-03");
  assert.equal(local.hour, 11);
  assert.equal(local.minute, 30);
});

test("scheduler skips occupied 5:30 to 11:30 the same day", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [
    Date.parse("2026-10-03T10:30:00Z"),
    Date.parse("2026-10-03T11:00:00Z"),
    Date.parse("2026-10-03T11:30:00Z"),
  ];
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 11);
  assert.equal(local.minute, 30);
});


test("another platform's morning pushes this post to the same-day afternoon", () => {
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
  assert.equal(localDay, "03");
  assert.equal(local.hour, 11);
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
    assert.ok(local.hour === 5 || local.hour === 11, `unexpected hour ${local.hour} for ${iso}`);
    if (local.hour === 5) assert.equal(local.minute, 30);
  }
  const photo = Date.parse(schedules.get("Facebook::Photo"));
  const reel = Date.parse(schedules.get("Facebook::Reel"));
  const story = Date.parse(schedules.get("Facebook::Story"));
  // Non-stories share one Facebook lane: Photo 5:30, Reel 11:30.
  assert.ok(Math.abs(photo - reel) >= 3 * 60 * 60 * 1000);
  const photoLocal = localParts(schedules.get("Facebook::Photo"), zone);
  const reelLocal = localParts(schedules.get("Facebook::Reel"), zone);
  assert.equal(photoLocal.hour, 5);
  assert.equal(reelLocal.hour, 11);
  // Stories may land on the same wall-clock slot as other Facebook outputs.
  assert.equal(story, photo);
});

test("Facebook and Instagram Stories may share a slot; other types share a platform lane", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const fb = plan.ezBuildSuggestedScheduleMap(
    ["Reel", "Story"].map((output_type) => ({ platform: "Facebook", output_type, scheduled_at: "" })),
    {},
    now,
    { timeZone: zone },
  );
  assert.equal(Date.parse(fb.get("Facebook::Story")), Date.parse(fb.get("Facebook::Reel")));

  const ig = plan.ezBuildSuggestedScheduleMap(
    ["Carousel", "Story"].map((output_type) => ({ platform: "Instagram", output_type, scheduled_at: "" })),
    {},
    now,
    { timeZone: zone },
  );
  assert.equal(Date.parse(ig.get("Instagram::Story")), Date.parse(ig.get("Instagram::Carousel")));

  // TikTok Video + Multi-Photo share the TikTok lane (no per-output-type escape).
  const tt = plan.ezBuildSuggestedScheduleMap(
    ["Video Draft", "Multi-Photo"].map((output_type) => ({ platform: "TikTok", output_type, scheduled_at: "" })),
    {},
    now,
    { timeZone: zone },
  );
  const ttVideo = localParts(tt.get("TikTok::Video Draft"), zone);
  const ttPhoto = localParts(tt.get("TikTok::Multi-Photo"), zone);
  assert.equal(ttVideo.hour, 11);
  assert.equal(ttVideo.minute, 30);
  assert.equal(ttPhoto.hour, 16);
  assert.equal(ttPhoto.minute, 30);
  assert.ok(Math.abs(Date.parse(tt.get("TikTok::Video Draft")) - Date.parse(tt.get("TikTok::Multi-Photo"))) >= 3 * 60 * 60 * 1000);
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


test("picker fills morning then afternoon then evening before the next day", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 4; i++) {
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
  assert.deepEqual(local.slice(0, 3), ["05:30", "11:30", "16:30"]);
  assert.equal(local[3], "05:30");
  assert.ok(picks.every((iso) => !plan.ezIsBlackoutLocalTime(Date.parse(iso), zone)));
});
