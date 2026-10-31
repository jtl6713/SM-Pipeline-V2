import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = path => readFileSync(new URL(path,import.meta.url),"utf8");
const html=read("./index.html");
const js=read("./assets/factory-desk.js");
const css=read("./assets/factory-layout-0680.css");
test("Factory Request Changes offers a default-selected multi-output picker",()=>{
  for(const id of ["factoryFeedbackApplySection","factoryFeedbackApplyAll",
    "factoryFeedbackMatchPicker","factoryFeedbackMatchRows","factoryFeedbackMatchStatus"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Apply to all matching outputs/);
  assert.match(js,/function loadFactoryCorrectionMatches/);
  assert.match(js,/correction-matches\?production_request_id/);
  assert.match(js,/data-factory-correction-output/);
  assert.match(js,/checked><span>/);
  assert.match(css,/\.factory-correction-matches/);
});
test("grouped feedback is explicit and uses an isolated server action",()=>{
  assert.match(js,/action: "request_changes_matching"/);
  assert.match(js,/selected_output_ids: selectedIds/);
  assert.match(js,/client_request_id: pending\.payload\.client_request_id/);
  assert.match(js,/factoryCorrectionSelectedOutputs/);
  assert.match(js,/pending\.payload\.client_request_id = requestPayload\.client_request_id/);
});
test("Production override and single-output Factory behavior are not removed",()=>{
  assert.match(js,/action:"start_render_review"/);
  assert.match(js,/action: "request_changes_content"/);
  assert.match(js,/action: "send_back"/);
  assert.match(html,/id="factoryFeedbackNotes"/);
  assert.match(html,/id="prOverrideApplyScope"/);
});
