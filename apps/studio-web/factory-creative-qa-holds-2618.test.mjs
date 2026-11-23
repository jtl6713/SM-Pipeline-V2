import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const js = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");

test("#2618: Factory Repair prominently displays exact media correction reason and safety hold", () => {
  const source = js.slice(js.indexOf("function renderCard("),js.indexOf("function contentGroupKey("));
  assert.match(source,/card\.creative_qa_hold === true[\s\S]*?Creative correction required · Publishing held/);
  assert.match(source,/factory-creative-qa/);
  assert.match(source,/esc\(card\.creative_qa_reason/);
  assert.match(source,/Prior approval or provisional schedule does not authorize publication/);
  assert.match(source,/No automatic approval, retry, deletion or hold release/);
  assert.match(source,/data-factory-open/);
  assert.match(source,/data-factory-preview/);
});

test("#2618: Delete disabled for all held creative QA outputs including previously approved", () => {
  const source = js.slice(js.indexOf("function canDelete("),js.indexOf("function canPreview("));
  const canDelete = vm.runInNewContext(source + "\ncanDelete");
  assert.equal(canDelete({kind:"output",creative_qa_hold:true,do_not_publish:true,output_status:"Approved for Publishing"}),false);
  assert.equal(canDelete({kind:"output",creative_qa_hold:true,do_not_publish:true,output_status:"Ready for Review"}),false);
  assert.equal(canDelete({kind:"output",creative_qa_hold:false}),true);
});

test("#2618: creative holds cannot enter browser approval, held creative acceptance or hold-release path", () => {
  const normal = js.slice(js.indexOf("function canReviewActions("),js.indexOf("function canDelete("));
  assert.match(normal,/card\.creative_qa_hold === true\) return false/);
  const batch = js.slice(js.indexOf("function factoryBatchSelectionReason("),js.indexOf("function canReviewHeldOutput("));
  assert.match(batch,/Creative QA hold:/);
  const held = js.slice(js.indexOf("function canReviewHeldOutput("),js.indexOf("function renderCard("));
  assert.equal((held.match(/card\.creative_qa_hold !== true/g)||[]).length,3);
  const render = js.slice(js.indexOf("function renderCard("),js.indexOf("function contentGroupKey("));
  assert.match(render,/if \(canDelete\(card, \{ candidate \}\)\)/);
});
