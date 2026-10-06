import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("./assets/app-item4-0625.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./assets/styles-phase7-0621.css", import.meta.url), "utf8");

test("Rendering timed-script scenes can open a swap-still library dialog", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.514-pipeline-mobile-scroll"/);
  assert.match(app, /function openTimedScriptSwapStill\(/);
  assert.match(app, /function applyTimedScriptSwapStill\(/);
  assert.match(app, /function loadSwapStillLibrary\(/);
  assert.match(app, /function closeTimedScriptSwapStill\(/);
  assert.match(app, /data-timed-swap-scene/);
  assert.match(app, /data-timed-action="swap"/);
  assert.match(app, /data-swap-still-id/);
  assert.match(app, /Click a scene still to swap it from the library/);
  assert.match(app, /assets\/library/);
  assert.match(app, /allow_video: false/);
  assert.match(app, /Tap Render this script to rewrite narration/);
  assert.match(html, /id="prSwapStillBackdrop"/);
  assert.match(html, /id="prSwapStillSearch"/);
  assert.match(html, /id="prSwapStillGrid"/);
  assert.match(html, /id="prSwapStillApply"/);
  assert.match(html, /Swap still/);
  assert.match(html, /UI build 0\.6\.514/);
  assert.match(html, /app-item4-0625\.js\?v=0\.6\.514-pipeline-mobile-scroll/);
  assert.match(css, /\.swap-still-dialog/);
  assert.match(css, /\.timed-script-scene-thumb:hover/);
});
