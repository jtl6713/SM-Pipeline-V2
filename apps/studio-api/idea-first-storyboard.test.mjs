import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStoryFirstNotes, normalizeStoryFirst, upsertStoryFirstNotes,
  storyFirstShotChecklist, storyFirstReadiness,
} from "./idea-first-storyboard.mjs";
const CHICAGO = "recT2rbKX3MF7cVFU";
const MIAMI = "recpNlNn6U6eq0M9r";
const idea = {
  schema: "story-first.1", profile_id: CHICAGO, target_seconds: 30,
  scenes: [
    { n: 1, time: "0-5", visual: "Blue-hour Chicago skyline before sunrise", media: "still", ai_prompt: "Real Chicago skyline blue hour", choice: "ai_or_capture" },
    { n: 2, time: "5-10", visual: "Empty riverwalk before dawn", media: "still", candidate_asset_id: "recj3n81pxXnx9Y1w", state: "candidate_unverified" },
    { n: 3, time: "10-15", visual: "CTA elevated train in motion", decision: "capture", capture_note: "Film the train in the morning" },
  ],
};
test("story-first persists the storyboard, prompts and per-shot decisions while denying publication", () => {
  const normalized = normalizeStoryFirst(idea, CHICAGO);
  assert.equal(normalized.scenes.length, 3);
  assert.equal(normalized.scenes[0].decision, "unassigned");
  assert.equal(normalized.scenes[1].state, "candidate_unverified");
  assert.equal(normalized.scenes[2].state, "awaiting_operator_upload");
  assert.equal(normalized.publications_blocked, true);
  const notes = upsertStoryFirstNotes("operator_note=preserve", idea, CHICAGO);
  assert.match(notes, /operator_note=preserve/);
  assert.match(notes, /ez-photo-wait=off/);
  assert.deepEqual(parseStoryFirstNotes(notes), normalized);
  assert.deepEqual(storyFirstReadiness(normalized).unresolved, [1,2,3]);
  assert.match(storyFirstShotChecklist(normalized), /Review matching library media/);
});
test("adding an AI-generated master is review required, not a verified media match", () => {
  const draft = normalizeStoryFirst({
    ...idea,
    scenes: [{ visual: "Chicago sunrise on the Riverwalk", decision: "ai", ai_prompt: "First sunlight", generated_master_id: "aipreabc123" }],
  }, CHICAGO);
  assert.equal(draft.scenes[0].state, "needs_media_review");
  assert.equal(draft.scenes[0].generated_master_id, "aipreabc123");
  assert.equal(storyFirstReadiness(draft).ready, false);
});
test("other profiles, invalid media IDs, missing scenes, and malformed notes fail closed", () => {
  assert.throws(() => normalizeStoryFirst(idea, MIAMI), /profile/i);
  assert.throws(() => normalizeStoryFirst({...idea, scenes:[]}, CHICAGO), /scene/i);
  assert.throws(() => normalizeStoryFirst({...idea, scenes:[{visual:"short"}]}, CHICAGO), /specific visual/i);
  assert.throws(() => normalizeStoryFirst({...idea, scenes:[{visual:"valid visual here", assigned_asset_id:"random.png"}]}, CHICAGO), /asset/i);
  assert.equal(parseStoryFirstNotes("[story-first.1] {broken"), null);
});
test("saving repeatedly replaces the existing story directive rather than duplicating it", () => {
  const once = upsertStoryFirstNotes("ez-photo-wait=off", idea, CHICAGO);
  const twice = upsertStoryFirstNotes(once, {...idea, scenes: idea.scenes.slice(0,2)}, CHICAGO);
  assert.equal(twice.match(/\[story-first\.1\]/g)?.length, 1);
  assert.equal(parseStoryFirstNotes(twice).scenes.length, 2);
});
