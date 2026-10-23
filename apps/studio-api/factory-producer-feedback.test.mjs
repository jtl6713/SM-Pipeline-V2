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

test("one or more explicit library photos and clips are executable planned changes", () => {
 const photo = interpret("Add library photos: rec12345678901234, rec98765432109876");
 assert.equal(photo.automatic, true);
 assert.deepEqual(photo.media_asset_ids, ["rec12345678901234", "rec98765432109876"]);
 assert.deepEqual(photo.changes, ["add_photos"]);
 assert.equal(photo.allow_video, false);
 const video = interpret("Include library clip: rec12345678901234");
 assert.equal(video.automatic, true);
 assert.equal(video.allow_video, true);
 assert.deepEqual(video.changes, ["add_clip"]);
});
test("unnamed, ungrounded or nonlibrary media remains blocked", () => {
 for (const note of ["Add three nice river photos", "Include a clip of the train", "Add library photo: recBAD", "Replace any photo"]) {
  assert.equal(interpret(note).automatic, false, note);
 }
});
