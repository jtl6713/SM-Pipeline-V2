import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");

test("Worker latest mode fetches one live Airtable page before history snapshot",()=>{
  const start=worker.indexOf("async function listOutputs("),end=worker.indexOf("\nasync function listMusic(",start);
  assert.ok(start>=0&&end>start);
  const route=worker.slice(start,end);
  assert.match(route,/url\.searchParams\.get\("mode"\) === "latest"/);
  assert.match(route,/limit: 60/);
  assert.match(route,/filterFormula: contentProfileFilterFormula\(profile\)/);
  assert.match(route,/fresh: true/);
  // Latest returns a live page immediately; full list uses respondStudioMappedList (R2 snapshot).
  assert.ok(route.indexOf('mode") === "latest"') < route.indexOf("respondStudioMappedList"));
  assert.match(route, /fresh: true/);
});
test("Newest live rows override stale snapshot rows without losing older items",()=>{
  const match=app.match(/  function mergePipelineFreshOutputs\(baseRows, freshRows\) \{[\s\S]*?\n  \}/);
  assert.ok(match);
  const fn=vm.runInNewContext("("+match[0].trim()+")");
  const old=[{id:"a",output_id:2622,studio_state:"Approved"},{id:"b",output_id:2635,studio_state:"Rendering"}];
  const fresh=[{id:"b",output_id:2635,studio_state:"Ready for Review"},{id:"c",output_id:2640,studio_state:"Ready for Review"}];
  const actual=fn(old,fresh);
  assert.deepEqual(Array.from(actual,r=>r.id),["c","b","a"]);
  assert.equal(actual[1].studio_state,"Ready for Review");
  assert.equal(fn(old,[fresh[0]]).length,2);
});
test("UI renders newest arrivals first and marks stale history",()=>{
  const start=app.indexOf("async function refreshPipelineOutputs");
  const section=app.slice(start,app.indexOf("\n  async function loadOutputs",start));
  assert.match(section,/\/api\/outputs\?mode=latest/);
  assert.match(section,/const latestSettled = await latestPromise/);
  assert.match(section,/renderOutputsTable\(target, liveRows\)/);
  assert.match(section,/pipelineListUnverified = historyStale/);
  assert.match(section,/Newest outputs checked live/);
  const cache=app.slice(app.indexOf("function readPipelineOutputCache"),app.indexOf("function writePipelineOutputCache"));
  assert.doesNotMatch(cache,/localStorage\.getItem\("studio\.pipelineOutputs\.v1"\)/);
});