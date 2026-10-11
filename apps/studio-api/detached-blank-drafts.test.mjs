import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Production Request list excludes detached blank Drafts", async () => {
  const source = await readFile(path.join(here, "worker.js"), "utf8");
  const start = source.indexOf("async function listProductionRequests");
  const end = source.indexOf("async function", start + 20);
  const fn = source.slice(start, end > start ? end : start + 12000);
  assert.match(fn, /const detachedBlankDraft/);
  assert.match(fn, /status === "Draft"/);
  assert.match(fn, /ideaLinks\.length === 0/);
  assert.match(fn, /promotedLinks\.length === 0/);
  assert.match(fn, /contentLinks\.length === 0/);
  assert.match(fn, /return !detachedBlankDraft/);
  assert.match(fn, /listOpenProductionRequests/);
  assert.match(fn, /loadIdeaListMetaByRecordId/);
  const fields = source.slice(source.indexOf("const PRODUCTION_REQUEST_LIST_FIELDS"), source.indexOf("const OPEN_PRODUCTION_REQUEST_FORMULA"));
  assert.doesNotMatch(fields, /Studio_Master_Assets_JSON/);
  assert.doesNotMatch(fields, /Studio_Output_Plan_JSON/);
  assert.doesNotMatch(fields, /Studio_Variant_Manifest_JSON/);
  assert.doesNotMatch(fields, /Studio_Production_Job_JSON/);
  assert.match(source, /sortField: "Updated_At"/);
});
