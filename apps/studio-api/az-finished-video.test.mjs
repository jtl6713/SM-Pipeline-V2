import assert from "node:assert/strict";
import test from "node:test";

import {
  AZ_OVERRIDES,
  azDefaultPlanPayload,
  azOriginStamp,
  azRequestDefaults,
  isAzFinishedVideoOrigin,
  mergeAzProductionNotes,
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
  assert.deepEqual(plan.extras, ["Instagram::Story", "Facebook::Story"]);
});

test("merge keeps an existing AZ stamp", () => {
  const first = mergeAzProductionNotes("", { title: "A" });
  assert.equal(mergeAzProductionNotes(first, { title: "B" }), first);
});
