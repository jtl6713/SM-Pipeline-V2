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
  assert.match(block, /new Map\(\[\.\.\.revisions, \.\.\.drafts\]/);
});

test("reopened promoted revision is selectable without creating a new draft", () => {
  const start = web.indexOf("function productionRequestIsOpenDraft(");
  const end = web.indexOf("async function loadProductionRequests(", start);
  const block = web.slice(start, end);
  assert.match(block, /status === "promoted"/);
  assert.match(block, /\[factory-revision-open\]/);
  assert.match(block, /if \(revisionOpen\) return true/);
  assert.match(web, /\? "Revise" : "Continue"/);
});
