import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
const librarySource = readFileSync(new URL("worker-functions-03.mjs", here), "utf8");
const cacheSource = readFileSync(new URL("worker-functions-01.mjs", here), "utf8");
const getFunction = (source, name) => {
  const begin = source.indexOf("export async function " + name + "(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:" + name + "__*/", begin);
  assert.ok(begin >= 0 && end > begin, "Missing " + name);
  return source.slice(begin, end);
};
const list = getFunction(librarySource, "listAssetLibrary");

test("Library resolves profile scope once and uses same resolution in response filter", () => {
  assert.match(list, /const scopeProfile = requestedIds\.length \|\| needsProfile/);
  assert.match(list, /await resolveLibraryScopeProfile\(env, authorization, url\)/);
  assert.doesNotMatch(list, /await resolveLibraryScopeProfileId\(/);
  assert.doesNotMatch(list, /await libraryProfileScopeFormula\(/);
  assert.match(list, /profileName: f\(scopeProfile, "Profile_Name"\)/);
});

test("Library coalesces only identical authoritative Airtable requests", () => {
  assert.match(list, /const pageOptions = \{/);
  assert.match(list, /"library:page:" \+ JSON\.stringify\(pageOptions\), 8000/);
  assert.match(list, /"library:profiles", 15000/);
  assert.match(list, /listRecordsPage\(env, env\.AIRTABLE_MEDIA_TABLE_ID, pageOptions\)/);
  assert.match(list, /requestedIds\.length \? libraryRecordIdsFilterFormula\(requestedIds\)/);
  assert.match(list, /scopeFormula/);
});

test("An authoritative media or profile write invalidates cached Library data", () => {
  const begin = cacheSource.indexOf("export function studioInvalidateHotReads(");
  const end = cacheSource.indexOf("/*__STUDIO_WORKER_END:studioInvalidateHotReads__*/", begin);
  assert.ok(begin >= 0 && end > begin);
  const portion = cacheSource.slice(begin, end);
  assert.match(portion, /studioReadCacheDropPrefix\("library:"\)/);
  assert.match(portion, /AIRTABLE_MEDIA_TABLE_ID/);
  assert.match(portion, /STUDIO_IDEA_PROFILE_TABLE_ID/);
});

test("Library is read-only and retains scope and pagination contract", () => {
  assert.match(list, /has_more: Boolean\(page\.offset\)/);
  assert.match(list, /content_profile_id: scopedProfileId \|\| null/);
  assert.match(list, /records: mapped/);
  assert.doesNotMatch(list, /method:\s*"POST"/);
});
