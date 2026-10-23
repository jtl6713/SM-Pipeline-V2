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
