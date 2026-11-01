import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const first = app.indexOf("  function scriptedShortFallbackDirective(feedback) {");
const last = app.indexOf('  $("scriptedShortRevise")?.addEventListener', first);
assert.ok(first > 0 && last > first, "fallback helper methods should be available");
const snippet = app.slice(first, last);
const run = async (command, api = async () => ({ ok: true })) => {
  const ctx = { URLSearchParams, api };
  vm.createContext(ctx);
  return vm.runInContext("(async()=>{" + snippet + "\n" + command + "})()", ctx);
};

const scenes = Array.from({length:6},(_,i)=>({
  voiceover_text: "Scene narration "+(i+1),
  duration_seconds: 4,
  start_seconds: i*4,
  end_seconds:(i+1)*4,
  shot_status:"suggestion",
  asset_id:""
}));
const proposal = { prompt:"NYC at night",timeline:{duration_seconds:24,segments:scenes},producer_plan:{target_platforms:["TikTok"]}};
const clip = {id:"recCentralParkAsset",name:"Central Park At Night 1.mp4",media_kind:"video",
  mime_type:"video/mp4",duration_seconds:16,google_drive_file_id:"drive-123",content_profile_id:"recNYC",do_not_use:false};

test("fallback parses exact single scene replacement in natural-language example", async()=>{
  const info = await run('return scriptedShortFallbackDirective("Looks good, but remove slide 4 and replace with the following clip which I just uploaded.\\n-Central Park At Night 1");');
  assert.equal(info.scene,4);
  assert.equal(info.action,"replace");
  assert.equal(info.asset_name,"Central Park At Night 1");
});

test("fallback replaces only requested scene, retains voiceover and proves no acceptance", async()=>{
  const result = await run("return scriptedShortLegacyApiRevision(proposal, 'Replace slide 4 with Central Park At Night 1', 'recNYC');",
    async path => {assert.match(path,/^\/api\/library\?/);assert.match(path,/kind=video/);return {ok:true,content_profile_id:"recNYC",records:[clip]};}
  );
  assert.equal(result.timeline.segments.length,6);
  assert.equal(result.timeline.segments[3].asset_id,"recCentralParkAsset");
  assert.equal(result.timeline.segments[3].voiceover_text,"Scene narration 4");
  assert.equal(result.timeline.segments[2].asset_id,"");
  assert.equal(result.timeline.duration_seconds,24);
  assert.equal(result.producer_plan,null,"fallback must not fabricate Producer Plan or QA");
  assert.equal(result.asset_validation,null);
  assert.equal(proposal.timeline.segments[3].asset_id,"","original proposal remains immutable");
});

test("fallback removes target scene, recalculates scene time and rejects unsafe removals", async()=>{
  const result = await run("return scriptedShortLegacyApiRevision(proposal, 'Remove slide 4', 'recNYC');",
    async()=>{throw Error("Read-only library API must not be used for scene removal");});
  assert.equal(result.timeline.segments.length,5);
  assert.equal(result.timeline.segments[3].voiceover_text,"Scene narration 5");
  assert.equal(result.timeline.duration_seconds,20);
  await assert.rejects(run("return scriptedShortLegacyApiRevision({timeline:{segments:[{duration_seconds:5}]}}, 'Remove slide 1', 'recNYC');"),/five scenes/);
});

test("fallback rejects ambiguous and different-profile media; no silent substitution", async()=>{
  await assert.rejects(run("return scriptedShortLegacyApiRevision(proposal, 'Replace slide 4 with Central Park At Night 1', 'recNYC');",
    async()=>({ok:true,content_profile_id:"recNYC",records:[clip,{...clip,id:"recDuplicate"}]})),/Multiple uploaded clips/);
  await assert.rejects(run("return scriptedShortLegacyApiRevision(proposal, 'Replace slide 4 with Central Park At Night 1', 'recNYC');",
    async()=>({ok:true,content_profile_id:"recChicago",records:[clip]})),/another profile/);
  await assert.rejects(run("return scriptedShortLegacyApiRevision(proposal, 'Replace slide 4 with Central Park At Night 1', 'recNYC');",
    async()=>({ok:true,content_profile_id:"recNYC",records:[{...clip,do_not_use:true}]})),/unavailable/);
});

test("fallback only runs for unsupported endpoint, not permission or Quality Agent failures",()=>{
  assert.match(app,/if \(error\?\.status !== 404 && error\?\.status !== 405\) throw error/);
  assert.match(app,/await scriptedShortLegacyApiRevision\(base, feedback, profile\)/);
  assert.match(app,/Accept will perform authoritative Quality Agent checks before saving/);
});
