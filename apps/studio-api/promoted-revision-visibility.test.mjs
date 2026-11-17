import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const web = readFileSync(new URL("../studio-web/assets/app-item4-1008.js", import.meta.url), "utf8");

test("promoted requests only reappear in Production when explicitly opened for revision", () => {
  const start = api.indexOf("async function listOpenProductionRequests(");
  const end = api.indexOf("/*__STUDIO_WORKER_END:listOpenProductionRequests__*/", start);
  const block = api.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /listSupabaseRevisionOpenProductionRequests/);
  assert.match(block, /revisions = await listSupabaseRevisionOpenProductionRequests/);
  assert.match(block, /new Map\(revisions\.map\(row => \[row\.id, row\]\)\)/);
  assert.match(block, /for \(const draft of drafts\)/);
  assert.match(block, /if \(!prioritized\.has\(draft\.id\)\) prioritized\.set\(draft\.id, draft\)/);
  assert.match(block, /return \[\.\.\.prioritized\.values\(\)\]\.slice\(0, limit\)/);
});

test("reopened promoted revision is selectable without creating a new draft", () => {
  const start = web.indexOf("function productionRequestIsOpenDraft(");
  const end = web.indexOf("async function loadProductionRequests(", start);
  const block = web.slice(start, end);
  assert.match(block, /status === "promoted"/);
  assert.match(block, /record\.revision_open === true/);
  assert.match(block, /if \(record\.active === false\) return false/);
  assert.match(web, /\? "Revise" : "Continue"/);
});

test("reopened revisions survive ordinary draft errors and missing Idea metadata", () => {
  const start = api.indexOf("async function listOpenProductionRequests(");
  const end = api.indexOf("/*__STUDIO_WORKER_END:listOpenProductionRequests__*/", start);
  const block = api.slice(start, end);
  assert.ok(block.indexOf("listSupabaseRevisionOpenProductionRequests") < block.indexOf("await listRecords("),
    "read authoritative reopened revisions before ordinary drafts");
  assert.match(block, /if \(!revisions\.length\) throw error/);
  assert.match(block, /new Map\(revisions\.map\(row => \[row\.id, row\]\)\)/);
  assert.match(block, /for \(const draft of drafts\)/);
  assert.match(block, /if \(!prioritized\.has\(draft\.id\)\) prioritized\.set\(draft\.id, draft\)/);
  assert.match(block, /return \[\.\.\.prioritized\.values\(\)\]\.slice\(0, limit\)/);

  const listStart = api.indexOf("export async function listProductionRequests(");
  const listEnd = api.indexOf("/*__STUDIO_WORKER_END:listProductionRequests__*/", listStart);
  const listBlock = api.slice(listStart, listEnd);
  assert.match(listBlock, /if \(productionRequestRevisionOpen\(record\)\) return true/);
  assert.match(listBlock, /showing saved requests/);
});

test("Production list paints reopened revisions without waiting for Ideas cache", () => {
  const start = web.indexOf("async function loadProductionRequests(");
  const end = web.indexOf("function ideaStructureLabel(", start);
  const listBlock = web.slice(start, end);
  assert.match(listBlock, /void ensureIdeasCache\(\)\.catch/);
  assert.doesNotMatch(listBlock, /await ensureIdeasCache\(\)/);
  assert.match(listBlock, /data-pr-id=/);
  assert.match(listBlock, /\? "Revise" : "Continue"/);
});
