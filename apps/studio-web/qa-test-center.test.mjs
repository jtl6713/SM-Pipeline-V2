import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const script=fs.readFileSync(new URL("./assets/qa-test-center.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("./assets/qa-test-center.css",import.meta.url),"utf8");

test("QA Test Center appears as a separate admin page, hidden until authenticated",()=>{
  assert.match(html,/data-page="qa-test-center" id="navQaTestCenter" hidden/);
  assert.match(html,/id="page-qa-test-center"/);
  assert.match(script,/call\("catalog"\)\.then\(data=>/);
  assert.match(script,/nav\.hidden=false/);
  assert.match(script,/catch\(\(\)=>\{nav\.hidden=true;\}\)/);
});

test("all interactive QA controls have unique HTML IDs and actual handlers",()=>{
  const ids=["qaEnvironment","qaRunSelect","qaStartRun","qaRefresh","qaStatus",
    "qaCases","qaGate","qaHistory","qaBaselineSelect","qaCompare","qaRegressions","qaSearch","qaOlderRuns",
    "qaFinalPanel","qaFinalDecision","qaFinalNotes","qaFinalizeRun","qaFinalHelp"];
  for(const id of ids){
    assert.equal(html.split('id="'+id+'"').length-1,1,"duplicate or missing id: "+id);
    assert.ok(script.includes('$("'+id+'")')||script.includes('const '+id+'=$("'+id+'")')||
      script.includes(id+'=$("'+id+'")'),"missing JS binding for "+id);
  }
  assert.match(script,/qaSearch/);
  assert.match(script,/renderCases/);
});

test("QA JavaScript cannot call unrelated publishing, scheduling, or arbitrary execution APIs",()=>{
  assert.match(script,/\/api\/admin\/qa\//);
  assert.doesNotMatch(script,/\/api\/(?:outputs|publish|factory|operations)\//);
  assert.doesNotMatch(script,/\beval\s*\(|new Function\s*\(/);
  assert.doesNotMatch(script,/\.innerHTML\s*=/);
  assert.match(script,/textContent/);
  assert.match(css,/#page-qa-test-center/);
});

test("Studio release contract points all QA assets to bumped cache key",()=>{
  assert.match(html,/UI build 0\.6\.897/);
  assert.match(html,/qa-test-center\.css\?v=0\.6\.897-qa-center-pilot/);
  assert.match(html,/qa-test-center\.js\?v=0\.6\.897-qa-center-pilot/);
});


test("QA run closure explicitly commits an immutable release decision, never silently publishes",()=>{
  assert.match(html,/id="qaFinalDecision"/);
  assert.match(html,/<option value="Incomplete">/);
  assert.match(html,/<option value="Rejected">/);
  assert.match(html,/<option value="Approved">/);
  assert.match(html,/id="qaFinalizeRun" disabled/);
  assert.match(script,/function renderFinalizationState\(/);
  assert.match(script,/async function finalizeRun\(/);
  assert.match(script,/window\.confirm\(/);
  assert.match(script,/state\.run\.status==="Finalized"/);
  assert.match(script,/\/finalize"/);
  assert.doesNotMatch(script,/fetch\(["']\/api\/(?:outputs|factory|publish)\//);
});
