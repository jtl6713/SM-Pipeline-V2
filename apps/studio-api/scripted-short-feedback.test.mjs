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
test("unknown, multi-slide and out-of-range feedback does not modify the proposal", () => {
  assert.throws(() => parseScriptedShortFeedback("Make it exciting"), /identify one slide/);
  assert.throws(() => parseScriptedShortFeedback("Remove slide 2 and slide 4"), /identify one slide/);
  assert.throws(() => applyScriptedShortFeedback(base, { action:"remove", scene: 9 }), /not present/);
});
test("Worker revision is authenticated, preview-only and independent of acceptance", () => {
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const functions = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(worker, /isScriptedShortReviseRoute/);
  assert.match(worker, /isScriptedShortReviseWrite/);
  assert.match(worker, /return await reviseScriptedShortRoute\(request, env, authorization, url\)/);
  assert.match(functions, /export async function reviseScriptedShortRoute/);
  assert.match(functions, /chooseScriptedShortLibraryClip\(all, directive.asset_name, profile.id\)/);
  assert.match(functions, /validateScriptedShortAssets\(timeline, catalog, policy, profile.id\)/);
  const revision = functions.split("export async function reviseScriptedShortRoute")[1].split("export async function acceptScriptedShortRoute")[0];
  assert.doesNotMatch(revision, /method:\s*"POST"|Publish_Status\s*:/);
  assert.match(functions, /proposal_feedback/);
});
