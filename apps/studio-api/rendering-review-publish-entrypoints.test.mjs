import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker03=readFileSync(new URL("./worker-functions-03.mjs",import.meta.url),"utf8");
const worker04=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");

test("Worker dispatch selector checks review-owned hold before choosing any platform action",()=>{
  const text=worker03.slice(worker03.indexOf("export function studioPublishDispatchTarget"),
    worker03.indexOf("/*__STUDIO_WORKER_END:studioPublishDispatchTarget__*/"));
  assert.match(text,/renderingReviewHoldPresent\(field => f\(record, field\)\)/);
  assert.ok(text.indexOf("renderingReviewHoldPresent")<text.indexOf('f(record, "Platform")'));
});
test("Worker AP1-IG pulse refuses known held records before contacting runner",()=>{
  const text=worker03.slice(worker03.indexOf("export async function studioPulseAp1IgReel"),
    worker03.indexOf("/*__STUDIO_WORKER_END:studioPulseAp1IgReel__*/"));
  assert.match(text,/renderingReviewHoldPresent/);
  assert.ok(text.indexOf("renderingReviewHoldPresent")<text.indexOf("item4PulsePipelineStage"));
});
test("canonical Worker approval checks review hold before existing approved shortcuts",()=>{
  const text=worker04.slice(worker04.indexOf("export async function approveOutputRecordForPublishing"),
    worker04.indexOf("/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/"));
  assert.match(text,/renderingReviewHoldPresent\(field => f\(current, field\)\)/);
  assert.ok(text.indexOf("renderingReviewHoldPresent")<text.indexOf("__already_approved"));
});
test("Instagram existing-container recovery checks independent review hold",()=>{
  const text=worker04.slice(worker04.indexOf("export async function studioReconcilePublishingInstagramReels"),
    worker04.indexOf("/*__STUDIO_WORKER_END:studioReconcilePublishingInstagramReels__*/"));
  assert.match(text,/renderingReviewHoldPresent\(field => f\(row, field\)\)/);
});
