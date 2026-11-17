import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const start = worker.indexOf("async function attachItem4LibraryAssets(");
const end = worker.indexOf("/*__STUDIO_WORKER_END:attachItem4LibraryAssets__*/", start);
const handler = worker.slice(start, end);

test("library still selection validates before mutating production notes", () => {
  assert.ok(start >= 0 && end > start);
  const parse = handler.indexOf("await request.json()");
  const validate = handler.indexOf("if (!ids.length)");
  const firstMutation = handler.indexOf("await item4UpdateRequestState(");
  assert.ok(parse >= 0 && validate > parse);
  assert.ok(firstMutation > validate, "must not mutate before validating selection");
  assert.doesNotMatch(handler, /Production_Notes:\s*withProductionPhotoWaitManual/);
});

test("library still attachment persists selected media only after preflight", () => {
  assert.ok(handler.indexOf("ideaLibraryRejectReason(") < handler.indexOf("const updated = await item4UpdateRequestState("));
  assert.match(handler, /Studio_Master_Assets_JSON:\s*JSON\.stringify\(assets\)/);
});
