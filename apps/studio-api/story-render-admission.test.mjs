import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storySeedRenderStatus } from "./story-render-admission.mjs";

test("prepared, owned video Story joins the R4 queue at seed time", () => {
  assert.equal(storySeedRenderStatus({ nativeReady: false, outputType: "Story", remotionReady: true }), "Ready for Render");
  assert.equal(storySeedRenderStatus({ nativeReady: false, outputType: " story ", remotionReady: true }), "Ready for Render");
});
test("incomplete Story is NOT admitted with missing media or render plan", () => {
  assert.equal(storySeedRenderStatus({ nativeReady: false, outputType: "Story", remotionReady: false }), null);
  assert.equal(storySeedRenderStatus({ nativeReady: false, outputType: "Story" }), null);
});
test("native photo outputs retain their existing route without a Remotion render", () => {
  assert.equal(storySeedRenderStatus({ nativeReady: true, outputType: "Story", remotionReady: true }), "Native Photo Route");
  assert.equal(storySeedRenderStatus({ nativeReady: true, outputType: "Carousel", remotionReady: false }), "Native Photo Route");
});
test("non-Story routes retain their original R2/R3 admission and do not publish", () => {
  for (const outputType of ["Reel", "Video Draft", "Short", "Carousel", ""]) {
    assert.equal(storySeedRenderStatus({ nativeReady: false, outputType, remotionReady: true }), null);
  }
});
test("production seed wires the tested status function and preserves a separate human review", () => {
  const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(source, /Render_Status: storySeedRenderStatus\(\{ nativeReady, outputType: effective\.output_type, remotionReady \}\)/);
  assert.match(source, /Output_Status: nativeReady \? "Ready for Review" : "In Production"/);
});
