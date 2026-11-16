import assert from "node:assert/strict";
import test from "node:test";
import {
  item4FallbackAspectRatio,
  item4PlanItemFromChoice,
  ITEM4_MAPPING_ASPECT_FALLBACKS,
} from "./worker-functions-01.mjs";

test("item4FallbackAspectRatio covers vertical Studio destinations", () => {
  assert.equal(item4FallbackAspectRatio({ mappingType: "Instagram Reel" }).aspect_ratio, "9:16");
  assert.equal(item4FallbackAspectRatio({ mappingType: "Facebook Reel" }).aspect_ratio, "9:16");
  assert.equal(item4FallbackAspectRatio({ mappingType: "TikTok Video" }).aspect_ratio, "9:16");
  assert.equal(item4FallbackAspectRatio({ mappingType: "YouTube Short" }).aspect_ratio, "9:16");
  assert.equal(item4FallbackAspectRatio({ mappingType: "YouTube Longform" }).aspect_ratio, "16:9");
  assert.equal(item4FallbackAspectRatio({ mappingType: "Instagram Carousel" }).aspect_ratio, "4:5");
  assert.equal(
    item4FallbackAspectRatio({ format: "Vertical Short Video" }).ratio_source,
    "Studio format fallback",
  );
  assert.equal(ITEM4_MAPPING_ASPECT_FALLBACKS["Instagram Story"], "9:16");
});

test("item4PlanItemFromChoice uses Studio mapping fallback when index is empty", () => {
  const emptyIndex = new Map();
  const reel = item4PlanItemFromChoice(
    "Instagram",
    {
      output_type: "Reel",
      mapping_type: "Instagram Reel",
      format: "Vertical Short Video",
      rationale: "Default. Renders the photos as a 9:16 Instagram Reel with music and voiceover.",
      available_output_types: ["Reel", "Carousel", "Single Image"],
    },
    3,
    emptyIndex,
  );
  assert.equal(reel.aspect_ratio, "9:16");
  assert.equal(reel.ratio_source, "Studio mapping fallback");
  assert.equal(reel.requires_variant_review, false);

  const story = item4PlanItemFromChoice(
    "Instagram",
    {
      output_type: "Story",
      mapping_type: "Instagram Story",
      format: "Story",
      rationale: "Companion Story",
      available_output_types: ["Story"],
    },
    3,
    emptyIndex,
    { companion: true },
  );
  assert.equal(story.aspect_ratio, "9:16");
  assert.ok(story.ratio_source);
});

test("item4PlanItemFromChoice prefers live Platform Output Mappings when present", () => {
  const index = new Map([
    ["Instagram::Instagram Reel", {
      id: "recMapLive0000001",
      fields: { Active: true, Platform: "Instagram", Platform_Output_Type: "Instagram Reel", Aspect_Ratio: "9:16" },
    }],
  ]);
  const reel = item4PlanItemFromChoice(
    "Instagram",
    {
      output_type: "Reel",
      mapping_type: "Instagram Reel",
      format: "Vertical Short Video",
      rationale: "Default",
      available_output_types: ["Reel"],
    },
    1,
    index,
  );
  assert.equal(reel.aspect_ratio, "9:16");
  assert.equal(reel.ratio_source, "Platform Output Mappings");
});
