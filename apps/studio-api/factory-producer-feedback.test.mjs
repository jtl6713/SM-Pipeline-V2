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
 const withNarration = interpret("Make the video 30 seconds long\\nReplace narration with: Hello again.");
 assert.equal(withNarration.automatic, true);
 assert.deepEqual(withNarration.changes, ["adjust_timing", "rewrite_narration"]);
 for (const text of ["Set video duration to 4 seconds", "Set video duration to 601 seconds", "Slow down transitions", "Use 20 seconds of new video"]) {
  assert.equal(interpret(text).automatic, false, text);
 }
});
