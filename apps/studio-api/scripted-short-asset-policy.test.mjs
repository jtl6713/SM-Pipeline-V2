import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ASSET_LOCATION_SIGNATURE,
  parseScriptedShortAssetPolicy,
  libraryAssetSatisfiesPolicy,
  validateScriptedShortAssets,
  recoverScriptedShortAssets,
} from "./scripted-short-asset-policy.mjs";

const nyc = "recNYCprofile";
const chi = "recCHIprofile";
const prompt = "Educate on the history of Battery Park City area of lower manhattan. You don't have to be brief. Utilize the battery park images that are uploaded into the system.";
const policy = parseScriptedShortAssetPolicy(prompt);
const battery = { id: "recBattery1", name: "Battery Park Esplanade 4", location: "Battery Park City", profile_id: nyc };
const battery2 = { id: "recBattery2", name: "Lower Manhattan river view", description: "Battery Park City promenade", profile_id: nyc };
const northPond = { id: "recChicago1", name: "North Pond 2", location: "Lincoln Park Chicago", profile_id: chi };
const unlabeled = { id: "recUnknown2", name: "North Avenue Beach 1", location: "Chicago" };
const timeline = (ids) => ({
  segments: ids.map((id) => ({
    asset_id: id,
    suggested_visual: "Photo",
    voiceover_text: "History of the waterfront.",
  })),
});

test("exact Battery Park prompt requires uploaded Battery Park library assets", () => {
  assert.equal(policy.required, true);
  assert.equal(policy.location, "battery park");
  assert.equal(policy.mode, "required_library_location");
  assert.equal(policy.signature, ASSET_LOCATION_SIGNATURE);
  assert.equal(libraryAssetSatisfiesPolicy(battery, policy, nyc), true);
  assert.equal(libraryAssetSatisfiesPolicy(battery2, policy, nyc), true);
  assert.equal(libraryAssetSatisfiesPolicy(northPond, policy, nyc), false);
  assert.equal(libraryAssetSatisfiesPolicy(unlabeled, policy, nyc), false);
});

test("hard asset constraints and profile isolation work across all four Shining Cities", () => {
  for (const [market, profile] of [
    ["Chicago", "recChicago"], ["New York", "recNewYork"],
    ["Los Angeles", "recLosAngeles"], ["Miami", "recMiami"],
  ]) {
    const row = { id: "recWaterfront", name: market + " Waterfront", profile_id: profile };
    const cityPolicy = parseScriptedShortAssetPolicy("Use the " + market + " images uploaded to the system.");
    assert.equal(cityPolicy.required, true, market);
    assert.equal(libraryAssetSatisfiesPolicy(row, cityPolicy, profile), true, market);
    assert.equal(libraryAssetSatisfiesPolicy(row, cityPolicy, "recDifferent"), false, market);
    assert.equal(libraryAssetSatisfiesPolicy({ ...row, name: "Different City Pier" }, cityPolicy, profile), false, market);
  }
});

test("ordinary prompts do not force a location lock", () => {
  const noLock = parseScriptedShortAssetPolicy("Explain the history of the Brooklyn Bridge.");
  assert.equal(noLock.required, false);
  assert.equal(libraryAssetSatisfiesPolicy(battery, noLock, nyc), true);
  assert.equal(libraryAssetSatisfiesPolicy(northPond, noLock, nyc), false);
});

test("Quality Agent never treats a valid but irrelevant media ID as a match", () => {
  const initial = timeline(["recChicago1", "recBattery1"]);
  const qa = validateScriptedShortAssets(initial, [northPond, battery], policy, nyc);
  assert.equal(qa.ok, false);
  assert.equal(qa.verified, 1);
  assert.equal(qa.mismatches[0].signature, ASSET_LOCATION_SIGNATURE);
});

test("Quality Agent safely repairs with verified eligible assets only", () => {
  const before = timeline(["recChicago1", "recBattery1"]);
  const healed = recoverScriptedShortAssets(before, [northPond, battery, battery2], policy, nyc);
  assert.equal(healed.validation.ok, true);
  assert.equal(healed.recovered, 1);
  assert.equal(healed.unresolved, 0);
  assert.deepEqual(healed.timeline.segments.map((x) => x.asset_id).sort(), ["recBattery1", "recBattery2"]);
  assert.deepEqual(healed.timeline.segments.map((x) => x.voiceover_text), before.segments.map((x) => x.voiceover_text));
});

test("no eligible replacement leaves a needs-photo scene, never a false green match", () => {
  const healed = recoverScriptedShortAssets(timeline(["recChicago1"]), [northPond], policy, nyc);
  assert.equal(healed.recovered, 1);
  assert.equal(healed.unresolved, 1);
  assert.equal(healed.validation.verified, 0);
  assert.equal(healed.validation.unassigned, 1);
  assert.equal(healed.timeline.segments[0].shot_status, "suggestion");
  assert.match(healed.timeline.segments[0].suggested_visual, /battery park/);
});

test("proposal and acceptance routes contain their respective independent validation gates", async () => {
  const source = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(source, /catalog = catalog\.filter\(\(row\) => libraryAssetSatisfiesPolicy/);
  assert.match(source, /recoverScriptedShortAssets\(buildTimelineFromScenes\(scenes\)/);
  assert.match(source, /validateScriptedShortAssets\(timeline, pool, assetPolicy/);
  assert.match(source, /const mediaRows = await Promise\.all\(selectedMediaIds\.map/);
  assert.match(source, /validateScriptedShortAssets\(timeline, authoritativeCatalog, acceptPolicy/);
});


test("scripted short proposal and accept honor the selected Studio profile query parameter", async () => {
  const functions = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const worker = await readFile(new URL("./worker.js", import.meta.url), "utf8");
  assert.match(functions, /export async function proposeScriptedShortRoute\(request, env, authorization, url = null\)/);
  assert.match(functions, /export async function acceptScriptedShortRoute\(request, env, authorization, ctx = null, url = null\)/);
  const propose = functions.split("export async function proposeScriptedShortRoute(")[1].split("/*__STUDIO_WORKER_END:proposeScriptedShortRoute__*/")[0];
  const accept = functions.split("export async function acceptScriptedShortRoute(")[1].split("/*__STUDIO_WORKER_END:acceptScriptedShortRoute__*/")[0];
  assert.match(propose, /resolveWorkingContentProfile\(env, authorization, requestedProfileId\(url, payload\)\)/);
  assert.match(accept, /resolveWorkingContentProfile\(env, authorization, requestedProfileId\(url, payload\)\)/);
  // Awaiting inside the Worker fetch try/catch retains expected HttpError 409
  // status codes instead of causing an unhandled Cloudflare 1101/500.
  assert.match(worker, /return await proposeScriptedShortRoute\(request, env, authorization, url\)/);
  assert.match(worker, /return await acceptScriptedShortRoute\(request, env, authorization, ctx, url\)/);
  assert.match(propose, /synthetic\.fields\.Market_Name = profileMarket/);
});

test("original Battery Park fixture remains NYC-only after fixing profile routing", () => {
  const newYork = { id: "recBattery", name: "Battery Park 9", location: "Battery Park City", profile_id: "recgtK8Z7eNADNtVy" };
  const chicago = { id: "recNorthPond", name: "North Pond 2", location: "Lincoln Park, Chicago", profile_id: "recT2rbKX3MF7cVFU" };
  assert.equal(libraryAssetSatisfiesPolicy(newYork, policy, "recgtK8Z7eNADNtVy"), true);
  assert.equal(libraryAssetSatisfiesPolicy(chicago, policy, "recgtK8Z7eNADNtVy"), false);
  assert.equal(libraryAssetSatisfiesPolicy(newYork, policy, "recT2rbKX3MF7cVFU"), false);
});
