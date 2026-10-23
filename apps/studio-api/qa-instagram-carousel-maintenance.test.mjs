import test from "node:test";
import assert from "node:assert/strict";
import { qaCarouselMaintenanceDecision, qaInstagramCarouselMaintenance } from "./qa-instagram-carousel-maintenance.mjs";

const record = (override={}) => ({
  id:"rec12345678901234",
  fields: {
    Output_ID: 1023, Platform:"Instagram", Platform_Output_Type:"Instagram Carousel",
    Output_Status:"Approved for Publishing", Publish_Status:"Ready to Publish",
    Auto_Publish_Enabled:true, Do_Not_Publish:false,
    IG_Carousel_Status:"Creating Children",
    IG_Carousel_Child_Count:10, ...override,
  },
});
const slides=(n=10) => Array.from({length:n},(_,i)=>({
  id:"rec"+String(i+1).padStart(14,"0"),
  fields: { "Current Order":i+1, "Is Cover":i===0, "Approved For Final":true,
    IG_Child_Container_ID:String(17907026169575604n + BigInt(i)),
    IG_Child_Container_Status:"FINISHED",
  },
}));
const NOW=Date.parse("2026-10-23T03:00:00Z");

test("stale Creating Children with exact approved cover + ten IDs only rearms a poll",()=>{
  const outcome=qaCarouselMaintenanceDecision(record({Publish_Locked_At:"2026-10-23T01:00:00Z"}),slides(),NOW);
  assert.equal(outcome.outcome,"carousel_child_poll_rearmed");
  assert.equal(outcome.rearm,true);
  assert.equal(outcome.graph_creates,0);
});
test("known oversize Meta rejection rearms existing child poll, not new parent",()=>{
  const outcome=qaCarouselMaintenanceDecision(record({
    IG_Carousel_Status:"Creating Parent",IG_Carousel_Child_Count:16,
    Publish_Error_Stage:"QA_IG_AP3C_UNSUPPORTED_ATTACHMENTS",
  }),slides(16),NOW);
  assert.equal(outcome.reason,"oversized_parent_recheck");
  assert.equal(outcome.graph_creates,0);
});
test("ambiguous order, missing cover, absent child, holds, test IDs and active locks all fail closed",()=>{
  const mutations=[
    {args:{Do_Not_Publish:true}}, {args:{Test_Run_ID:"SYNTHETIC"}},
    {args:{Platform_Post_ID:"179000000000"}},
    {args:{IG_Carousel_Parent_Container_ID:"179000000000"}},
    {args:{Publish_Locked_At:"2026-10-23T02:55:00Z"}},
    {modify:x=>{x[0].fields["Is Cover"]=false}},
    {modify:x=>{x[2].fields["IG_Child_Container_ID"]=""}},
    {modify:x=>{x[3].fields["IG_Child_Container_ID"]=x[2].fields["IG_Child_Container_ID"]}},
    {modify:x=>{x[1].fields["Current Order"]=1}},
  ];
  for(const spec of mutations){
    const rs=slides();
    spec.modify?.(rs);
    const o=qaCarouselMaintenanceDecision(record(spec.args),rs,NOW);
    assert.equal(o.rearm,false);
    assert.equal(o.graph_creates,0);
  }
});
test("exact rearm writes no publish data, uses upsert ledger and independently reads back",async()=>{
  let row=record(),writes=[],keys=new Set();
  const fetcher=async(_env,table,path,opts={})=>{
    if(table==="Carousel Slides")return {records:slides()};
    if(table==="Quality Agent Recovery Ledger"){
      if(opts.method==="PATCH"){
        const body=JSON.parse(opts.body);
        assert.deepEqual(body.performUpsert.fieldsToMergeOn,["Event_Key"]);
        keys.add(body.records[0].fields.Event_Key);
        return {records:[{id:"rec98765432101234"}]};
      }
      throw Error("unexpected ledger access");
    }
    if(opts.method==="PATCH"){
      const body=JSON.parse(opts.body);
      assert.ok(!("Publish_Status" in body.fields));
      assert.ok(!("Platform_Post_ID" in body.fields));
      assert.ok(!("Publish_Attempt_Count" in body.fields));
      writes.push(body.fields);
      row={...row,fields:{...row.fields,...body.fields}};
      return row;
    }
    if(path.startsWith("?"))return {records:["Creating Children","Creating Parent"].includes(row.fields.IG_Carousel_Status)?[row]:[]};
    return row;
  };
  const env={AIRTABLE_OUTPUT_TABLE_ID:"Platform Outputs"};
  const first=await qaInstagramCarouselMaintenance(env,{airtableFetch:fetcher,nowMs:NOW});
  assert.equal(first[0].outcome,"carousel_child_poll_rearmed");
  assert.equal(row.fields.IG_Carousel_Status,"Children Processing");
  assert.equal(row.fields.IG_Carousel_Child_Count,10);
  assert.equal(writes.length,1);
  assert.equal(keys.size,1);
  const second=await qaInstagramCarouselMaintenance(env,{airtableFetch:fetcher,nowMs:NOW});
  assert.equal(second.length,0);
  assert.equal(writes.length,1);
});
test("Airtable or stale readback errors fail closed without fake recovery",async()=>{
  await assert.rejects(qaInstagramCarouselMaintenance({}, {airtableFetch:async()=>{throw Error("429")}}),/429/);
  let writes=0;
  const fetcher=async(_env,table,path,opts={})=>{
    if(table==="Carousel Slides")return {records:slides()};
    if(table==="Quality Agent Recovery Ledger")return {records:[{id:"rec98765432101234"}]};
    if(opts.method==="PATCH"){writes++;return {};}
    if(path.startsWith("?"))return {records:[record({Do_Not_Publish:true})]};
    return record({Do_Not_Publish:true});
  };
  const result=await qaInstagramCarouselMaintenance({AIRTABLE_OUTPUT_TABLE_ID:"Platform Outputs"},{airtableFetch:fetcher,nowMs:NOW});
  assert.equal(result.length,1);
  assert.equal(result[0].outcome,"human_review_required");
  assert.equal(result[0].reason,"publishing_hold");
  assert.equal(writes,0);
});
