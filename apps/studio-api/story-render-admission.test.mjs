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

test("global R4 selector admits prepared Stories instead of filtering them out", () => {
  const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const selector = source.split("\n").find(line => line.startsWith("const STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA")) || "";
  assert.ok(selector.includes("Ready for Render"));
  assert.ok(selector.includes("Render_Total_Frames"));
  assert.ok(!selector.includes('Format}!="Story"'));
  assert.ok(!selector.includes('Studio_Output_Type}!="Story"'));
});

test("stale Story render packages can trigger the R4 watchdog", () => {
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const formula = worker.split("\n").find(line => line.startsWith("const STUDIO_R4_WORK_FORMULA")) || "";
  assert.ok(formula.includes("Ready for Render"));
  assert.ok(formula.includes("Test_Run_ID"));
  assert.ok(formula.includes("Render_Total_Frames"));
  assert.ok(!formula.includes('Format}!="Story"'));
  assert.ok(!formula.includes('Studio_Output_Type}!="Story"'));
  const watchdog = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.ok(watchdog.includes("formula: `AND(${STUDIO_R4_WORK_FORMULA},${stale})`"));
});

test("render queue and watchdog ignore outputs that already have final media", () => {
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  for (const name of ["STUDIO_R4_WORK_FORMULA", "STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA"]) {
    const formula = worker.split("\n").find(line => line.startsWith("const " + name + " = ")) || "";
    assert.ok(formula.includes('{Final_File_URL}=""'), name + " must not rerender finished media");
    assert.ok(formula.includes("Render_Total_Frames"), name + " must require a valid render manifest");
    assert.ok(!formula.includes('Format}!="Story"'), name + " must keep eligible Stories selectable");
  }
});

test("R4 reconciles old Airtable Rendering holds through R5, without bypassing a live slot", () => {
  const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const admit = source.split("export async function studioAdmitRenderQueue")[1]
    ?.split("/*__STUDIO_WORKER_END:studioAdmitRenderQueue__*/")[0] || "";
  assert.match(admit, /busy\.busy && busy\.source === "airtable"/);
  assert.match(admit, /await item4PulseR5Python\(env, \{ maxRuns: 5 \}\)/);
  assert.match(admit, /stale_hold_recovery: staleHoldRecovery/);
  assert.match(admit, /busy = \{ \.\.\.busy, busy: true \}/);
  assert.ok(admit.indexOf("await item4PulseR5Python") < admit.indexOf("if (busy.busy) {"));
});

test("R4 rereads canonical output before a Ready patch and never relaunches finished Story media", () => {
  const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const admit = source.split("export async function studioAdmitRenderQueue")[1]
    ?.split("/*__STUDIO_WORKER_END:studioAdmitRenderQueue__*/")[0] || "";
  assert.match(admit, /latest = await airtableFetch\(env, env\.AIRTABLE_OUTPUT_TABLE_ID, head\.id\)/);
  assert.match(admit, /f\(latest, "Remotion_Job_ID"\)/);
  assert.match(admit, /f\(latest, "Final_File_URL"\)/);
  assert.match(admit, /"Ready for Review"/);
  assert.match(admit, /no_longer_eligible/);
  assert.ok(admit.indexOf("latest = await airtableFetch") < admit.indexOf("fields: { Render_Status: RENDER_STATUS_READY }"));
});


test("R4 cron log exposes only bounded admission refusal, not render payload", () => {
  const source = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const body = source.split("export async function healStuckStudioRenders")[1]
    ?.split("/*__STUDIO_WORKER_END:healStuckStudioRenders__*/")[0] || "";
  assert.match(body,/row.key === "R4_QUEUE_ADMIT"/);
  assert.match(body,/runner_status: row.started\?\.status/);
  assert.match(body,/runner_reason: row.started\?\.details\?\.run\?\.reason/);
  assert.match(body,/runner_message: String\(row.started\?\.message \|\| ""\)\.slice\(0, 220\)/);
  assert.doesNotMatch(body,/JSON\.stringify\(row\.started\)/);
});
