import assert from "node:assert/strict";
import test from "node:test";

import {
  AZ_EXPECTED_OUTPUT_COUNT,
  AZ_EXTRAS,
  AZ_OVERRIDES,
  FINISHED_STORY_TEASER_SECONDS,
  azDefaultPlanPayload,
  azOriginStamp,
  azRequestDefaults,
  finishedCompanionStoryFields,
  finishedStoryTeaserClipFlags,
  isAzFinishedVideoOrigin,
  mergeAzProductionNotes,
  pickDuplicateOutputKeepers,
  uniquePlanItems,
} from "./az-finished-video.mjs";

test("AZ origin stamp keeps finished-video passthrough and auto-queue", () => {
  const stamp = azOriginStamp();
  assert.match(stamp, /origin=az-finished-video/);
  assert.match(stamp, /ez-input=finished-video/);
  assert.match(stamp, /az-auto-queue=1/);
  assert.equal(isAzFinishedVideoOrigin(stamp), true);
});

test("AZ defaults lock no VO, no music, thumbnail yes, four platforms plus stories", () => {
  const defaults = azRequestDefaults({ title: "Navy Pier" });
  assert.equal(defaults.voiceover_mode, "No");
  assert.equal(defaults.background_music_mode, "No");
  assert.equal(defaults.thumbnail_mode, "Yes");
  assert.deepEqual(defaults.platforms, ["Instagram", "Facebook", "TikTok", "YouTube"]);
  const plan = azDefaultPlanPayload();
  assert.equal(plan.overrides.YouTube, AZ_OVERRIDES.YouTube);
  assert.deepEqual(plan.extras, [...AZ_EXTRAS]);
  assert.equal(AZ_EXPECTED_OUTPUT_COUNT, 6);
  assert.equal(FINISHED_STORY_TEASER_SECONDS, 10);
  const story = finishedCompanionStoryFields();
  assert.equal(story.Background_Music_Mode_Override, "No");
  assert.equal(story.Video_Duration_Seconds_Override, 10);
  assert.deepEqual(finishedStoryTeaserClipFlags(), { keepSourceAudio: true, muted: false });
});

test("uniquePlanItems keeps one row per platform and output type", () => {
  const items = uniquePlanItems([
    { platform: "Instagram", output_type: "Reel" },
    { platform: "Instagram", output_type: "Reel" },
    { platform: "Instagram", output_type: "Story" },
    { platform: "Facebook", output_type: "Reel" },
    { platform: "Facebook", output_type: "Story" },
    { platform: "TikTok", output_type: "Video Draft" },
    { platform: "YouTube", output_type: "Short" },
    { platform: "YouTube", output_type: "Short" },
  ]);
  assert.deepEqual(items.map((item) => `${item.platform}::${item.output_type}`), [
    "Instagram::Reel",
    "Instagram::Story",
    "Facebook::Reel",
    "Facebook::Story",
    "TikTok::Video Draft",
    "YouTube::Short",
  ]);
});

test("pickDuplicateOutputKeepers disables extra same-key rows", () => {
  const { keepers, extras } = pickDuplicateOutputKeepers([
    { id: "recIG2", platform: "Instagram", output_type: "Reel", has_platform_output: true, output_order: 1, created_at: "2026-09-20T15:23:47Z" },
    { id: "recIG1", platform: "Instagram", output_type: "Reel", has_platform_output: true, output_order: 1, created_at: "2026-09-20T15:23:44Z" },
    { id: "recIG3", platform: "Instagram", output_type: "Reel", has_platform_output: false, output_order: 1, created_at: "2026-09-20T15:23:48Z" },
    { id: "recFB", platform: "Facebook", output_type: "Reel", has_platform_output: true, output_order: 2, created_at: "2026-09-20T15:23:45Z" },
  ]);
  assert.deepEqual(keepers.map((row) => row.id).sort(), ["recFB", "recIG1"]);
  assert.deepEqual(extras.map((row) => row.id).sort(), ["recIG2", "recIG3"]);
});

test("merge keeps an existing AZ stamp", () => {
  const first = mergeAzProductionNotes("", { title: "A" });
  assert.equal(mergeAzProductionNotes(first, { title: "B" }), first);
});
