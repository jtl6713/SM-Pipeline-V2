import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  scriptedShortSceneDirections,
  scriptedShortDirectedScenes,
  scriptedShortSceneDirectionErrors,
} from "./scripted-short-scene-directions.mjs";
import { scriptedShortCheckBriefRequirements } from "./scripted-short-producer-plan.mjs";
import { buildTimelineFromScenes } from "./idea-timed-script.mjs";

const lines = Array.from({ length: 7 }, (_, i) => ({
  visual: "Distinct Chicago scene " + (i + 1) + " skyline angle",
  voice: "Scene " + (i + 1) + " narration is unique and belongs here.",
}));
const sceneBrief = [
  "Make exactly seven scenes, not fewer. Preserve each scene's voiceover verbatim.",
  ...lines.flatMap((scene, i) => [
    "Scene " + (i + 1) + " — " + (i * 4) + "–" + ((i + 1) * 4) + "s",
    "Visual: " + scene.visual,
    'Voiceover: "' + scene.voice + '"',
  ]),
].join("\n");

test("seven user-specified scene blocks become seven distinct exact VO and visual requirements", () => {
  const req = scriptedShortSceneDirections(sceneBrief);
  assert.equal(req.requested_count, 7);
  assert.deepEqual(req.voiceovers, lines.map(x=>x.voice));
  assert.deepEqual(req.visuals, lines.map(x=>x.visual));
  const scenes = scriptedShortDirectedScenes(sceneBrief);
  assert.equal(scenes.length, 7);
  assert.deepEqual(scenes.map(x=>x.voiceover_text), lines.map(x=>x.voice));
  assert.deepEqual(scenes.map(x=>x.suggested_visual), lines.map(x=>x.visual));
  assert.equal(scenes.every(x=>!x.asset_id && x.shot_status === "suggestion"), true);
  const timeline = buildTimelineFromScenes(scenes);
  assert.equal(scriptedShortCheckBriefRequirements(sceneBrief, timeline, []).ok, true);
});

test("named seven scenes and a separate numbered VO list are kept in exact order", () => {
  const brief = [
    "Produce a 7-scene Chicago storyboard.",
    "Visuals:",
    ...lines.map((row,i)=>(i+1)+". "+row.visual),
    "Voiceover:",
    ...lines.map((row,i)=>(i+1)+". "+row.voice),
  ].join("\n");
  const directive = scriptedShortSceneDirections(brief);
  assert.equal(directive.requested_count,7);
  assert.deepEqual(directive.voiceovers,lines.map(x=>x.voice));
  assert.deepEqual(directive.visuals,lines.map(x=>x.visual));
  assert.equal(scriptedShortDirectedScenes(brief).length,7);
});

test("worded scene count and per-scene voiceover with no visuals blocks invalid shortened proposals", () => {
  const brief = [
    "Create seven scenes with exact narration.",
    "Voiceover:",
    ...lines.map((row,i)=>(i+1)+". "+row.voice),
  ].join("\n");
  const req = scriptedShortSceneDirections(brief);
  assert.equal(req.requested_count,7);
  assert.equal(scriptedShortDirectedScenes(brief),null);
  const bad = buildTimelineFromScenes(Array.from({length:3}, (_,i)=>({
    voiceover_text: lines.map(x=>x.voice).join(" "),
    suggested_visual: "Generic scene "+(i+1),
  })));
  const result = scriptedShortCheckBriefRequirements(brief,bad,[]);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(" "),/exactly 7 scenes/);
  assert.match(result.errors.join(" "),/voiceover/);
});

test("seven correct scenes still fail if a full narration is copied into each scene", () => {
  const copied = Array.from({length:7},(_,i)=>({
    voiceover_text:lines.map(x=>x.voice).join(" "),
    suggested_visual:lines[i].visual,
  }));
  const bad = scriptedShortCheckBriefRequirements(sceneBrief,buildTimelineFromScenes(copied),[]);
  assert.equal(bad.ok,false);
  assert.match(bad.errors.join(" "),/voiceover/);
});

test("scene visual drift and scene order changes are rejected at QA boundary", () => {
  const scenes=scriptedShortDirectedScenes(sceneBrief);
  scenes[2].suggested_visual="Unrelated city";
  scenes[3].voiceover_text=lines[4].voice;
  const check=scriptedShortSceneDirectionErrors(sceneBrief,buildTimelineFromScenes(scenes));
  assert.equal(check.ok,false);
  assert.match(check.errors.join(" "),/visual requirement/);
  assert.match(check.errors.join(" "),/voiceover/);
});

test("unspecified generic briefs have no scene-count or voiceover restriction", () => {
  const brief="Create a short about Chicago with friendly narration.";
  const constraints=scriptedShortSceneDirections(brief);
  assert.equal(constraints.requested_count,null);
  assert.equal(scriptedShortDirectedScenes(brief),null);
  const timeline=buildTimelineFromScenes([{voiceover_text:"Look at the lake.",suggested_visual:"Lakefront view"},
      {voiceover_text:"Now the skyline.",suggested_visual:"Downtown skyline"}]);
  assert.equal(scriptedShortSceneDirectionErrors(brief,timeline).ok,true);
});

test("story-first sends the complete multiline brief to the writer and blocks source truncation", async () => {
  const worker=await readFile(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const route=worker.split("export async function proposeScriptedShortRoute(")[1]
    .split("/*__STUDIO_WORKER_END:proposeScriptedShortRoute__*/")[0];
  assert.match(route,/Idea_Summary: creativeBrief/);
  assert.doesNotMatch(route,/Idea_Summary: prompt\.slice\(0, 2000\)/);
  assert.match(route,/scriptedShortDirectedScenes\(creativeBrief\)/);
  assert.match(route,/source !== "explicit-scene-directions"/);
  assert.match(route,/scriptedShortCheckBriefRequirements\(creativeBrief, timeline, pool\)/);
  const long=sceneBrief+"\n"+"Different ending. ".repeat(120);
  assert.ok(long.length>2000);
  assert.deepEqual(scriptedShortSceneDirections(long).voiceovers,lines.map(x=>x.voice));
});
