import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("  const ideaRowDeletesInFlight = new Set();"), source.indexOf("  function ideaRowHtml(r) {"));
const handler = source.slice(source.indexOf("  async function deleteIdeaFromRow("), source.indexOf("  function bindIdeaRowButtons(scope) {"));
function fixture({confirm=true, fail=false, record={id:"abc/1",title:"Lemont",status:"Generated"}, pause=false}={}) {
  const calls=[], messages=[], confirmations=[];
  let resolve;
  const gate = new Promise(r=>resolve=r);
  const c=vm.createContext({
    selectedProfileId:"Chicago", ideasCache:[record], activeIdea:null,
    ideaFromCache:id=>record?.id===id?record:null,
    ideaCanModify:r=>r?.status!=="Approved" && r?.status!=="Promoted",
    ideaHasProductionRequest:r=>Boolean(r?.production_request_id),
    window:{confirm:text=>{confirmations.push(text); return confirm;}},
    api:async(path,options)=>{calls.push({path,options}); if(pause)await gate;if(fail)throw Error("network");},
    setIdeasAutonomousMessage:(...a)=>messages.push(a),
    renderIdeasTable:()=>{}, $:()=>null, loadIdeas:async()=>{},loadDashboard:async()=>{},
    closeIdeaDrawer:async()=>{},
  });
  vm.runInContext(helpers+handler,c);
  return {calls,messages,confirmations,c,resolve,run:button=>c.deleteIdeaFromRow(record.id,button)};
}
test("inline deletion uses exact ID, no retry, no drawer, and prevents a duplicate in-flight click",async()=>{
  const f=fixture({pause:true});const b={disabled:false,textContent:"Delete"};
  const first=f.run(b);await f.run({disabled:false,textContent:"Delete"});
  assert.equal(f.calls.length,1);assert.equal(b.disabled,true);
  assert.equal(f.calls[0].path,"/api/ideas/abc%2F1");assert.equal(f.calls[0].options.method,"DELETE");
  assert.equal(f.calls[0].options.retries,0);assert.match(f.confirmations[0],/Lemont/);
  assert.doesNotMatch(f.confirmations[0],/Airtable/);f.resolve();await first;
  assert.equal(f.c.ideasCache.length,0);
});
test("cancellation and protected ideas cannot send a delete",async()=>{
  for(const opts of [{confirm:false},{record:{id:"abc/1",status:"Approved"}},{record:{id:"abc/1",status:"Promoted"}},{record:{id:"abc/1",status:"Generated",production_request_id:"req"}}]){
    const f=fixture(opts);await f.run({disabled:false});assert.equal(f.calls.length,0);
  }
});
test("ambiguous failure does not retry or remove the idea",async()=>{
  const f=fixture({fail:true});await f.run({disabled:false});
  assert.equal(f.calls.length,1);assert.equal(f.c.ideasCache.length,1);assert.match(f.messages.at(-1)[0],/not confirmed/);
});
test("row action is bound without opening the Manage drawer",()=>{
  assert.match(source,/data-idea-delete=/);assert.match(source,/void deleteIdeaFromRow\(button\.dataset\.ideaDelete, button\)/);
});
