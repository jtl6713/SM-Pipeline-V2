import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  studioIdeaTitleKey, studioIdeaTitleYearFormula,
  studioIdeaTitlesEquivalent, studioFindRecentDuplicateTitle, studioRequiresUniqueIdeaTitleForCreate,
} from "./idea-title-uniqueness.mjs";
const dir=dirname(fileURLToPath(import.meta.url));
const f01=fs.readFileSync(join(dir,"worker-functions-01.mjs"),"utf8");
const f04=fs.readFileSync(join(dir,"worker-functions-04.mjs"),"utf8");
const worker=fs.readFileSync(join(dir,"worker.js"),"utf8");
test("numbered copies are not unique ideas; genuine years and road numbers remain meaningful",()=>{
  for(const other of ["Miami or Miami Beach 2","MIAMI — Or Miami Beach (3)","Miami or Miami Beach #4","Miami or Miami Beach - 5","Miami or Miami Beach Part 2"]) {
    assert.equal(studioIdeaTitleKey(other),studioIdeaTitleKey("Miami Or Miami Beach?"),other);
    assert.ok(studioIdeaTitlesEquivalent("Miami Or Miami Beach?",other),other);
  }
  assert.notEqual(studioIdeaTitleKey("Route 66"),studioIdeaTitleKey("Route"));
  assert.notEqual(studioIdeaTitleKey("Chicago 2026"),studioIdeaTitleKey("Chicago"));
  assert.equal(studioIdeaTitlesEquivalent("The Chicago Riverwalk at Night","Chicago Riverwalk Night"),true);
  assert.equal(studioIdeaTitlesEquivalent("Chicago Riverwalk at Night","Chicago Navy Pier Sunset"),false);
});
test("year guard uses paginated prefix matches and fail-closed results",async()=>{
  const formula=studioIdeaTitleYearFormula("Miami Or Miami Beach? 2","Candidate_Title");
  assert.match(formula,/DATEADD\(TODAY\(\),-365/);
  assert.match(formula,/CREATED_TIME\(\)/);
  assert.match(formula,/REGEX_MATCH/);
  assert.match(formula,/miamiorm/);
  assert.match(formula,/Test_Run_ID/);
  assert.doesNotMatch(studioIdeaTitleYearFormula("Miami Or Miami Beach","Content_Title"),/Test_Run_ID/);
  const row={id:"recAAAAAAAAAAAAAA",fields:{Candidate_Title:"Miami Or Miami Beach? (3)"}};
  assert.deepEqual(await studioFindRecentDuplicateTitle("Miami or Miami Beach 2",async kind=>kind==="idea"?[row]:[]),
    {source:"idea",record_id:row.id});
  const content={id:"recBBBBBBBBBBBBBB",fields:{Content_Title:"Miami Or Miami Beach?"}};
  assert.deepEqual(await studioFindRecentDuplicateTitle("Miami Or Miami Beach #4",async kind=>kind==="content"?[content]:[]),
    {source:"content",record_id:content.id});
  assert.equal(await studioFindRecentDuplicateTitle("Miami Or Miami Beach",async()=>[row],{excludeIdeaId:row.id,excludeContentId:row.id}),null);
  await assert.rejects(()=>studioFindRecentDuplicateTitle("Miami or Miami Beach",async()=>null),/Incomplete/);
  await assert.rejects(()=>studioFindRecentDuplicateTitle("Miami or Miami Beach",async()=>Array(1001).fill(row)),/safety cap/);
  await assert.rejects(()=>studioFindRecentDuplicateTitle("Miami or Miami Beach",async()=>{throw Error("Airtable 503")}),/Airtable 503/);
});
test("manual, autonomous, and worker modules include guard before insertion",()=>{
  assert.match(f01,/export async function createIdea[\s\S]*?studioFindRecentDuplicateTitle[\s\S]*?method: "POST"/);
  assert.match(f01,/export async function updateIdea[\s\S]*?studioFindRecentDuplicateTitle[\s\S]*?method: "PATCH"/);
  assert.match(f04,/export async function createAutonomousIdea[\s\S]*?studioFindRecentDuplicateTitle[\s\S]*?method: "POST"/);
  assert.match(f04,/autonomous hour skipped repeat subject/);
  assert.match(worker,/idea-title-uniqueness\.mjs/);
});

test("Vibe Cut media intake can reuse an existing title without weakening editorial idea uniqueness", () => {
  assert.equal(studioRequiresUniqueIdeaTitleForCreate("vibe-cut"), false);
  for (const kind of ["single-photo", "multiple-photos", "finished-video", "", "Vibe Cut", null]) {
    assert.equal(studioRequiresUniqueIdeaTitleForCreate(kind), true, String(kind));
  }
  const createIdea = f01.split("export async function createIdea(")[1]
    .split("/*__STUDIO_WORKER_END:createIdea__*/")[0];
  assert.match(createIdea, /if \(studioRequiresUniqueIdeaTitleForCreate\(payload\?\.input_kind\)\) \{/);
  assert.match(createIdea, /if \(studioRequiresUniqueIdeaTitleForCreate[\s\S]*?studioFindRecentDuplicateTitle[\s\S]*?if \(duplicateTitle\)[\s\S]*?\}/);
  assert.match(createIdea, /const created = await airtableFetch\(env, env\.AIRTABLE_IDEA_TABLE_ID, "", \{/);
});
