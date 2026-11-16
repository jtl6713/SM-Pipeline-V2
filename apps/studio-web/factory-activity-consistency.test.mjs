import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./assets/factory-desk.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  async function refreshFactoryBatchActivity('),source.indexOf('  // Terminal history is never fetched'));
const empty={ok:true,batches:[],totals:{active:0}};
const active={ok:true,batches:[{job_id:'old',status:'running'}],totals:{active:1}};
function harness(initial,fetcher){
 const state={batch:initial,lastBatchFetchMs:0,loading:true};
 const summary={};
 const context={state,Date,URLSearchParams,Set,JSON,fetchJson:fetcher,
 factoryProfileId:()=>'',renderFactoryBatchActivity:b=>{state.batch=b;},
 reconcilePendingGlobalSelection:()=>{},reconcileFinishedBatchDesk:async()=>{},
 reconcilePersistedFactoryPending:async()=>{},updateFactoryBatchToolbar:()=>{},
 document:{dispatchEvent:()=>{}},CustomEvent:class{},$:()=>summary};
 return {state,summary,refresh:vm.runInNewContext(code+'\nrefreshFactoryBatchActivity',context)};
}
test('old and new windows converge on the first successful empty response',async()=>{
 for(const initial of [active,null]){
  const h=harness(initial,async()=>empty);await h.refresh(true);
  assert.equal(h.state.batch,empty);assert.equal(h.state.batchActivityError,null);
 }
});
test('manual refresh during an in-flight poll is queued, not discarded',async()=>{
 let resolve;let calls=0;
 const first=new Promise(r=>resolve=r);
 const h=harness(active,()=>++calls===1?first:Promise.resolve(empty));
 const running=h.refresh(true);await h.refresh(true);
 assert.equal(calls,1);resolve(active);await running;
 assert.equal(calls,2);assert.equal(h.state.batch,empty);
});
test('failed and malformed responses mark retained activity unverified',async()=>{
 for(const fetcher of [async()=>{throw Error('network unavailable');},async()=>({})]){
  const h=harness(active,fetcher);await h.refresh(true);
  assert.equal(h.state.batch,active);assert.ok(h.state.batchActivityError);
  assert.match(h.summary.textContent,/temporarily unavailable/);
 }
});
