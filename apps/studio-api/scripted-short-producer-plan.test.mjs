import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseScriptedShortAssetPolicy } from "./scripted-short-asset-policy.mjs";
import {
  SCRIPTED_SHORT_BRIEF_LIMIT,
  SCRIPTED_SHORT_PLAN_SIGNATURE,
  normalizeScriptedShortBrief,
  scriptedShortTargetPlatforms,
  scriptedShortExclusions,
  buildScriptedShortProducerPlan,
  bindScriptedShortPlanToProductionAssets,
  serializeScriptedShortProducerPlan,
  scriptedShortProducerPlanFromNotes,
  validateScriptedShortProductionConstraints,
} from "./scripted-short-producer-plan.mjs";

const timeline = {
  duration_seconds: 30,
  segments: [
    { asset_id: "recFerry1", suggested_visual: "Staten Island Ferry skyline", voiceover_text: "Start at the harbor." },
    { asset_id: "recFerry2", suggested_visual: "Ferry deck seating", voiceover_text: "Sit on the right for the skyline." },
  ],
};
const catalog = [
  { id: "recFerry1", name: "Staten Island Ferry skyline", location: "Staten Island Ferry", profile_id: "recNYC" },
  { id: "recFerry2", name: "Ferry deck seating", topic: "Staten Island Ferry", profile_id: "recNYC" },
];
const brief = "Create a 30-second short about the Staten Island Ferry. Use my uploaded Staten Island Ferry photos. Keep the narration friendly. Don't use stock media. Produce for Instagram and TikTok.";

test("creative brief accepts 5,000 characters without normalizing away the operator's detail", () => {
  const value = "a".repeat(SCRIPTED_SHORT_BRIEF_LIMIT);
  assert.equal(normalizeScriptedShortBrief(value).length, 5000);
  assert.throws(() => normalizeScriptedShortBrief(value + "b"), /5,000 characters or fewer/);
  assert.equal(normalizeScriptedShortBrief("first line\r\nsecond line"), "first line\nsecond line");
});

test("platform and exclusion constraints are explicit and actionable", () => {
  assert.deepEqual(scriptedShortTargetPlatforms(brief), ["Instagram", "TikTok"]);
  assert.deepEqual(scriptedShortExclusions(brief), ["stock media"]);
});

test("Producer Plan persists media, narration, scene order, duration, exclusions and platforms", () => {
  const plan = buildScriptedShortProducerPlan({
    brief, timeline, catalog, assetPolicy: parseScriptedShortAssetPolicy(brief), profileId: "recNYC", profileName: "New York City",
  });
  assert.equal(plan.signature, SCRIPTED_SHORT_PLAN_SIGNATURE);
  assert.equal(plan.creative_brief_source, "linked_idea.Idea_Summary");
  assert.equal(plan.required_uploaded_assets.length, 2);
  assert.equal(plan.narration.authority_field, "Requested_Script");
  assert.deepEqual(plan.scene_order.map((scene) => scene.scene), [1, 2]);
  assert.equal(plan.duration.target_seconds, 30);
  assert.deepEqual(plan.exclusions, ["stock media"]);
  assert.deepEqual(plan.target_platforms, ["Instagram", "TikTok"]);
  assert.equal(plan.media_requirements[0].silent_substitution_allowed, false);
  const notes = `before\n${serializeScriptedShortProducerPlan(plan)}\nafter`;
  assert.deepEqual(scriptedShortProducerPlanFromNotes(notes), plan);
});

test("production Quality Agent blocks missing and silently replaced required uploads", () => {
  const initial = buildScriptedShortProducerPlan({
    brief, timeline, catalog, assetPolicy: parseScriptedShortAssetPolicy(brief), profileId: "recNYC",
  });
  const assets = [
    { id: "prod1", media_asset_record_id: "recFerry1", name: "Staten Island Ferry skyline", location: "Staten Island Ferry" },
    { id: "prod2", media_asset_record_id: "recFerry2", name: "Ferry deck seating", topic: "Staten Island Ferry" },
  ];
  const plan = bindScriptedShortPlanToProductionAssets(initial, assets);
  const productionTimeline = { segments: [{ asset_id: "prod1" }, { asset_id: "prod2" }] };
  assert.equal(validateScriptedShortProductionConstraints({ plan, timeline: productionTimeline, assets, profileId: "recNYC" }).ok, true);
  const missing = validateScriptedShortProductionConstraints({ plan, timeline: productionTimeline, assets: assets.slice(0, 1), profileId: "recNYC" });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.code === "REQUIRED_ASSET_MISSING"));
  const replacement = { id: "prodOther", media_asset_record_id: "recOther", name: "Central Park", location: "Central Park" };
  const replaced = validateScriptedShortProductionConstraints({ plan, timeline: { segments: [{ asset_id: "prodOther" }, { asset_id: "prod2" }] }, assets: [replacement, assets[1]], profileId: "recNYC" });
  assert.ok(replaced.errors.some((error) => error.code === "REQUIRED_ASSET_REPLACED"));
  assert.ok(replaced.errors.some((error) => error.code === "MEDIA_SUBJECT_MISMATCH"));
});

test("the same plan contract stays profile-isolated across all four profiles", () => {
  for (const [profileId, city] of [["recCHI", "Chicago"], ["recNYC", "New York"], ["recLA", "Los Angeles"], ["recMIA", "Miami"]]) {
    const cityBrief = `Create a short about ${city}. Use my uploaded ${city} photos.`;
    const cityTimeline = { duration_seconds: 20, segments: [{ asset_id: `asset-${city}`, suggested_visual: `${city} skyline` }] };
    const cityCatalog = [{ id: `asset-${city}`, name: `${city} skyline`, location: city, profile_id: profileId }];
    const plan = buildScriptedShortProducerPlan({ brief: cityBrief, timeline: cityTimeline, catalog: cityCatalog, assetPolicy: parseScriptedShortAssetPolicy(cityBrief), profileId });
    assert.equal(plan.profile_id, profileId);
    assert.equal(plan.required_uploaded_assets.length, 1, city);
  }
});

test("proposal, accept, bridge preflight and production approval all use the Producer Plan", async () => {
  const source = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(source, /normalizeScriptedShortBrief\(payload\?\.prompt\)/);
  assert.match(source, /Idea_Summary: creativeBrief/);
  assert.match(source, /serializeScriptedShortProducerPlan\(producerPlan\)/);
  assert.match(source, /Suggested_Platforms: producerPlan\.target_platforms/);
  assert.match(source, /scripted_short_producer_constraints/);
  assert.match(source, /Quality Agent blocked production/);
});
