import test from "node:test";import assert from "node:assert/strict";
import {validExceptionRecoveryCensus,readExceptionRecoveryCensusCache,
persistExceptionRecoveryCensusCache} from "./exception-recovery-census-cache.mjs";
const time=Date.parse("2026-10-24T04:30:00Z");
const item={record_id:"recAAAAAAAAAAAAAA",categories:["held_deferred"]};
const base={status:"complete_census",source:"airtable",read_only:true,
 scan_completed_at:new Date(time).toISOString(),source_row_count:8087,
 totals:{outputs:8087,approved_past_due:25,approved_missing_date:0,failed:5,held_deferred:49},
 exception_items:[item],exception_items_count:1,exception_items_truncated:false};
function memory(){let stored=null;let reads=0,writes=0;return {
 get reads(){return reads;},get writes(){return writes;},
 async get(){reads++;return stored?{json:async()=>JSON.parse(stored)}:null;},
 async put(_key,s){writes++;stored=s;},
};}
test("ordinary navigation only uses a recent, verified durable cache",async()=>{
 const store=memory();
 assert.equal(await readExceptionRecoveryCensusCache(store,{nowMs:time}),null);
 assert.equal(store.writes,0);
 const proof=await persistExceptionRecoveryCensusCache(store,base,{nowMs:time});
 assert.equal(proof.status,"durable_verified");assert.equal(store.writes,1);
 const loaded=await readExceptionRecoveryCensusCache(store,{nowMs:time+60000});
 assert.equal(loaded.census_cache_status,"durable_fresh");
 assert.equal(loaded.totals.approved_past_due,25);
 assert.equal(await readExceptionRecoveryCensusCache(store,{nowMs:time+1800000}),null);
});
test("no partial, truncated, empty or forged-zero snapshots become trusted counts",()=>{
 for(const broken of [
  {...base,status:"partial"},
  {...base,exception_items_truncated:true},
  {...base,source_row_count:0},
  {...base,totals:{...base.totals,failed:-1}},
  {...base,exception_items_count:0},
  {...base,read_only:false}
 ])assert.equal(validExceptionRecoveryCensus(broken,{nowMs:time}),false);
});
test("missing or failing storage produces unknown, never a zero census",async()=>{
 assert.equal(await readExceptionRecoveryCensusCache(null,{nowMs:time}),null);
 assert.equal((await persistExceptionRecoveryCensusCache(null,base,{nowMs:time})).status,"unavailable");
 const bad={get:async()=>{throw Error("bucket unavailable");},put:async()=>{throw Error("denied");}};
 assert.equal(await readExceptionRecoveryCensusCache(bad,{nowMs:time}),null);
 assert.equal((await persistExceptionRecoveryCensusCache(bad,base,{nowMs:time})).status,"unavailable");
});
