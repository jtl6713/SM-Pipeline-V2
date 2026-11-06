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
  assert.match(worker, /const pendingBatchIds = force \? \[\] : await ideaPhotoWaitStage\("intake_batches", \(\) => unfinishedIntakeBatchIds/);
  assert.match(worker, /reason: "manual_match_failed"/);
  assert.match(worker, /reason: "matcher_error"/);
  assert.match(worker, /idea photo-wait error diagnostic write failed/);
});

// Regression from Idea Candidate #1811 ("Best Winter View?") and the
// newly classified "Chicago Winters 1..14" batch. Citywide is scope, not
// a photographic subject; profile isolation remains a separate hard guard.
test("Idea #1811 Citywide winter view discovers high-confidence Chicago Winters photos", () => {
  const keys = buildIdeaLibraryKeys({
    primaryLocation: "Citywide",
    title: "Best Winter View?",
    summary: "Ask followers for their favorite winter skyline viewpoints in Chicago.",
  });
  assert.deepEqual(keys.placeKeys, [], "Citywide must never become a required location anchor");
  assert.ok(keys.subjectKeys.includes("winter"));
  const classified = ["Chicago Winters 1", "Chicago Winters 2", "Chicago Winters 10", "Chicago Winters 14"];
  const ranked = classified.map((name, i) => {
    const row = rankIdeaLibraryFields({
      name: name.toLowerCase(),
      location: "chicago, lake michigan shoreline",
      haystack: [name, "winter skyline, lake michigan, snow, frozen lakefront"].join(" ").toLowerCase(),
      placeKeys: keys.placeKeys,
      subjectKeys: keys.subjectKeys,
      strongIdeaTokens: ["winter", "skyline"],
      ideaTokens: ["best", "winter", "view", "skyline"],
      queryTokens: [],
      today: "2026-10-31",
      intakeDate: "2026-10-31",
    });
    assert.equal(row?.confidence, "high", name + " should be a high-confidence match");
    return { ...row, id: "recChicagoWintersTest" + i, intake_date: "2026-10-31" };
  });
  const result = selectMatchedPhotos({matches: ranked, min: 1, max: 4, force: true});
  assert.equal(result.action, "ready");
  assert.equal(result.selected.length, 4);
  const cityWideNamedPlace = buildIdeaLibraryKeys({
    primaryLocation: "Citywide — Navy Pier",
    title: "Navy Pier Winter Views",
    summary: "Snow and lakefront",
  });
  assert.equal(cityWideNamedPlace.placeKeys.includes("citywide"), false);
  assert.ok(cityWideNamedPlace.placeKeys.includes("navy"));
});

test("production photo ranker strips Citywide without bypassing profile scope", () => {
  const source = readStudioWorkerSource();
  assert.match(source, /const locationForMatching = String\(primaryLocation \|\| ""\)\.replace/);
  const start = source.indexOf("async function rankStillsForIdeaPhotoWait(");
  assert.ok(start > 0, "compiled matcher remains in the deployed Worker");
  const ranker = source.slice(start, start + 2200);
  assert.match(ranker, /mediaAssetProfileScopeForId/);
  assert.match(ranker, /combineAirtableFormulas\(ideaLibraryFilterFormula\(filterKeys\), scopeFormula\)/);
});

test("Chicago Winters assets with exclusions are screened before watermark, then provenance-held candidates are skipped", () => {
  const worker = readStudioWorkerSource();
  const image = worker.slice(worker.indexOf("function ideaLibraryIsEligibleImage("),
    worker.indexOf("/*__STUDIO_WORKER_END:ideaLibraryIsEligibleImage__*/"));
  assert.match(image, /Exclusion_Reasons/);
  assert.match(image, /Potential_Match_Notes/);
  // Automation still fails closed for every exclusion. Low Quality is the
  // sole explicitly authorized *manual* exception; other reasons stay blocked.
  assert.match(image, /reasons\.some\(\(reason\) => reason !== "low quality"\)/);
  assert.match(image, /reasons\.length && !allowLowQuality/);
  const matching = worker.slice(worker.indexOf("async function evaluateAndMaybeAttachWaitingIdeaPhotos("),
    worker.indexOf("/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/"));
  assert.match(matching, /const attachCandidates = usableMatches\.slice/);
  assert.match(matching, /maxWaitAssets: max, minWaitAssets: min/);
  assert.match(matching, /acceptedRows = usableMatches\.filter/);
  assert.match(matching, /Studio_Matched_Media_Assets: acceptedRows\.map/);
  assert.match(matching, /reason = "not_enough_safe_photos"/);
  const attach = worker.slice(worker.indexOf("async function applyLibraryAssetsToProductionRequest("),
    worker.indexOf("/*__STUDIO_WORKER_END:applyLibraryAssetsToProductionRequest__*/"));
  assert.match(attach, /ideaLibraryRejectReason\(media, \{ allowVideo \}\)/);
  assert.match(attach, /photoMatchSkippableOverlayReview\(error\)/);
  assert.match(attach, /if \(appended\.length >= cap\) break/);
  assert.match(attach, /reason: "insufficient_safe_assets"/);
  assert.ok(attach.indexOf("if (ideaLibraryRejectReason") < attach.indexOf("await ensureChicagoWatermarkedLibraryAsset"));
});
