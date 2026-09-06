import assert from "node:assert/strict";
import test from "node:test";

import { industryBestWindows, planScheduleItems } from "./suggested-schedules.mjs";
import { AZ_STORY_OFFSET_MS, buildAzCampaignSchedule, chicagoCivilFromMs } from "./az-schedules.mjs";

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

test("AZ keeps one campaign day and puts Stories 10 minutes after the matching Reel", () => {
  const { stamps, campaign } = buildAzCampaignSchedule(azItems(), { occupiedMs: [], now: SATURDAY_EVENING });
  assert.ok(campaign?.key);
  const igReel = Date.parse(stamps.get("Instagram::Reel"));
  const igStory = Date.parse(stamps.get("Instagram::Story"));
  const fbReel = Date.parse(stamps.get("Facebook::Reel"));
  const fbStory = Date.parse(stamps.get("Facebook::Story"));
  assert.equal(igStory - igReel, AZ_STORY_OFFSET_MS);
  assert.equal(fbStory - fbReel, AZ_STORY_OFFSET_MS);
  const days = new Set(
    [stamps.get("Instagram::Reel"), stamps.get("Facebook::Reel"), stamps.get("TikTok::Video Draft"), stamps.get("YouTube::Short")]
      .map((iso) => chicagoCivilFromMs(Date.parse(iso)).key)
  );
  assert.equal(days.size, 1);
  assert.equal([...days][0], campaign.key);
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
