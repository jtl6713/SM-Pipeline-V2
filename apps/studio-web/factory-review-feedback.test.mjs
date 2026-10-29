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
  assert.match(label || "", /^0[.]6[.][0-9]+$/);
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
  assert.match(factory, /action: "request_changes_content"/);
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

test("Producer content revisions return durable queue acceptance independent of Factory refresh", () => {
  assert.match(worker, /action === "request_changes_content"/);
  assert.match(worker, /Studio_Production_Job_JSON: revisionId \?/);
  assert.match(worker, /producer_queued: Boolean\(revisionId\)/);
  assert.match(worker, /factoryAdvanceProducerRevision/);
  assert.match(worker, /factoryResumeProducerRevisions/);
  assert.match(worker, /await factoryResumeProducerRevisions\(env, ctx\)/);
  assert.match(worker, /factoryVerifyProducerRevisions/);
  assert.match(worker, /await factoryVerifyProducerRevisions\(env\)/);
  assert.match(worker, /producer_quality:\s*\{\s*passed:\s*true/);
  assert.match(worker, /Do_Not_Publish: producerPending/);
  assert.match(factory, /desk\?\.result\?\.producer_queued/);
  assert.match(factory, /loadFactoryDesk\(true\)\.catch/);
});

test("Factory Producer is visible before expanding a collapsed lane", () => {
  assert.match(html, /id="factoryProducerOpen"[^>]*>Review &amp; Request Changes<\/button>/);
  assert.match(html, /id="factoryBandBodyNeedsEyes"/);
  assert.match(factory, /\$\("factoryProducerOpen"\)\?\.addEventListener\("click"/);
  assert.match(factory, /band\.classList\.remove\("is-collapsed"\)/);
  assert.match(factory, /Request Changes appears when a content item reaches Needs eyes/);
});

test("Factory is the only conversational-review entry and requires comments",()=>{
  assert.match(factory,/function isConversationalReviewCandidate/);
  assert.match(factory,/action:"start_render_review"/);
  assert.match(factory,/if \(!notes\)/);
  assert.match(factory,/Describe the changes needed before sending back/);
  assert.match(factory,/rendering-review\\/factory\\/outputs/);
  assert.match(factory,/review_notes_saved!==true/);
});
