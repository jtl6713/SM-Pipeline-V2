import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { vibeCutIdeaFields, VIBE_CUT_VERTICAL_KEYS, VIBE_CUT_HORIZONTAL_KEYS } from "./vibe-cut.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(resolve(here, file), "utf8");
const worker = read("worker-functions-01.mjs");
const requests = read("worker-functions-02.mjs");
const plan = read("../studio-web/assets/ez-plan.js");
const app = read("../studio-web/assets/app-item4-1008.js");

test("vertical Vibe Cut creates video Idea and six video/story destinations", () => {
  const fields = vibeCutIdeaFields({ sourceAspect: "vertical", targetSeconds: 15 });
  assert.equal(fields.Production_Content_Type, "Vertical Short Video");
  assert.equal(fields.Production_Video_Duration, 15);
  assert.equal(VIBE_CUT_VERTICAL_KEYS.length, 6);
  assert.equal(new Set(VIBE_CUT_VERTICAL_KEYS).size, 6);
});
test("horizontal Vibe Cut creates longform and Standard + Short", () => {
  const fields = vibeCutIdeaFields({ sourceAspect: "horizontal" });
  assert.equal(fields.Production_Content_Type, "Longform Video");
  assert.deepEqual(fields.Production_Target_Platforms, ["YouTube"]);
  assert.deepEqual([...VIBE_CUT_HORIZONTAL_KEYS], ["YouTube::Standard Video", "YouTube::Short"]);
});
test("no Vibe Cut receives photo or voiceover settings", () => {
  for (const aspect of ["horizontal", "vertical"]) {
    const fields = vibeCutIdeaFields({ sourceAspect: aspect });
    assert.equal(fields.Production_Carousel_Slide_Count, null);
    assert.equal(fields.Production_Carousel_Slide_Count_Mode, null);
    assert.equal(fields.Production_Carousel_Slide_Count_Min, null);
    assert.equal(fields.Production_Carousel_Slide_Count_Max, null);
    assert.equal(fields.Production_Carousel_Image_Mode, null);
    assert.equal(fields.Studio_Photo_Wait_Status, "Not Needed");
    assert.equal(fields.Studio_Photo_Match_JSON, null);
    assert.deepEqual(fields.Studio_Matched_Media_Assets, []);
    assert.equal(fields.Production_Include_Voiceover, "No");
    assert.equal(fields.Production_Include_Background_Music, "Yes");
    assert.equal(fields.Production_Include_Thumbnail, "Yes");
  }
});
test("Idea creation applies video normalization in initial POST before photo matching", () => {
  assert.match(worker, /\.\.\.\(vibeCut \? vibeCutIdeaFields\(/);
  assert.match(worker, /if \(ctx\?\.waitUntil && !vibeCut\)/);
});
test("Idea update reasserts video normalization on reload", () => {
  assert.match(worker, /const vibeCut = isVibeCutNotes\(f\(record, "Idea_Summary"\)\)/);
  assert.match(worker, /sourceAspect: payload\?\.source_aspect/);
});
test("upload and compression updates cannot replace city or type", () => {
  assert.match(worker, /delete patch\.Primary_Location/);
  assert.match(worker, /delete patch\.Master_Content_Type/);
});
test("Vibe Cut video uploads remain mandatory independent of photo count", () => {
  assert.match(plan, /kind === EZ_INPUTS\.VIBE_CUT \|\| kind === EZ_INPUTS\.VIDEO_CLIPS\) return 0/);
  assert.match(plan, /if \(kind === EZ_INPUTS\.VIBE_CUT\) return 1/);
});
test("Vibe Cut plan always resolves source aspect before photo formats", () => {
  assert.match(plan, /if \(ezIsVibeCutInput\(answers\.inputKind\)\) \{/);
  assert.match(plan, /return ezPlanFromSourceAspect/);
});
test("request normalizer checks Vibe Cut before slide-count parsing", () => {
  assert.match(requests, /const vibeCut = isVibeCutNotes\(payload\?\.production_notes\)/);
  assert.match(requests, /const slideCountApplies = \["Carousel", "Photo Set", "Feed Post"\]\.includes\(contentType\)/);
});
test("video Ideas show no unknown photo ranges", () => {
  assert.match(app, /function ideaIsVideoContent\(record\)/);
  assert.match(app, /if \(ideaIsVideoContent\(record\)\)/);
  assert.doesNotMatch(app.slice(app.indexOf("function ideaStructureLabel"), app.indexOf("function ideaProductionLabel")), /\|\| "\?"/);
});
