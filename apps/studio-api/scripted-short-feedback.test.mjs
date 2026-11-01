import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseScriptedShortFeedback,
  chooseScriptedShortLibraryClip,
  applyScriptedShortFeedback,
} from "./scripted-short-feedback.mjs";

const clips = [
  { id: "recCentralPark1", fields: {
    "Asset Name": "Central Park At Night 1.mp4",
    "Google Drive File ID": "drive-abc",
    MIME_Type: "video/mp4",
    Content_Profile: ["recNYC"],
    Duration_Seconds: 16,
  }},
];
const segments = Array.from({ length: 6 }, (_, index) => ({
  asset_id: "recExisting" + index,
  suggested_visual: "Original " + (index + 1),
  voiceover_text: "Narration " + (index + 1),
  duration_seconds: 4,
}));
const base = { duration_seconds: 24, segments };
test("example feedback identifies slide 4 and exact uploaded filename on a new line", () => {
  const parsed = parseScriptedShortFeedback("Looks good, but please remove slide 4 and replace with the following clip which I just uploaded.\n-Central Park At Night 1");
  assert.deepEqual(parsed, { action: "replace", scene: 4, asset_name: "Central Park At Night 1" });
});
test("replacement also accepts a direct sentence", () => {
  assert.deepEqual(parseScriptedShortFeedback("Replace slide 4 with Central Park At Night 1"), {
    action: "replace", scene: 4, asset_name: "Central Park At Night 1",
  });
});
test("revisions only affect the named scene and keep voiceover/order", () => {
  const operation = parseScriptedShortFeedback("Replace slide 4 with Central Park At Night 1");
  const clip = chooseScriptedShortLibraryClip(clips, operation.asset_name, "recNYC");
  const revised = applyScriptedShortFeedback(base, operation, clip);
  assert.equal(revised.segments.length, 6);
  assert.equal(revised.segments[3].asset_id, "recCentralPark1");
  assert.equal(revised.segments[3].voiceover_text, "Narration 4");
  assert.deepEqual(revised.segments.slice(0, 3), segments.slice(0, 3));
  assert.deepEqual(revised.segments.slice(4), segments.slice(4));
  assert.deepEqual(base.segments, segments);
});
test("removing a slide renumbers later scenes without mutating original", () => {
  const revised = applyScriptedShortFeedback(base, parseScriptedShortFeedback("Remove slide 4"));
  assert.equal(revised.segments.length, 5);
  assert.equal(revised.segments[3].voiceover_text, "Narration 5");
  assert.equal(base.segments.length, 6);
  assert.throws(() => applyScriptedShortFeedback(revised, { action: "remove", scene: 1 }), /fewer than five/);
});
test("unmatched, ambiguous, wrong-profile, nonvideo and unready clips fail closed", () => {
  assert.throws(() => chooseScriptedShortLibraryClip(clips, "Other Clip", "recNYC"), /No exact/);
  assert.throws(() => chooseScriptedShortLibraryClip([...clips, ...clips], "Central Park At Night 1", "recNYC"), /More than one/);
  assert.throws(() => chooseScriptedShortLibraryClip(clips, "Central Park At Night 1", "recChicago"), /another profile/);
  assert.throws(() => chooseScriptedShortLibraryClip([{ ...clips[0], fields: {...clips[0].fields, MIME_Type: "image/jpeg", "Asset Name":"Central Park At Night 1"}}], "Central Park At Night 1", "recNYC"), /not a video/);
  assert.throws(() => chooseScriptedShortLibraryClip([{ ...clips[0], fields: {...clips[0].fields, "Google Drive File ID":""}}], "Central Park At Night 1", "recNYC"), /Google Drive/);
});
test("unknown, out-of-range and ambiguous feedback does not modify the proposal", () => {
  assert.throws(() => parseScriptedShortFeedback("Make it exciting"), /specific slide/);
  assert.throws(() => parseScriptedShortFeedback("Change slide 3"), /narration.*Timing/);
  assert.throws(() => applyScriptedShortFeedback(base, { action:"remove", scene: 9 }), /not present/);
});
test("Worker revision is authenticated, preview-only and independent of acceptance", () => {
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const functions = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(worker, /isScriptedShortReviseRoute/);
  assert.match(worker, /isScriptedShortReviseWrite/);
  assert.match(worker, /return await reviseScriptedShortRoute\(request, env, authorization, url\)/);
  assert.match(functions, /export async function reviseScriptedShortRoute/);
  assert.match(functions, /chooseScriptedShortLibraryClip\(all, name, profile.id\)/);
  assert.match(functions, /validateScriptedShortAssets\(timeline,\s*catalog,\s*policy,\s*profile.id\)/);
  const revision = functions.split("export async function reviseScriptedShortRoute")[1].split("export async function acceptScriptedShortRoute")[0];
  assert.doesNotMatch(revision, /method:\s*"POST"|Publish_Status\s*:/);
  assert.match(functions, /proposal_feedback/);
});

test("semicolon-separated conversational feedback retains exact clip titles",()=>{
  const parsed=parseScriptedShortFeedback("Replace slide 2 with Times Square 2; remove slide 4; move slide 5 before slide 3");
  assert.deepEqual(parsed,{actions:[
    {action:"replace",scene:2,asset_name:"Times Square 2"},
    {action:"remove",scene:4},
    {action:"move",scene:5,position:"before",target_scene:3},
  ]});
  const candidate={id:"recTimesSquare2",name:"Times Square 2.mp4",media_kind:"video",media_type:"video/mp4"};
  const revised=applyScriptedShortFeedback(base,{actions:parsed.actions.map(x=>x.action==="replace"?{...x,clip:candidate}:x)});
  assert.equal(revised.segments.length,5);
  assert.equal(revised.segments[1].asset_id,candidate.id);
  assert.deepEqual(revised.segments.map(s=>s.voiceover_text),["Narration 1","Narration 2","Narration 5","Narration 3","Narration 6"]);
});
test("one natural-language request removes multiple scenes by their ORIGINAL positions", () => {
  const plan = { ...base, segments: [...segments, {voiceover_text:"Narration 7"}] };
  const parsed = parseScriptedShortFeedback("Please remove slides 2 and 4");
  assert.deepEqual(parsed,{actions:[{action:"remove",scene:2},{action:"remove",scene:4}]});
  const revised=applyScriptedShortFeedback(plan,parsed);
  assert.deepEqual(revised.segments.map(s=>s.voiceover_text),["Narration 1","Narration 3","Narration 5","Narration 6","Narration 7"]);
  assert.equal(plan.segments.length,7);
});
test("distinct replacement assets in the same feedback remain correctly scoped and atomic", () => {
  const parsed=parseScriptedShortFeedback("Replace slide 2 with Central Park At Night 1 and replace slide 5 with Times Square 2");
  assert.deepEqual(parsed.actions.map(x=>x.scene),[2,5]);
  const a=chooseScriptedShortLibraryClip(clips,parsed.actions[0].asset_name,"recNYC");
  const b={...a,id:"recTimesSquare2",name:"Times Square 2.mp4"};
  const revised=applyScriptedShortFeedback(base,{actions:[{...parsed.actions[0],clip:a},{...parsed.actions[1],clip:b}]});
  assert.equal(revised.segments[1].asset_id,a.id);
  assert.equal(revised.segments[4].asset_id,b.id);
  assert.equal(revised.segments[4].voiceover_text,"Narration 5");
  assert.equal(base.segments[1].asset_id,"recExisting1");
});
test("move and narration updates resolve original scene references and preserve the other segments",()=>{
  const parsed=parseScriptedShortFeedback('Move slide 5 before slide 2; change slide 3 narration to "Welcome to New York after sunset"');
  assert.deepEqual(parsed,{actions:[
    {action:"move",scene:5,position:"before",target_scene:2},
    {action:"narration",scene:3,text:"Welcome to New York after sunset"},
  ]});
  const revised=applyScriptedShortFeedback(base,parsed);
  assert.deepEqual(revised.segments.map(s=>s.voiceover_text),[
    "Narration 1","Narration 5","Narration 2","Welcome to New York after sunset","Narration 4","Narration 6"
  ]);
});
test("multi-removal and conflicting edits fail closed without changing the original",()=>{
  const parsed=parseScriptedShortFeedback("Remove slides 2 and 4");
  assert.throws(()=>applyScriptedShortFeedback(base,parsed),/fewer than five/);
  assert.throws(()=>parseScriptedShortFeedback("Remove slide 2 and replace slide 2 with Times Square 2"),/conflicting/);
  assert.throws(()=>parseScriptedShortFeedback("Set slide 2 duration to 6 seconds"),/recorded narration/);
  assert.deepEqual(base.segments,segments);
});
test("unhandled extra creative instructions cannot be silently marked as completed",()=>{
  assert.throws(()=>parseScriptedShortFeedback("Replace slide 3 with Central Park At Night 1 and make the intro punchier"),/unsupported/);
  assert.throws(()=>applyScriptedShortFeedback(base,parseScriptedShortFeedback("Move slide 3 after slide 99")),/move target/);
  assert.deepEqual(base.segments,segments);
});
