import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const funcs = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
const ui = readFileSync(new URL("../studio-web/assets/app-item4-1008.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

describe("library upload overlay errors", () => {
  test("Worker maps third-party overlay holds to 422 instead of Drive 502", () => {
    assert.match(funcs, /QA-ASSET-THIRD-PARTY-OVERLAY\|third-party overlay review/i);
    assert.match(funcs, /const status = overlayHeld\s*\n\s*\? 422/);
    assert.match(funcs, /Use a clean source/);
  });

  test("UI summarizes overlay blocks separately from Drive/pipeline failures", () => {
    assert.match(ui, /function summarizeLibraryUploadErrors/);
    assert.match(ui, /blocked: photographer\/credit watermark/);
    assert.match(ui, /failed while talking to Drive\/pipeline/);
  });

  test("release versions bumped for this fix", () => {
    assert.match(worker, /0\.10\.966-overview-awaiting-package-fields/);
    const build = ui.match(/\bBUILD_ID\s*=\s*["']item4-(\d+)\.(\d+)\.(\d+)-/);
    assert.ok(build, "UI BUILD_ID must be a parseable semantic version");
    const [major, minor, patch] = build.slice(1).map(Number);
    assert.ok(major > 0 || minor > 6 || (minor === 6 && patch >= 953),
      "Keep the UI build at or above the library-overlay fix release");
  });
});
