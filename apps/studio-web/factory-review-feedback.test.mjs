import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("./index.html");
const app = read("./assets/app-item4-1008.js");
const factory = read("./assets/factory-desk.js");
const css = read("./assets/factory-layout-0680.css");
const worker = readStudioWorkerSource();

test("Published Studio label, app BUILD_ID, and all cache versions agree", () => {
  const label = html.match(/UI build (\d+\.\d+\.\d+)/)?.[1];
  const build = app.match(/const BUILD_ID = "item4-(\d+\.\d+\.\d+)-/ )?.[1];
  assert.equal(label, "0.6.694");
  assert.equal(build, label);
  const cache = [...html.matchAll(/\?v=(\d+\.\d+\.\d+)-/g)].map((m) => m[1]);
  assert.ok(cache.length > 10);
  assert.ok(cache.every((version) => version === label));
});

test("Factory Send back opens mobile review-notes dialog without changing status first", () => {
  for (const id of [
    "factoryFeedbackBackdrop", "factoryFeedbackForm", "factoryFeedbackNotes",
    "factoryFeedbackSubmit", "factoryFeedbackCancel", "factoryFeedbackError",
  ]) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /factoryFeedbackNotes"[^>]*maxlength="3000"/);
  assert.match(factory, /function openFactoryFeedback/);
  assert.match(factory, /function submitFactoryFeedback/);
  assert.match(factory, /\.\.\.pending\.payload, note: notes/);
  assert.match(factory, /action: "send_back_content"/);
  assert.match(factory, /action: "send_back"/);
  assert.match(css, /\.factory-feedback-backdrop/);
  assert.match(css, /@media\(max-width:520px\)/);
});

test("Reviewer feedback is persisted into Production and output history with no auto approval", () => {
  assert.match(worker, /function factoryFeedbackBlock/);
  assert.match(worker, /function factoryAppendFeedback/);
  assert.match(worker, /function factoryLatestReviewFeedback/);
  assert.match(worker, /Production_Notes: withFactoryRevisionOpen\(productionNotes/);
  assert.match(worker, /factory_review_feedback: factoryLatestReviewFeedback/);
  assert.match(worker, /Review_Notes: \[existingNotes, line\]/);
  assert.match(worker, /Do_Not_Publish: true/);
  assert.match(app, /const factoryFeedback = record\?\.factory_review_feedback/);
  assert.ok(html.includes('id="productionFactoryFeedbackBody"'));
  assert.ok(html.includes('id="productionFactoryFeedbackMeta"'));
  assert.match(app, /feedbackBody\.textContent = String\(factoryFeedback\.instructions\)/);
});

test("Returned Production item visibly advertises review notes and opens them from its header", () => {
  assert.match(html, /id="productionSeeReviewNotes"[^>]*aria-controls="productionFactoryFeedback"[^>]*hidden/);
  assert.match(html, /See review notes/);
  assert.match(html, /id="productionFactoryFeedback"[^>]*tabindex="-1"/);
  assert.match(app, /feedbackButton\.hidden = !feedbackVisible/);
  assert.match(app, /feedbackButton\.setAttribute\("aria-label"/);
  assert.match(app, /\$\("productionSeeReviewNotes"\)\?\.addEventListener\("click"/);
  assert.match(app, /panel\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(app, /panel\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /\.production-see-review-notes\[hidden\]/);
  assert.match(css, /border:2px solid #ba3038/);
  assert.match(css, /@media\(max-width:760px\)/);
});
