import assert from "node:assert/strict";
import test from "node:test";

import { industryBestWindows, planScheduleItems } from "./suggested-schedules.mjs";
import { buildAzCampaignSchedule, chicagoCivilFromMs } from "./az-schedules.mjs";

const SATURDAY_EVENING = new Date("2026-09-05T19:35:00-05:00");

function azItems() {
  return planScheduleItems({
    items: [
      { platform: "Instagram", output_type: "Reel" },
      { platform: "Facebook", output_type: "Reel" },
      { platform: "TikTok", output_type: "Video Draft" },
      { platform: "YouTube", output_type: "Short" },
    ],
    extras: ["Instagram::Story", "Facebook::Story"],
  });
}

test("AZ spreads package mains across several days; Stories may share a platform slot", () => {
  const { stamps, campaign } = buildAzCampaignSchedule(azItems(), { occupiedMs: [], now: SATURDAY_EVENING });
  assert.ok(campaign?.key);
  const mainDays = new Set(
    ["Instagram::Reel", "Facebook::Reel", "TikTok::Video Draft", "YouTube::Short"]
      .map((key) => chicagoCivilFromMs(Date.parse(stamps.get(key))).key),
  );
  assert.ok(mainDays.size >= 4, "main outputs should be spread across the 4-week window");

  // Stories are exempt from the platform lane and may land with other Stories / mains.
  assert.ok(stamps.get("Instagram::Story"));
  assert.ok(stamps.get("Facebook::Story"));
});

test("AZ does not land at noon when another post is already at 11:30 the next day", () => {
  const occupiedSunday1130 = Date.parse("2026-09-06T16:30:00.000Z");
  const { stamps, campaign } = buildAzCampaignSchedule(azItems(), {
    occupiedMs: [occupiedSunday1130],
    now: SATURDAY_EVENING,
    bestTimesByKey: {
      "Instagram::Reel": industryBestWindows("Instagram", "Reel"),
      "Facebook::Reel": industryBestWindows("Facebook", "Reel"),
      "TikTok::Video Draft": industryBestWindows("TikTok", "Video Draft"),
      "YouTube::Short": industryBestWindows("YouTube", "Short"),
    },
  });
  for (const iso of stamps.values()) {
    const ms = Date.parse(iso);
    assert.ok(Math.abs(ms - occupiedSunday1130) >= 30 * 60 * 1000, `clustered on occupied slot: ${iso}`);
  }
  assert.notEqual(campaign.key, "2026-09-06");
});
