import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const start = source.indexOf("async function openCreativeEditor(recordId)");
const end = source.indexOf("function collectCreativePayload()", start);
const handler = source.slice(start, end);

test("Creative Editor requests a bounded single read rather than displaying infinite loading", () => {
  assert.ok(start > 0 && end > start, "creative open handler must exist");
  assert.match(handler, /timeoutMs: 25000, retries: 1/);
  assert.match(handler, /Creative review unavailable/);
  assert.match(handler, /Creative review load failed:/);
  assert.match(handler, /retryCreativeEditorLoad/);
  assert.match(handler, /openCreativeEditor\(recordId\)/);
});

test("Creative Editor clears stale post details and disables unsafe actions when loading fails", () => {
  assert.match(handler, /activeCreativeOutput = null;/);
  assert.match(handler, /creativeSlides = \[\];/);
  assert.match(handler, /creativeOutputMeta"\)\.replaceChildren\(\)/);
  assert.match(handler, /"creativeApprovePreview", "creativePublishNow", "creativeSaveSchedule"/);
  assert.match(handler, /button\.disabled = true/);
});
