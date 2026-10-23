import test from "node:test";
import assert from "node:assert/strict";
import { interpretFactoryProducerFeedback as interpret } from "./factory-producer-feedback.mjs";

test("explicit caption replacement is an executable metadata revision", () => {
 const result = interpret("Set the post caption to: A beautiful evening on the Chicago River");
 assert.equal(result.automatic, true);
 assert.equal(result.fields.Caption_Mode, "Force exact");
 assert.deepEqual(result.changes, ["metadata_only"]);
});
test("explicit narration replacement is executable", () => {
 const result = interpret("Replace the voiceover script with: Welcome to Chicago.");
 assert.equal(result.automatic, true);
 assert.equal(result.fields.Requested_Script, "Welcome to Chicago.");
 assert.deepEqual(result.changes, ["rewrite_narration"]);
});
test("multiple exact directives are interpreted together", () => {
 const result = interpret("Set the caption to: Sunset.\nReplace narration with: Watch the river come alive.");
 assert.equal(result.automatic, true);
 assert.deepEqual(result.changes, ["metadata_only", "rewrite_narration"]);
});
test("do not silently accept missing media, timeline requests, or ambiguous directions", () => {
 for (const note of ["Add three river photos.", "Include a boat clip.", "Change the music to jazz.", "Please make this more cinematic.", ""]) {
   assert.equal(interpret(note).automatic, false, note);
 }
});

test("exact whole-video timing changes are actionable and bounded", () => {
 const result = interpret("Set video duration to: 24 seconds");
 assert.equal(result.automatic, true);
 assert.equal(result.fields.Video_Duration_Seconds, 24);
 assert.deepEqual(result.changes, ["adjust_timing"]);
 const withNarration = interpret("Make the video 30 seconds long\nReplace narration with: Hello again.");
 assert.equal(withNarration.automatic, true);
 assert.deepEqual(withNarration.changes, ["adjust_timing", "rewrite_narration"]);
 for (const text of ["Set video duration to 4 seconds", "Set video duration to 601 seconds", "Slow down transitions", "Use 20 seconds of new video"]) {
  assert.equal(interpret(text).automatic, false, text);
 }
});

test("specific existing media actions are interpreted as executable Producer revisions", () => {
 const result = interpret("Move existing asset photo000000000001 to position 1.\nTrim existing clip clip000000000001 from 2 to 5.5 seconds.");
 assert.equal(result.automatic, true);
 assert.deepEqual(result.changes, ["reorder_media", "trim_clip"]);
 assert.deepEqual(result.media_edits, [
   {operation:"reorder",asset_id:"photo000000000001",position:1},
   {operation:"trim_clip",asset_id:"clip000000000001",in_seconds:2,out_seconds:5.5},
 ]);
});
test("creative asset descriptions without known inventory identifiers remain manual",()=>{
 for(const phrase of ["Add three more Chicago River photos.", "Insert a clip of the boat.", "Reorder the scenes to show the skyline first."]) {
  const value=interpret(phrase);
  assert.equal(value.automatic,false);
  assert.match(value.reason,/verified asset ID|guided asset selection|interpretation|asset-grounded/i);
 }
});

test("Producer parses ordinary named photo/clip direction alongside exact narration", () => {
 const result=interpret("Move the Chicago River Skyline Sunset photo to position 1\nTrim the Navy Pier Boat Approach clip from 2 to 5 seconds\nReplace narration with: Sailing on the river.");
 assert.equal(result.automatic,true);
 assert.deepEqual(result.changes,["reorder_media","trim_clip","rewrite_narration"]);
 assert.equal(result.media_edits[0].asset_name,"Chicago River Skyline Sunset");
 assert.equal(result.media_edits[1].asset_name,"Navy Pier Boat Approach");
 assert.equal(result.fields.Requested_Script,"Sailing on the river.");
});

test("accepts exact classified library names or explicit record IDs for new stills and clips",()=>{
 const photo=interpret("Add library photo named: Chicago River Night");
 assert.equal(photo.automatic,true);
 assert.deepEqual(photo.changes,["add_photos"]);
 assert.deepEqual(photo.media_requests,[{kind:"photo",name:"Chicago River Night"}]);
 const movie=interpret("Include library clip: rec12345678901234");
 assert.equal(movie.automatic,true);
 assert.deepEqual(movie.media_requests,[{kind:"clip",id:"rec12345678901234"}]);
});
test("ambiguous asset language and mixed explicit-inventory edits are not auto-executed",()=>{
 for(const note of [
  "Add three more Chicago River photos",
  "Insert a clip of a boat",
  "Add library photo: recBAD",
  "Add library photo named: Chicago River Night\\nMove asset video000000000001 to position 1",
 ]) assert.equal(interpret(note).automatic,false,note);
});

test("everyday Factory conversations become precise, grounded Producer jobs", () => {
 const duration = interpret("Please make it 20 seconds.");
 assert.equal(duration.automatic, true);
 assert.equal(duration.fields.Video_Duration_Seconds, 20);
 const shorter = interpret("Could you shorten the video to 15 seconds?");
 // Questions may include question marks: no silent guess if unsupported.
 assert.equal(shorter.automatic, false);
 const named = interpret("Please include the photo named Chicago River Night");
 assert.equal(named.automatic, true);
 assert.deepEqual(named.media_requests, [{kind:"photo",name:"Chicago River Night"}]);
 const narration = interpret("Can you replace the narration with: Welcome aboard.");
 assert.equal(narration.automatic, true);
 assert.equal(narration.fields.Requested_Script, "Welcome aboard.");
 const generic = interpret("Please add three more river photos.");
 assert.equal(generic.automatic, false);
});
