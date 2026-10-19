import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIdeaLibraryKeys,
  rankIdeaLibraryFields,
  selectMatchedPhotos,
} from "./idea-photo-wait.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const location = "Vizcaya Museum and Gardens, Miami, Florida";
const uploads = [
  ["Vizcaya Gardens 1", "formal gardens, stone fountain and Miami villa"],
  ["Vizcaya Gardens 2", "ornate historic stone garden facade and flowering plants"],
  ["Vizcaya Gardens 3", "circular fountain basin and symmetrical formal gardens"],
  ["Vizcaya Gardens 4", "ornate stone wall, arch and garden foliage"],
  ["Vizcaya Gardens 5", "broad stone garden staircase with ornate railings"],
  ["Vizcaya Gardens 6", "stone staircase, garden hedges, statues and fountain"],
  ["Vizcaya Gardens 7", "stone balustrades, stairways and reflecting pool"],
  ["Vizcaya Gardens 8", "geometric hedge gardens, stone statues and columns"],
  ["Vizcaya Gardens 9", "topiary, stone statues and formal garden terrace"],
];

test("Vizcaya Garden Textures ranks at least five newly classified Vizcaya Gardens photos high", () => {
  const title = "Vizcaya Garden Textures";
  const summary = "A photo set focusing on stone, fountains, and bay views.";
  const keys = buildIdeaLibraryKeys({ title, summary, primaryLocation: "Vizcaya Museum" });
  const matches = uploads.map(([name, description], index) => {
    const ranked = rankIdeaLibraryFields({
      location: location.toLowerCase(),
      name: name.toLowerCase(),
      haystack: [name, description, location].join(" ").toLowerCase(),
      placeKeys: keys.placeKeys,
      subjectKeys: keys.subjectKeys,
      strongIdeaTokens: [],
      ideaTokens: [],
      queryTokens: [],
      today: "2026-10-19",
      intakeDate: "2026-10-19",
    });
    assert.equal(ranked?.confidence, "high", name + " must be high-confidence");
    return { ...ranked, id: "recVizcayaFixture" + index, intake_date: "2026-10-19" };
  });

  const result = selectMatchedPhotos({
    matches,
    min: 5,
    max: 5,
    force: true,
  });
  assert.equal(result.action, "ready");
  assert.equal(result.selected.length, 5);
  assert.equal(new Set(result.selected.map((row) => row.id)).size, 5);
});

test("manual matching skips unnecessary unfinished-intake scans and errors leave durable diagnostics", () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /const pendingBatchIds = force \? \[\] : await unfinishedIntakeBatchIds/);
  assert.match(worker, /reason: "manual_match_failed"/);
  assert.match(worker, /reason: "matcher_error"/);
  assert.match(worker, /idea photo-wait error diagnostic write failed/);
});
