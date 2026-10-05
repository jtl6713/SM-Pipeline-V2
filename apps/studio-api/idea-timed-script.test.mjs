import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assignScenesToStills,
  buildTimelineFromScenes,
  exactVoiceoverText,
  fallbackScenesFromStills,
  formatTimedScriptMarkdown,
  ideaTimedScriptReady,
  mergeTimedScriptNotes,
  pickTimelineCatalog,
  scenesFromModelPayload,
  stillNameKey,
} from "./idea-timed-script.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const STILLS = [
  { id: "recWide1", name: "UpperWestSide_72nd_platform.jpg", location: "Upper West Side", confidence: "high", score: 12 },
  { id: "recOmny2", name: "OMNY_reader_closeup.jpg", location: "72nd Street", confidence: "high", score: 11 },
  { id: "recSign3", name: "Uptown_Bronx_entrance_sign.jpg", location: "Upper West Side", confidence: "high", score: 10 },
  { id: "recMap4", name: "Subway_map_white_black_dots.jpg", location: "NYC", confidence: "medium", score: 8 },
  { id: "recCar5", name: "1_train_interior_doors.jpg", location: "Upper West Side", confidence: "high", score: 9 },
  { id: "recSky6", name: "Hudson_skyline_close.jpg", location: "Upper West Side", confidence: "medium", score: 7 },
];

test("stillNameKey strips extension and punctuation", () => {
  assert.equal(stillNameKey("UpperWestSide_72nd_platform.jpg"), "upperwestside72ndplatform");
  assert.equal(stillNameKey("OMNY reader closeup"), "omnyreadercloseup");
});

test("pickTimelineCatalog prefers high-confidence stills and keeps extras for the model", () => {
  const picked = pickTimelineCatalog(STILLS, { min: 5, max: 6, catalogLimit: 24 });
  assert.equal(picked.catalog.length, 6);
  assert.ok(picked.selected.length >= 5);
  assert.equal(picked.selected[0].id, "recWide1");
  assert.ok(picked.selected.every((row) => row.confidence === "high" || row.confidence === "medium"));
});

test("assignScenesToStills matches exact filenames then fills leftovers in order", () => {
  const scenes = [
    { voiceover_text: "First time on the 1 train?", suggested_visual: "UpperWestSide_72nd_platform.jpg" },
    { voiceover_text: "Tap OMNY.", suggested_visual: "OMNY_reader_closeup.jpg" },
    { voiceover_text: "Check the entrance sign.", suggested_visual: "unknown still" },
  ];
  const assigned = assignScenesToStills(scenes, STILLS);
  assert.equal(assigned[0].media_asset_id, "recWide1");
  assert.equal(assigned[1].media_asset_id, "recOmny2");
  assert.equal(assigned[2].media_asset_id, "recSign3");
  assert.equal(assigned[2].suggested_visual, "Uptown_Bronx_entrance_sign.jpg");
});

test("buildTimelineFromScenes times scenes from spoken length with a 4 second floor", () => {
  const timeline = buildTimelineFromScenes([
    { voiceover_text: "First time on the Upper West Side subway?", suggested_visual: "UpperWestSide_72nd_platform.jpg", media_asset_id: "recWide1" },
    { voiceover_text: "Tap your phone on the OMNY reader and you are through.", suggested_visual: "OMNY_reader_closeup.jpg", media_asset_id: "recOmny2" },
  ]);
  assert.equal(timeline.mode, "timed_script");
  assert.equal(timeline.segments.length, 2);
  assert.equal(timeline.segments[0].start_seconds, 0);
  assert.ok(timeline.segments[0].duration_seconds >= 4);
  assert.equal(timeline.segments[1].start_seconds, timeline.segments[0].end_seconds);
  assert.match(exactVoiceoverText(timeline), /First time on the Upper West Side subway/);
  assert.match(formatTimedScriptMarkdown(timeline), /Suggested still/);
  assert.match(formatTimedScriptMarkdown(timeline), /UpperWestSide_72nd_platform\.jpg/);
  assert.equal(ideaTimedScriptReady(timeline), true);
});

test("fallbackScenesFromStills writes a hook, still names, and a closer", () => {
  const scenes = fallbackScenesFromStills({
    title: "Upper West Side subway, 90 seconds",
    summary: "How to ride the 1 train without looking lost. Check the entrance before you pay.",
    location: "Upper West Side",
  }, STILLS.slice(0, 4));
  assert.equal(scenes.length, 4);
  assert.match(scenes[0].voiceover_text, /Upper West Side subway/);
  assert.equal(scenes[0].suggested_visual, "UpperWestSide_72nd_platform.jpg");
  assert.match(scenes[3].voiceover_text, /Save this/);
});

test("scenesFromModelPayload accepts ITS1 scenes and SAI1 slide_voiceovers", () => {
  const its1 = scenesFromModelPayload({
    scenes: [{ voiceover_text: "Tap OMNY.", suggested_visual: "OMNY_reader_closeup.jpg", media_asset_id: "recOmny2" }],
  }, STILLS);
  assert.equal(its1[0].media_asset_id, "recOmny2");
  const sai1 = scenesFromModelPayload({
    slide_voiceovers: [{ line: "Start at 72nd Street." }, { line: "Tap through." }],
  }, STILLS);
  assert.equal(sai1[0].suggested_visual, "UpperWestSide_72nd_platform.jpg");
  assert.equal(sai1[1].media_asset_id, "recOmny2");
});

test("mergeTimedScriptNotes keeps ez tokens off the JSON line", () => {
  const timeline = buildTimelineFromScenes([
    { voiceover_text: "Hello there neighbors.", suggested_visual: "Sign.jpg", media_asset_id: "still-1" },
    { voiceover_text: "Ride like a local.", suggested_visual: "Train.jpg", media_asset_id: "still-2" },
  ]);
  const merged = mergeTimedScriptNotes("ez-photo-wait=off", timeline);
  assert.match(merged, /^\[timed-script\] \{/);
  assert.match(merged, /\nez-photo-wait=off$/);
  JSON.parse(merged.split("\n")[0].replace(/^\[timed-script\]\s*/, ""));
});

test("Worker advertises the idea timed-script route", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-0625.js"), "utf8");
  const html = await readFile(path.join(here, "../studio-web/index.html"), "utf8");
  assert.match(worker, /isIdeaTimedScriptRoute/);
  assert.match(worker, /createIdeaTimedScriptRoute/);
  assert.match(worker, /from "\.\/idea-timed-script\.mjs"/);
  assert.match(worker, /ready_for_approval/);
  assert.match(worker, /idea-vo-timeline=1/);
  assert.match(worker, /waitAutonomousVariantsReady/);
  assert.match(worker, /createIdeaTimedScriptRoute\(request, env, url, authorization, ctx\)/);
  assert.match(app, /ideasCreateTimelineButton/);
  assert.match(app, /\/timed-script`/);
  assert.match(app, /openProductionRequestForIdea/);
  assert.match(app, /ready_for_approval/);
  assert.match(app, /function rememberIdeaTimedScript/);
  assert.match(app, /function recallIdeaTimedScript/);
  assert.match(app, /productionRequest: result\.production_request/);
  assert.match(app, /successMessage: success/);
  assert.match(app, /timedScriptActive\(\) \? "rendering"/);
  assert.match(app, /function syncProductionVoBanner/);
  assert.match(app, /prOpenRenderingTab/);
  assert.match(html, /id="ideasCreateTimelineButton"/);
  assert.match(html, /id="createIdeaTimelineButton"/);
  assert.match(html, /id="prVoiceoverHandoff"/);
  assert.match(html, /id="prOpenRenderingTab"/);
  const css = await readFile(path.join(here, "../studio-web/assets/styles-phase7-0621.css"), "utf8");
  assert.match(css, /#page-ideas \.page-heading\{\s*flex-wrap:wrap;/);
  assert.match(css, /#page-ideas \.heading-actions\{/);
});
