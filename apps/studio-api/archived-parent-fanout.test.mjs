import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const start = source.indexOf("export async function fanoutProductionRequestOutputsToContentItems(");
const end = source.indexOf("/*__STUDIO_WORKER_END:fanoutProductionRequestOutputsToContentItems__*/", start);
const body = source.slice(start, end);
test("cancelled production requests cannot fan out", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(body, /Request_Status/);
  assert.match(body, /discarded_request\s*:\s*true/);
});
test("archived Content Item cannot regenerate platform outputs", () => {
  assert.match(body, /f\(parent, "Content_Status"\).*"Archived"/);
  assert.match(body, /discarded_archived_parent\s*:\s*true/);
  assert.ok(body.indexOf("discarded_archived_parent:true") < body.indexOf('method:"POST"'));
});
