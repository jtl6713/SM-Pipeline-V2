import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
test("Meta republish cannot automatically retry an ambiguous POST", () => {
  const start = source.indexOf("async function submitMetaRepublish(recordId)");
  const end = source.indexOf("function isMetaPostUrlClient", start);
  const fn = source.slice(start, end);
  assert.ok(start > 0);
  assert.match(fn, /meta-republish/);
  assert.match(fn, /retries: 0/);
  assert.match(fn, /timeoutMs: 45000/);
});
test("Interrupted republish response requires reconciliation, not another tap", () => {
  assert.match(source, /Republish response was interrupted\. Publishing may have started/);
  assert.match(source, /if \(uncertain\) refreshPipelineOutputs/);
});
