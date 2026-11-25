import assert from "node:assert/strict";
import test from "node:test";
import { buildIdeaLibraryKeys, ideaLibraryFilterKeys, ideaLibraryTokens, ideaLibraryStrongTokens, rankIdeaLibraryFields, selectMatchedPhotos } from "./idea-photo-wait.mjs";
import { libraryAssetSearchOrFilter } from "./supabase-pipeline-reads.mjs";

const brief = { primaryLocation: "Willow Street", neighborhood: "Brooklyn Heights",
  title: "Brooklyn Heights Stoops", summary: "Photo study of stoops, doors, and cornices in golden hour." };
const keys = buildIdeaLibraryKeys(brief);
const ideaTokens = ideaLibraryTokens([brief.title,brief.summary,brief.primaryLocation].join(" "));
const rank = (location,name,subject) => rankIdeaLibraryFields({
  ...keys, location, name, haystack: [location,name,subject].join(" "),
  ideaTokens, strongIdeaTokens: ideaLibraryStrongTokens(ideaTokens), today:"2026-11-24", intakeDate:"2026-11-24",
});

test("3025: street-level brief includes the structured neighborhood in candidate prefilter", () => {
  assert.ok(keys.placeKeys.includes("willow"));
  assert.ok(keys.placeKeys.includes("brooklyn heights"));
  assert.ok(keys.neighborhoodSubjectKeys.includes("stoops"));
  assert.ok(!keys.subjectKeys.includes("heights"));
  const filter = libraryAssetSearchOrFilter("", ideaLibraryFilterKeys(keys.placeKeys,keys.subjectKeys));
  assert.match(filter, /asset_name\.ilike\.\*brooklyn\*heights\*/);
  assert.match(filter, /metadata->>visible_subjects\.ilike/);
  assert.doesNotMatch(filter, /asset_name\.ilike\.\*brooklyn\*,/);
});

test("3025: twelve fresh matching uploads reach the threshold without exact street metadata", () => {
  const matches = Array.from({length:12},(_,i) => {
    const result = rank("Brooklyn Heights, Brooklyn, New York City", "Brooklyn Heights " + (i+1), "brownstone stoop, front door, iron railings");
    assert.equal(result?.confidence,"high");
    assert.ok(result.match_reasons.includes("neighborhood_subject:brooklyn heights"));
    return {...result,id:"asset-"+i,intake_date:"2026-11-24"};
  });
  for (const force of [true,false]) {
    const result = selectMatchedPhotos({matches,min:5,max:10,force,pendingBatchIds:[]});
    assert.equal(result.action,"ready");
    assert.equal(result.high_count,12);
    assert.equal(result.selected.length,10);
  }
});

test("3025: exact area alone and outside-area stoops do not qualify for neighborhood fallback", () => {
  assert.equal(rank("Brooklyn Heights, Brooklyn, New York City","Brooklyn Heights Promenade","skyline, river, benches, golden hour"),null);
  assert.equal(rank("Park Slope, Brooklyn, New York City","Park Slope 1","brownstone stoop, front door"),null);
  assert.equal(rank("Willow Street, Brooklyn","Willow Street 1","historic architecture")?.confidence,"high");
});

test("3025: fallback works for an unlisted neighborhood and punctuation variants, not a generic city", () => {
  const local = buildIdeaLibraryKeys({primaryLocation:"Example Avenue",neighborhood:"Example Heights",title:"Example Heights Murals"});
  const hit = rankIdeaLibraryFields({...local,location:"Example-Heights",name:"Photo 1",haystack:"painted mural"});
  assert.equal(hit?.confidence,"high");
  const generic = buildIdeaLibraryKeys({primaryLocation:"Willow Street",neighborhood:"New York City",title:"Brooklyn Heights Stoops"});
  assert.equal(generic.neighborhoodKey,"");
});
