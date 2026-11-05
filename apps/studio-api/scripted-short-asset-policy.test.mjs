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

test("ordinary topical prompts require relevant media without pretending they require an upload", () => {
  const noLock = parseScriptedShortAssetPolicy("Explain the history of the Brooklyn Bridge.");
  assert.equal(noLock.required, false);
  assert.equal(noLock.subject, "brooklyn bridge");
  assert.equal(libraryAssetSatisfiesPolicy(battery, noLock, nyc), false);
  assert.equal(libraryAssetSatisfiesPolicy(northPond, noLock, nyc), false);
  assert.equal(libraryAssetSatisfiesPolicy({ id: "recBrooklyn", name: "Brooklyn Bridge dusk", profile_id: nyc }, noLock, nyc), true);
});

test("generic variety instruction is not a fabricated location lock", () => {
  const brief = "Create a cinematic documentary titled **Tribeca: From Industrial Grit to Manhattan Glamour. Use a wide variety of relevant library assets, with Tribeca imagery throughout.";
  const parsed = parseScriptedShortAssetPolicy(brief);
  assert.equal(parsed.location, null);
  assert.equal(parsed.subject, "tribeca");
  assert.equal(parsed.required, false);
  assert.equal(libraryAssetSatisfiesPolicy({ id: "recTribeca", name: "Tribeca 14", profile_id: nyc }, parsed, nyc), true);
});

test("realistic Tribeca documentary wording resolves the named location despite a story sentence", () => {
  const brief = "Create a visually rich documentary titled **Tribeca: From Industrial Grit to Manhattan Glamour.** Tell the fascinating story of how Tribeca evolved from a bustling warehouse district. Use a wide variety of relevant library assets.";
  const parsed = parseScriptedShortAssetPolicy(brief);
  assert.equal(parsed.location, null);
  assert.equal(parsed.subject, "tribeca");
  assert.equal(parsed.mode, "required_topic_match");
});

test("explicit named Tribeca upload requirements remain strict", () => {
  const parsed = parseScriptedShortAssetPolicy("Use the Tribeca images uploaded to the library.");
  assert.equal(parsed.required, true);
  assert.equal(parsed.location, "tribeca");
  assert.equal(libraryAssetSatisfiesPolicy({ id: "recTribeca", name: "Tribeca 14", profile_id: nyc }, parsed, nyc), true);
  assert.equal(libraryAssetSatisfiesPolicy({ id: "recOther", name: "Chicago River", profile_id: nyc }, parsed, nyc), false);
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


const drifterBrief = `Please note that the below request will rely on the recently uploaded files in asset manager that are all drifter speakeasy clips.
----
Here’s a strong, ready-to-use TikTok package for your Drifter clips and stills.
Video Prompt (for CapCut, editing, or AI assist)
Create a 20–30 second cinematic, moody TikTok video using my clips and stills from The Drifter speakeasy in Chicago. Style: dark, intimate, vintage Prohibition-era atmosphere with warm amber and deep blue lighting, soft film grain, subtle slow zooms and pans.

Sequence:
Quick exterior shot of the Green Door Tavern / River North street at night
Descending the stairs and discovering the hidden entrance (bookshelf/door moment)
Door opens into the dim, velvet-and-flag-filled room
Close-ups of the bar, hanging American flag, vintage posters, and candlelight
Tarot cards being drawn or fanned out on the bar
Beautiful cocktail being poured or presented with its tarot card
Brief, atmospheric glimpse of the stage/performance energy (burlesque or live act if available)
Guests laughing and sipping in the intimate space
Slow push-in on a finished cocktail + tarot card
End on a lingering shot of the room with soft text overlay

Music: sultry, slightly mysterious jazz or modern lo-fi with a 1920s undertone. Keep the energy mysterious and inviting rather than party-hype.
Voiceover Script (≈22–25 seconds)
“Not all who wander are lost…
Especially when the path leads under the floorboards of an old Chicago tavern.
This is The Drifter.
A real Prohibition speakeasy.
Hidden for a reason.
Every night the menu is decided by tarot.
You never know what you’ll get…
but it’s always worth the secret.
Come as you are.
Leave the way you want to be.”

(Speak in a low, smooth, slightly conspiratorial tone. Pause after “Hidden for a reason” and after the tarot line for the visuals to land.)
Caption
Chicago’s last real speakeasy is hiding right under your feet 🃏🥃
The Drifter — River North’s secret basement bar where the drinks are chosen by tarot cards and the night never plays the same way twice.
Worth finding.
#TheDrifter #ChicagoSpeakeasy #HiddenGemsChicago #RiverNorth 
This version leans into the actual magic of the place (authentic history + tarot menu + intimate vibe) while staying very “you” in the ChicagoShining style. It should perform well with the atmospheric footage you already have.`;

test("Drifter production brief resolves the venue rather than ready-to-use package prose", () => {
  const parsed = parseScriptedShortAssetPolicy(drifterBrief);
  assert.equal(parsed.location, "drifter speakeasy");
  assert.equal(parsed.required, true);
  for (let n = 1; n <= 6; n++) {
    const asset = {id: "recDrifter" + n, name: "The Drifter Speakeasy " + n,
      location: "The Drifter, Chicago", profile_id: chi};
    assert.equal(libraryAssetSatisfiesPolicy(asset, parsed, chi), true);
    assert.equal(libraryAssetSatisfiesPolicy(asset, parsed, nyc), false);
  }
  assert.equal(libraryAssetSatisfiesPolicy(northPond, parsed, chi), false);
});

test("ready-to-use is not an asset selection command", () => {
  assert.equal(parseScriptedShortAssetPolicy(
    "Here is a ready-to-use TikTok package for your Drifter clips and stills."
  ).location, null);
});

test("coordinated media and city qualifiers preserve named venue constraints", () => {
  for (const media of ["clips and stills", "photos & videos", "clips, photos and stills", "footage"]) {
    const parsed = parseScriptedShortAssetPolicy(
      "Create a short using my " + media + " from The Drifter speakeasy in Chicago."
    );
    assert.equal(parsed.location, "drifter speakeasy", media);
  }
  const parsed = parseScriptedShortAssetPolicy("Use clips and stills from Battery Park.");
  assert.equal(parsed.location, "battery park");
  assert.equal(libraryAssetSatisfiesPolicy(northPond, parsed, chi), false);
});
