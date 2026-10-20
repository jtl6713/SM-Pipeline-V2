import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  studioIdeaTitleKey,
  studioIdeaTitleYearFormula,
  studioFindRecentDuplicateTitle,
} from "./idea-title-uniqueness.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const f01 = readFileSync(join(root, "worker-functions-01.mjs"), "utf8");
const f04 = readFileSync(join(root, "worker-functions-04.mjs"), "utf8");
const worker = readFileSync(join(root, "worker.js"), "utf8");

test("365-day title key ignores case, punctuation, and spacing", () => {
  assert.equal(studioIdeaTitleKey("Miami Or Miami Beach?"), "miamiormiamibeach");
  assert.equal(studioIdeaTitleKey(" MIAMI — or Miami BEACH!!! "), "miamiormiamibeach");
  assert.equal(studioIdeaTitleKey("Miami or Miami Beach?"), studioIdeaTitleKey("miami-or-miami beach"));
});

test("Airtable filter uses normalized exact equality and full trailing year", () => {
  const idea = studioIdeaTitleYearFormula("Miami Or Miami Beach?", "Candidate_Title", "Create_Date");
  const content = studioIdeaTitleYearFormula("Miami Or Miami Beach?", "Content_Title", "Created_At");
  for (const formula of [idea, content]) {
    assert.match(formula, /DATEADD\(TODAY\(\),-365,'days'\)/);
    assert.match(formula, /miamiormiamibeach/);
    assert.match(formula, /Test_Run_ID/);
    assert.match(formula, /REGEX_REPLACE/);
  }
});

test("duplicate in ideas OR already promoted content blocks title", async () => {
  const duplicate = { id: "recAAAAAAAAAAAAAA" };
  const fromIdea = await studioFindRecentDuplicateTitle("Miami Or Miami Beach?", async (kind) =>
    kind === "idea" ? [duplicate] : []);
  assert.deepEqual(fromIdea, { source: "idea", record_id: duplicate.id });

  const fromContent = await studioFindRecentDuplicateTitle("Miami Or Miami Beach?", async (kind) =>
    kind === "content" ? [duplicate] : []);
  assert.deepEqual(fromContent, { source: "content", record_id: duplicate.id });

  const selfExcluded = await studioFindRecentDuplicateTitle("Miami Or Miami Beach?", async (kind) =>
    kind === "idea" ? [duplicate] : [], { excludeIdeaId: duplicate.id });
  assert.equal(selfExcluded, null);
});

test("history lookup failures never permit a new duplicate", async () => {
  await assert.rejects(
    () => studioFindRecentDuplicateTitle("Miami Or Miami Beach?", async () => { throw new Error("Airtable 503"); }),
    /Airtable 503/
  );
  await assert.rejects(
    () => studioFindRecentDuplicateTitle("Miami Or Miami Beach?", async () => null),
    /Incomplete title history/
  );
});

test("all Studio create/edit paths reference the year title guard", () => {
  assert.match(f01, /export async function createIdea[\s\S]*?studioFindRecentDuplicateTitle/);
  assert.match(f01, /export async function updateIdea[\s\S]*?studioFindRecentDuplicateTitle/);
  assert.match(f04, /export async function createAutonomousIdea[\s\S]*?studioFindRecentDuplicateTitle/);
  assert.match(worker, /from "\.\/idea-title-uniqueness\.mjs"/);
});
