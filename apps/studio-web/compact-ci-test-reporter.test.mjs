import assert from "node:assert/strict";
import test from "node:test";
import compactReporter from "./compact-ci-test-reporter.mjs";

async function collect(...events) {
  async function* source() { yield* events; }
  let output = "";
  for await (const chunk of compactReporter(source())) output += chunk;
  return output;
}

test("a large source assertion cannot flood Pages deployment logs", async () => {
  const multiMegabyteSource = "<script>" + "function enormousBundle() {}\n".repeat(90_000);
  const output = await collect({
    type: "test:fail",
    data: {
      name: "Source assertion failed",
      file: "apps/studio-web/ui-release-contract.test.mjs",
      line: 23,
      details: { error: { message: `Expected bundle to match release contract. Input: ${multiMegabyteSource}` } },
    },
  });
  assert.match(output, /^FAIL Source assertion failed/m);
  assert.match(output, /ui-release-contract\.test\.mjs:23/);
  assert.match(output, /Studio UI regression: 0 passed, 1 failed, 0 skipped/);
  assert.ok(output.length < 700, `Reporter emitted ${output.length} characters`);
  assert.equal((output.match(/enormousBundle/g) || []).length, 1, "no repeated source dump");
});

test("compact reporter still retains actionable summaries and counts", async () => {
  const output = await collect(
    { type: "test:pass", data: { name: "working feature" } },
    { type: "test:skip", data: { name: "not applicable" } },
    { type: "test:fail", data: { name: "broken release", details: { error: { message: "BUILD_ID does not match" } } } },
  );
  assert.match(output, /FAIL broken release/);
  assert.match(output, /BUILD_ID does not match/);
  assert.match(output, /Studio UI regression: 1 passed, 1 failed, 1 skipped/);
});
