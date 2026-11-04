import test from "node:test";
import assert from "node:assert/strict";
import { assessHomeRefresh, verifyHomeOverviewGeneration } from "./exception-recovery-home-freshness.mjs";

const now=Date.parse("2026-11-04T05:00:00Z");
const complete=(at=now-20_000)=>({refresh:{
 status:"completed",snapshot_generation:"manual-proven",
 snapshot_at:at,component_status:{outputs:"completed",ideas:"completed"},
}});
const overview=()=>({ok:true,snapshot_generation:"manual-proven",snapshot_at:now-20_000,
 records:Array.from({length:4},(_,i)=>({profile_id:"rec"+String(i).padStart(14,"A"),
 approved_past_due:10,approved_missing_date:0,failed:2}))});
test("a complete and recent Home generation is re-usable",()=>{
 const a=assessHomeRefresh(complete(),now);
 assert.equal(a.status,"fresh");
 assert.equal(a.age_ms,20000);
 assert.equal(verifyHomeOverviewGeneration(overview(),a),true);
});
test("stale, partial or future generations fail the freshness gate",()=>{
 assert.equal(assessHomeRefresh(complete(now-130000),now).status,"needs_refresh");
 assert.equal(assessHomeRefresh(complete(now+3000),now).status,"needs_refresh");
 const x=complete();x.refresh.component_status.ideas="failed";
 assert.equal(assessHomeRefresh(x,now).status,"needs_refresh");
 assert.equal(assessHomeRefresh({refresh:{status:"refreshing"}},now).status,"building");
 assert.equal(assessHomeRefresh({refresh:{status:"cooling_down",retry_after_ms:4000}},now).status,"cooling_down");
 assert.equal(assessHomeRefresh({refresh:{status:"failed",error:"pool budget"}},now).status,"failed");
});
test("snapshot verification requires same generation, time and four complete profiles",()=>{
 const assessment=assessHomeRefresh(complete(),now);
 const o=overview();
 assert.equal(verifyHomeOverviewGeneration({...o,snapshot_at:now-10000},assessment),false);
 assert.equal(verifyHomeOverviewGeneration({...o,snapshot_generation:"stale"},assessment),false);
 assert.equal(verifyHomeOverviewGeneration({...o,records:o.records.slice(1)},assessment),false);
 assert.equal(verifyHomeOverviewGeneration({...o,records:[{},...o.records.slice(1)]},assessment),false);
 assert.equal(verifyHomeOverviewGeneration({...o,records:o.records.map(x=>({...x,approved_past_due:0}))},assessment),true);
});
