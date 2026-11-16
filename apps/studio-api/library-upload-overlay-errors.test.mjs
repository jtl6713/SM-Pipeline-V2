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
    assert.match(ui, /held for possible third-party overlay/);
    assert.match(ui, /Override below if Studio got this wrong/);
    assert.match(ui, /failed while talking to Drive\/pipeline/);
    assert.match(ui, /override_overlay_hold/);
    assert.match(ui, /libraryOverlayOverrideBtn/);
  });

  test("library Drive promote uses async runner job + poll", () => {
    assert.match(funcs, /skipSourceMaster = true/);
    assert.match(funcs, /skip_source_master/);
    assert.match(funcs, /form\.set\("async", "1"\)/);
    assert.match(funcs, /pollLibraryPromoteJob/);
    assert.match(funcs, /LIBRARY_DRIVE_PROMOTE_POLL_MAX_MS = 240000/);
    assert.match(funcs, /Drive\/pipeline upload timed out while confirming Google Drive/);
    assert.match(funcs, /emptyGateway \? 504/);
  });

  test("Worker passes overlay override through library promote", () => {
    assert.match(funcs, /overrideOverlayHold/);
    assert.match(funcs, /override_overlay_hold/);
    assert.match(funcs, /OPERATOR_OVERRIDE/);
  });

  test("release versions bumped for this fix", () => {


    assert.match(worker, /0\.10\.976-fb-reel-stage-story-park/);
    const build = ui.match(/\bBUILD_ID\s*=\s*["']item4-(\d+)\.(\d+)\.(\d+)-/);
    assert.ok(build, "UI BUILD_ID must be a parseable semantic version");
    const [major, minor, patch] = build.slice(1).map(Number);
    assert.ok(major > 0 || minor > 6 || (minor === 6 && patch >= 957),
      "Keep the UI build at or above the overlay-override release");
  });
});
