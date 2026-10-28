import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const html = await readFile(new URL("./index.html",import.meta.url),"utf8");
const ui = await readFile(new URL("./assets/rendering-review-preview.js",import.meta.url),"utf8");
const css = await readFile(new URL("./assets/rendering-review-preview.css",import.meta.url),"utf8");

test("read-only Chicago review has distinct permission-gated navigation and mobile layout",()=>{
  assert.match(html,/<button[^>]+id="navRenderingReview" hidden>Rendering Review<\/button>/);
  assert.match(html,/<section id="page-rendering-review" class="page"/);
  for (const id of ["rrRefresh","rrStatus","rrQueueList","rrDetails","rrNext","rrPage"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/rendering-review-preview\.js/);
  assert.match(html,/rendering-review-preview\.css/);
  assert.match(css,/@media\(max-width:850px\)/);
  assert.match(ui,/permissions\.includes\("outputs_review"\)/);
  assert.match(ui,/session\.authenticated === true && session\.authorized === true/);
});

test("preview only calls authenticated GETs, never initiates a review or public post",()=>{
  assert.match(ui,/method:"GET"/);
  assert.match(ui,/\/api\/rendering-review\/queue\?profile_id=/);
  assert.match(ui,/\/api\/rendering-review\/outputs\//);
  assert.doesNotMatch(ui,/\b(?:POST|PATCH|DELETE)\b/);
  assert.doesNotMatch(ui,/fetch\([^)]*publish/i);
  assert.match(ui,/data\.flags\?\.admission_enabled !== false/);
  assert.match(ui,/item\.profile_id !== chicago/);
  assert.match(ui,/manual_admission_enabled !== false/);
  assert.match(ui,/url\.protocol === "https:"/);
  assert.match(ui,/textContent = String\(value\)/);
});
