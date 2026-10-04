import assert from "node:assert/strict";
import test from "node:test";

import { isBlackoutLocalTime, planScheduleItems } from "./suggested-schedules.mjs";
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

test("AZ uses manual MAE spread, never overnight blackout, and separates same-platform Story by 3h", () => {
  const { stamps, campaign, rationale } = buildAzCampaignSchedule(azItems(), { occupiedMs: [], now: SATURDAY_EVENING });
  assert.ok(campaign?.key);
  assert.match(String(rationale || ""), /manual morning\/afternoon\/evening/i);
  assert.equal(stamps.size, 6);

  for (const iso of stamps.values()) {
    assert.equal(isBlackoutLocalTime(Date.parse(iso)), false, iso);
  }

  const igReel = Date.parse(stamps.get("Instagram::Reel"));
  const igStory = Date.parse(stamps.get("Instagram::Story"));
  const fbReel = Date.parse(stamps.get("Facebook::Reel"));
  const fbStory = Date.parse(stamps.get("Facebook::Story"));
  assert.ok(Math.abs(igStory - igReel) >= 3 * 60 * 60 * 1000);
  assert.ok(Math.abs(fbStory - fbReel) >= 3 * 60 * 60 * 1000);

  const allDays = new Set([...stamps.values()].map((iso) => chicagoCivilFromMs(Date.parse(iso)).key));
  assert.ok(allDays.size >= 2, "package should not collapse onto a single day");
});

test("AZ ignores leftover bestTimesByKey industry windows and still avoids occupied slots", () => {
  const occupiedSunday1130 = Date.parse("2026-09-06T16:30:00.000Z");
  const { stamps } = buildAzCampaignSchedule(azItems(), {
    occupiedMs: [occupiedSunday1130],
    now: SATURDAY_EVENING,
    bestTimesByKey: {
      "Instagram::Reel": { days: ["Sun"], windows: ["22:00-00:00"] },
      "Facebook::Reel": { days: ["Sun"], windows: ["00:00-06:00"] },
    },
  });
  for (const iso of stamps.values()) {
    const ms = Date.parse(iso);
    assert.ok(Math.abs(ms - occupiedSunday1130) >= 3 * 60 * 60 * 1000, `too close to occupied: ${iso}`);
    assert.equal(isBlackoutLocalTime(ms), false, iso);
  }
});
