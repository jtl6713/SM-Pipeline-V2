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

test("AZ spreads package outputs across several days and separates same-platform Story", () => {
  const { stamps, campaign } = buildAzCampaignSchedule(azItems(), { occupiedMs: [], now: SATURDAY_EVENING });
  assert.ok(campaign?.key);
  const allDays = new Set([...stamps.values()].map((iso) => chicagoCivilFromMs(Date.parse(iso)).key));
  assert.ok(allDays.size >= 4, "six-output package should be spread across the week");

  const igReelDay = chicagoCivilFromMs(Date.parse(stamps.get("Instagram::Reel"))).key;
  const igStoryDay = chicagoCivilFromMs(Date.parse(stamps.get("Instagram::Story"))).key;
  const fbReelDay = chicagoCivilFromMs(Date.parse(stamps.get("Facebook::Reel"))).key;
  const fbStoryDay = chicagoCivilFromMs(Date.parse(stamps.get("Facebook::Story"))).key;
  assert.notEqual(igStoryDay, igReelDay);
  assert.notEqual(fbStoryDay, fbReelDay);
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
