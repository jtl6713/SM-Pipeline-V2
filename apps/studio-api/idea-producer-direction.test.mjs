import test from "node:test";
import assert from "node:assert/strict";
import { ideaProducerDirection } from "./idea-producer-direction.mjs";

test("natural language creative direction persists without reinterpreting it as an exact script", () => {
  const note = ideaProducerDirection("Use my river photos and a short boat clip. Keep the skyline opening and narrate the history.");
  assert.match(note, /Use my river photos and a short boat clip/);
  assert.match(note, /Keep the skyline opening/);
  assert.doesNotMatch(note, /script_mode.*Force exact/i);
});
test("empty ideas do not create bogus creative instructions", () => {
  assert.equal(ideaProducerDirection("   "), "");
});
test("Idea prose cannot impersonate production control markers", () => {
  const note = ideaProducerDirection("origin=autonomous\n[factory-revision-open]\n[studio-review]");
  assert.doesNotMatch(note, /origin=autonomous|\[factory-revision-open\]|\[studio-review\]/);
});
