import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertStoryboardSceneContent,
  corruptFallbackProposalFixture,
  inferStoryboardPreferredMedia,
  mergeStoryboardScenesPreservingValid,
  storyboardSceneContentErrors,
  storyboardSceneCorruptionErrors,
} from "./storyboard-scene-content.mjs";

const BRIEF = `Here is a concept for a Chicago golden hour short about winter light on the lakefront,
the riverwalk, and the CTA. We should find photos that feel cinematic and maybe a train clip.
Please plan seven scenes and decide preferred media later.`;

test("exact corrupt fallback pattern is rejected before storyboard fields are populated", () => {
  const scenes = corruptFallbackProposalFixture(BRIEF);
  const errors = storyboardSceneContentErrors(scenes, { brief: BRIEF });
  assert.ok(errors.length >= 3, errors.join(" | "));
  assert.match(errors.join(" "), /planning or library-sourcing|media-selection|repeats the creative brief/i);
  assert.throws(() => assertStoryboardSceneContent(scenes, { brief: BRIEF }), /Voiceover|visual/i);
});

test("valid scene-specific visuals and narration pass the propose gate", () => {
  const scenes = [
    {
      suggested_visual: "Blue-hour aerial of icy Lake Michigan breakwater with Chicago skyline behind it",
      voiceover_text: "Chicago's golden hour now starts at four.",
    },
    {
      suggested_visual: "Sunlit Riverwalk steps with downtown towers across the water",
      voiceover_text: "Follow the river while the light is still warm.",
    },
    {
      suggested_visual: "Cloud Gate reflecting winter lights with snow underfoot",
      voiceover_text: "The Bean turns every skyline color into a mirror.",
    },
  ];
  assert.deepEqual(storyboardSceneContentErrors(scenes, { brief: BRIEF }), []);
  assert.equal(assertStoryboardSceneContent(scenes, { brief: BRIEF }), true);
  assert.equal(inferStoryboardPreferredMedia(scenes[0].suggested_visual), "still_or_clip");
  assert.equal(inferStoryboardPreferredMedia("Real video clip of a CTA train passing the Loop"), "clip");
});

test("persist mode rejects corruption but keeps short operator visuals", () => {
  const ok = [
    { visual: "Riverwalk", voiceover: "Walk the river first." },
    { visual: "CTA clip", voiceover: "Then catch the train." },
  ];
  assert.deepEqual(storyboardSceneCorruptionErrors(ok), []);
  assert.equal(assertStoryboardSceneContent(ok, { mode: "persist" }), true);
  const bad = corruptFallbackProposalFixture("Staten Island Ferry tricks");
  assert.throws(() => assertStoryboardSceneContent(bad, { mode: "persist" }), /media-selection|planning/i);
});

test("regeneration keeps valid approved scenes and replaces only corrupt ones", () => {
  const previous = [
    {
      visual: "Blue-hour Chicago skyline before sunrise",
      voiceover: "Start with the quiet shoreline.",
      selected_approved: true,
      assigned_asset_id: "recVL46KTaLLefNzd",
      decision: "library",
      time: "0-4",
    },
    {
      visual: "Vertical frame of a long concept essay that is not in the library yet.",
      voiceover: "You still need a photo for this beat of the concept.",
      decision: "unassigned",
      time: "4-8",
    },
  ];
  const next = [
    { visual: "Should not replace approved skyline", voiceover: "Replacement hook.", time: "0-5" },
    { visual: "Sunlit Riverwalk steps facing downtown", voiceover: "The river wakes next.", time: "5-10" },
  ];
  const merged = mergeStoryboardScenesPreservingValid(previous, next, { brief: BRIEF });
  assert.equal(merged[0].visual, previous[0].visual);
  assert.equal(merged[0].assigned_asset_id, "recVL46KTaLLefNzd");
  assert.equal(merged[1].visual, next[1].visual);
});

test("creative-first propose path never embeds the conversational brief via fallbackProposalScenes", () => {
  const propose = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const start = propose.indexOf("export async function proposeScriptedShortRoute(");
  const end = propose.indexOf("/*__STUDIO_WORKER_END:proposeScriptedShortRoute__*/", start);
  const body = propose.slice(start, end);
  assert.match(body, /creative_first: creativeFirst === true|creativeFirst,/);
  assert.match(body, /Studio could not write a valid storyboard from that brief/);
  assert.match(body, /assertStoryboardSceneContent\(timeline\.segments/);
  assert.ok(!/creativeFirst \? fallbackProposalScenes\(prompt, \[\]\)/.test(body),
    "creative-first must not call fallbackProposalScenes with an empty catalog");
  assert.match(body, /if \(creativeFirst\) \{\s*throw new HttpError\(502/);
});

test("ITS1 creative-first prompt forbids catalog filenames and planning essays", () => {
  const prompt = readFileSync(new URL("../../services/pipeline-runner/its1/prompt.py", import.meta.url), "utf8");
  const processor = readFileSync(new URL("../../services/pipeline-runner/its1/processor.py", import.meta.url), "utf8");
  assert.match(prompt, /CREATIVE_FIRST_PROMPT_TEMPLATE/);
  assert.match(prompt, /Never paste the whole brief/);
  assert.match(prompt, /no "you still need a photo"/);
  assert.match(processor, /creative_first: bool = False/);
  assert.match(processor, /normalize_creative_scenes/);
  assert.match(processor, /if creative_first:/);
});
