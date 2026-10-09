import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assignOwnedScenes,
  assignScenesToStills,
  buildTimelineFromScenes,
  exactVoiceoverText,
  ensureRelevantVideoScene,
  fallbackProposalScenes,
  fallbackScenesFromStills,
  formatTimedScriptMarkdown,
  ideaTimedScriptReady,
  mergeTimedScriptNotes,
  singleImageFeedPostIds,
  pickTimelineCatalog,
  scenesFromModelPayload,
  scenesFromProposalPayload,
  scriptedShortProposalReady,
  stillNameKey,
  timelineCatalogIsVideo,
  timelineCatalogIsRelevantVideo,
  timedScriptFromNotes,
  unassignedSuggestionCount,
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

test("Chicago River bridge proposals keep relevant MP4 clips with stills and their media metadata", () => {
  const bridgeMedia = [
    { id: "recBridgeStill1", name: "Chicago River Bridge Open 1.jpeg", media_type: "image/jpeg", confidence: "high", score: 40 },
    { id: "recBridgeStill2", name: "Chicago River Bridge Open 3.jpeg", media_type: "image/jpeg", confidence: "high", score: 38 },
    { id: "recBridgeClip14", name: "Chicago-River-Bridge-14.mp4", media_type: "video/mp4", media_kind: "video", confidence: "medium", score: 24, duration_seconds: 9.87 },
  ];
  const picked = pickTimelineCatalog(bridgeMedia, { min: 3, max: 3, catalogLimit: 3 });
  assert.equal(picked.selected[0].id, "recBridgeClip14");
  assert.ok(picked.selected.some((row) => row.id === "recBridgeStill1"));

  const scenes = ensureRelevantVideoScene([
    { voiceover_text: "Chicago's bridges still move the city.", suggested_visual: "Chicago River Bridge Open 1.jpeg", asset_id: "recBridgeStill1", shot_status: "owned" },
    { voiceover_text: "Watch the span rise over the river.", suggested_visual: "Bridge opening shot", asset_id: "", shot_status: "suggestion" },
  ], picked.selected);
  assert.equal(scenes[1].asset_id, "recBridgeClip14");
  assert.equal(scenes[1].media_type, "video/mp4");
  assert.equal(scenes[1].source_duration_seconds, 9.87);
  const timeline = buildTimelineFromScenes(scenes);
  assert.equal(timeline.segments[1].media_type, "video/mp4");
  assert.equal(timeline.segments[1].source_duration_seconds, 9.87);
  assert.equal(timelineCatalogIsVideo(picked.selected[0]), true);
});

test("scripted short proposals do not force an irrelevant video clip", () => {
  const catalog = [
    { id: "recBridgeStill1", name: "Chicago River Bridge.jpeg", media_type: "image/jpeg", confidence: "high", score: 40 },
    { id: "recMiamiClip", name: "Miami-Beach-Waves.mp4", media_type: "video/mp4", media_kind: "video", confidence: "low", score: 2, duration_seconds: 8 },
  ];
  const scenes = [{ voiceover_text: "The bridge opens downtown.", suggested_visual: "Chicago River Bridge.jpeg", asset_id: "recBridgeStill1", shot_status: "owned" }];
  assert.deepEqual(ensureRelevantVideoScene(scenes, catalog), scenes);
  const picked = pickTimelineCatalog(catalog, { min: 1, max: 2 });
  assert.deepEqual(picked.selected.map((row) => row.id), ["recBridgeStill1"]);
  assert.equal(timelineCatalogIsRelevantVideo(catalog[1]), false);
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

test("assignScenesToStills reuses relevant media when scenes outnumber assets", () => {
  const scenes = Array.from({ length: 7 }, (_, index) => ({
    voiceover_text: `Bridge scene ${index + 1}`,
    suggested_visual: "Chicago River bridge",
  }));
  const assigned = assignScenesToStills(scenes, STILLS);
  assert.equal(assigned.length, 7);
  assert.ok(assigned.every((scene) => scene.asset_id && scene.media_asset_id));
  assert.equal(new Set(assigned.slice(0, 6).map((scene) => scene.asset_id)).size, 6);
  assert.ok(STILLS.some((asset) => asset.id === assigned[6].asset_id));
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

test("a scripted short keeps owned files and leaves unmatched shots unassigned", () => {
  const scenes = assignOwnedScenes([
    { voiceover_text: "Start on the platform.", suggested_visual: "UpperWestSide_72nd_platform.jpg" },
    { voiceover_text: "You still need the ferry bow.", suggested_visual: "Vertical frame of the orange ferry that is not in the library yet." },
  ], STILLS);
  assert.equal(scenes[0].shot_status, "owned");
  assert.equal(scenes[0].asset_id, "recWide1");
  assert.equal(scenes[1].shot_status, "suggestion");
  assert.equal(scenes[1].asset_id, "");
  assert.match(scenes[1].suggested_visual, /not in the library/);
  const timeline = buildTimelineFromScenes(scenes);
  assert.equal(scriptedShortProposalReady(timeline), true);
  assert.equal(unassignedSuggestionCount(timeline), 1);
  assert.equal(timeline.segments[0].duration_seconds >= 4, true);
  const notes = mergeTimedScriptNotes("scripted-short=proposal", timeline);
  assert.equal(unassignedSuggestionCount(timedScriptFromNotes(notes)), 1);
});

test("proposal payload does not invent a library file for an unknown id", () => {
  const scenes = scenesFromProposalPayload({
    scenes: [
      { voiceover_text: "Tap OMNY.", suggested_visual: "OMNY reader", media_asset_id: "recOmny2" },
      { voiceover_text: "Need the bow.", suggested_visual: "Ferry bow", media_asset_id: "recMissing" },
    ],
  }, STILLS);
  assert.equal(scenes[0].shot_status, "owned");
  assert.equal(scenes[1].shot_status, "suggestion");
  assert.equal(scenes[1].asset_id, "");
});

test("fallback proposal mixes library stills with shots still to create", () => {
  const scenes = fallbackProposalScenes("Staten Island Ferry tricks", STILLS.slice(0, 2));
  assert.ok(scenes.some((scene) => scene.shot_status === "owned"));
  assert.ok(scenes.some((scene) => scene.shot_status === "suggestion"));
  assert.match(scenes[0].voiceover_text, /Staten Island Ferry tricks/);
});

test("a single-image feed post keeps its one matched still and skips a video timeline", () => {
  assert.equal(singleImageFeedPostIds({ contentType: "Vertical Short Video", matchedIds: ["recPhoto1"] }), null);
  assert.deepEqual(singleImageFeedPostIds({
    contentType: "Feed Post",
    matchedIds: ["recPhoto1", "recPhoto1", "not-an-id"],
  }), ["recPhoto1"]);
  assert.deepEqual(singleImageFeedPostIds({ contentType: "Feed Post", matchedIds: [] }), []);
  assert.deepEqual(singleImageFeedPostIds({
    contentType: "Feed Post",
    matchedIds: ["recPhoto1", "recPhoto2"],
  }), ["recPhoto1", "recPhoto2"]);
  assert.deepEqual(singleImageFeedPostIds({
    contentType: "Feed Post",
    matchedIds: [{ id: "recPhoto1" }],
  }), ["recPhoto1"]);
});

test("Worker advertises the idea timed-script route", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "../studio-web/index.html"), "utf8");
  assert.match(worker, /isIdeaTimedScriptRoute/);
  assert.match(worker, /createIdeaTimedScriptRoute/);
  assert.match(worker, /from "\.\/idea-timed-script\.mjs"/);
  assert.match(worker, /ready_for_approval/);
  assert.match(worker, /idea-vo-timeline=1/);
  assert.match(worker, /waitAutonomousVariantsReady/);
  assert.match(worker, /createIdeaTimedScriptRoute\(request, env, url, authorization, ctx\)/);
  assert.match(worker, /acceptSingleImageFeedPost/);
  assert.match(worker, /single_image_feed_post/);
  assert.match(worker, /singleImageFeedPostIds/);
  assert.match(app, /single_image_feed_post/);
  assert.match(app, /Preparing this feed post from the one photo/);
  assert.match(worker, /deterministic-fallback/);
  assert.match(worker, /idea timeline writer failed; using deterministic fallback/);
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
  assert.match(html, /id="scriptedShortPropose"/);
  assert.match(html, /id="scriptedShortAccept"/);
  assert.match(html, /id="scriptedShortDecline"/);
  assert.match(app, /\/api\/scripted-short\/propose/);
  assert.match(app, /\/api\/scripted-short\/accept/);
  assert.match(worker, /scripted-short\/propose/);
  assert.match(worker, /isScriptedShortProposeWrite/);
  assert.match(worker, /isScriptedShortAcceptWrite/);
  assert.match(worker, /scriptedShortUnassignedMessage/);
  assert.match(worker, /scripted-short=proposal/);
  assert.match(worker, /rankVideosForScriptedShortProposal/);
  assert.match(worker, /ideaLibraryVideoFilterFormula/);
  assert.match(worker, /scripted short video discovery failed/);
  assert.match(worker, /allowVideo: true/);
  assert.match(worker, /0\.10\.478-engagement-approve-blocks-comment/);
  const css = await readFile(path.join(here, "../studio-web/assets/styles-phase7-0621.css"), "utf8");
  assert.match(css, /#page-ideas \.page-heading\{\s*flex-wrap:wrap;/);
  assert.match(css, /#page-ideas \.heading-actions\{/);
});
