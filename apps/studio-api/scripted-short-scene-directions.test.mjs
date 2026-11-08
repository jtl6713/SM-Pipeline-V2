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


const realSevenScenePrompt = [
  "Scene 1 (0-3s): Hook",
  "\t• Visual: Wide gold skyline from the lakefront",
  '\t• On-screen text: "Chicago sunset is at 4:30 now"',
  '\t• VO: "Sunset\'s at 4:30 now. Here\'s where to be."',
  "",
  "Scene 2 (3-7s): Riverwalk",
  "\t• Visual: Slow walking shot, gold light on the glass and water",
  '\t• On-screen text: "1/5"',
  '\t• VO: "Start at the Riverwalk, where the buildings turn to gold."',
  "",
  "Scene 3 (7-10s): The Bean",
  "\t• Visual: Orange sky bending across the surface, with a silhouette for scale",
  '\t• On-screen text: "2/5"',
  '\t• VO: "Hit the Bean for that orange reflection."',
  "",
  "Scene 4 (10-13s): The L",
  "\t• Visual: Train curving between buildings, sunlight flashing through the gaps",
  '\t• On-screen text: "3/5"',
  '\t• VO: "Catch the L curving through the Loop."',
  "",
  "Scene 5 (13-17s): Lakefront Trail",
  "\t• Visual: Backlit runners or bikers with the skyline behind them",
  '\t• On-screen text: "4/5"',
  '\t• VO: "Walk the lakefront with the skyline behind you."',
  "",
  "Scene 6 (17-22s): Finale",
  "\t• Visual: Blue-hour skyline, lights coming on (hold this one longer)",
  '\t• On-screen text: "5/5"',
  '\t• VO: "Then stay till the lights come on." Leave the last 2 seconds silent with just music, so the shot can breathe.',
  "",
  "Scene 7 (22-25s): CTA",
  "\t• Visual: Freeze frame on the skyline",
  '\t• On-screen text: "Save this for your next golden hour" (Instagram: "Send this to someone you\'d watch it with")',
  '\t• VO: "Save this, and go chase it." (Instagram: "Send this to someone who\'d love it.")',
].join("\n");

test("real seven-scene sunset prompt is never collapsed to three or given full-script VO per scene", () => {
  const original = scriptedShortSceneDirections(realSevenScenePrompt);
  assert.equal(original.requested_count, 7);
  assert.equal(original.recognized_voiceovers, 7);
  assert.equal(original.recognized_visuals, 7);
  assert.equal(original.recognized_on_screen_texts, 7);
  assert.deepEqual(original.timings.map(t=>[t.start_seconds,t.end_seconds]),
    [[0,3],[3,7],[7,10],[10,13],[13,17],[17,22],[22,25]]);
  assert.deepEqual(original.on_screen_texts,
    ["Chicago sunset is at 4:30 now","1/5","2/5","3/5","4/5","5/5",
     "Save this for your next golden hour"]);
  assert.equal(original.on_screen_texts_instagram[6],"Send this to someone you'd watch it with");
  assert.equal(original.voiceovers_instagram[6],"Send this to someone who'd love it.");
  assert.equal(original.voiceovers[0],"Sunset's at 4:30 now. Here's where to be.");
  assert.equal(original.voiceovers[5],"Then stay till the lights come on.");
  assert.equal(original.voiceovers[6],"Save this, and go chase it.");
  assert.equal(original.music_only_last_seconds[5],2);
  const scenes=scriptedShortDirectedScenes(realSevenScenePrompt);
  assert.equal(scenes.length,7);
  const timeline=buildTimelineFromScenes(scenes);
  assert.equal(timeline.duration_seconds,25);
  assert.equal(timeline.segments[5].duration_seconds,5);
  assert.equal(timeline.segments[5].music_only_last_seconds,2);
  assert.deepEqual(timeline.segments.map(s=>s.voiceover_text),original.voiceovers);
  assert.equal(scriptedShortCheckBriefRequirements(realSevenScenePrompt,timeline,[]).ok,true);
  const bad=buildTimelineFromScenes(Array.from({length:3},(_,i)=>({
    suggested_visual:"Generic scene "+(i+1),
    voiceover_text:original.voiceovers.join(" "),
  })));
  const failed=scriptedShortCheckBriefRequirements(realSevenScenePrompt,bad,[]);
  assert.equal(failed.ok,false);
  assert.match(failed.errors.join(" "),/exactly 7 scenes/);
  assert.match(failed.errors.join(" "),/voiceover/);
});

test("real scene overlay and Instagram substitution cannot be silently dropped", () => {
  const scenes=scriptedShortDirectedScenes(realSevenScenePrompt);
  delete scenes[6].on_screen_text_instagram;
  delete scenes[6].voiceover_instagram;
  delete scenes[5].music_only_last_seconds;
  const checked=scriptedShortCheckBriefRequirements(realSevenScenePrompt,
    buildTimelineFromScenes(scenes),[]);
  assert.equal(checked.ok,false);
  assert.match(checked.errors.join(" "),/Instagram on-screen text/);
  assert.match(checked.errors.join(" "),/Instagram voiceover/);
  assert.match(checked.errors.join(" "),/music-only hold/);
});

test("story-first Airtable and Studio editor persist all scene-specific production text", async () => {
  const saved=await readFile(new URL("./idea-first-storyboard.mjs",import.meta.url),"utf8");
  const web=await readFile(new URL("../studio-web/assets/story-first-workspace.js",import.meta.url),"utf8");
  for(const key of ["on_screen_text","on_screen_text_instagram","voiceover_instagram",
    "music_only_last_seconds","scene_label"]) {
    assert.ok(saved.includes(key),"server omitted "+key);
    assert.ok(web.includes(key),"web UI omitted "+key);
  }
});
