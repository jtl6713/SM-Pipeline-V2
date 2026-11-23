import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  shouldRunQualityFactoryHandoffCron,
  qualityFactoryHandoffCronReceipt,
  runQualityFactoryHandoffCron,
} from "./quality-factory-handoff-cron.mjs";

const cfg={cron:"* * * * *",source:"supabase",configured:true,disabled:false};
test("staggered read-only handoff Cron only admits 5-minute bounded cadence",()=>{
  const accepted=[];
  for(let minute=0;minute<60;minute++)
    if(shouldRunQualityFactoryHandoffCron({...cfg,minute}))accepted.push(minute);
  assert.deepEqual(accepted,[2,7,12,17,22,27,32,37,42,47,52,57]);
  for(const negative of [
    {...cfg,minute:2,source:"airtable"},
    {...cfg,minute:2,configured:false},
    {...cfg,minute:2,disabled:true},
    {...cfg,minute:2,cron:"0 * * * *"},
    {...cfg,minute:-1},
    {...cfg,minute:60},
    {...cfg,minute:"2"},
  ])assert.equal(shouldRunQualityFactoryHandoffCron(negative),false);
});

test("cron reads only bounded canonical plans/outputs, records actionable signature, no publication",async()=>{
  const contentId="11111111-1111-4111-8111-111111111111";
  const pr={airtable_record_id:"recR4EQcshFZ4fNL0",promoted_content_item_id:contentId,
    request_status:"Promoted",output_plan:{items:[
      {platform:"Instagram",output_type:"Reel"},
      {platform:"YouTube",output_type:"Short"},
    ]},production_job:{step:"done"}};
  const calls=[],logs=[];
  const receipt=await runQualityFactoryHandoffCron({
    read:async path=>{
      calls.push(path);
      assert.ok(path.startsWith("production_requests?") || path.startsWith("platform_outputs?"),"only canonical read-only table URLs allowed");
      return calls.length===1?[pr]:[];
    },logger:entry=>logs.push(entry),
  });
  assert.equal(calls.length,2);
  assert.ok(calls[0].includes("limit=4"));
  assert.ok(calls[1].includes("&limit=193"));
  assert.equal(receipt.status,"checked");
  assert.equal(receipt.scanned,1);
  assert.equal(receipt.repair_required,1);
  assert.equal(receipt.finding_count,2);
  assert.deepEqual(receipt.stages,["fanout"]);
  assert.equal(receipt.publish_actions,0);
  assert.equal(receipt.schedule_actions,0);
  assert.equal(receipt.approval_actions,0);
  assert.deepEqual(logs,[receipt]);
  assert.equal(JSON.stringify(receipt).includes("media.chicagoshining.com"),false);
});

test("incomplete Supabase reads fail closed instead of claiming zero incidents",async()=>{
  const q=qualityFactoryHandoffCronReceipt(null);
  assert.equal(q.status,"unavailable");
  assert.equal(q.outcome,"no_clearance_from_missing_evidence");
  const logs=[];
  await assert.rejects(runQualityFactoryHandoffCron({
    read:async()=>null,logger:x=>logs.push(x),
  }),/unavailable/);
  assert.equal(logs.length,0);
});

test("scheduled Worker cron has no producer/approval/publisher side effects in this detector",async()=>{
  const source=await readFile(new URL("./worker.js",import.meta.url),"utf8");
  const from=source.indexOf("// #2853: Proactive, read-only");
  const to=source.indexOf("// #2618: Old R3",from);
  assert.ok(from>=0 && to>from);
  const snippet=source.slice(from,to);
  assert.match(snippet,/shouldRunQualityFactoryHandoffCron/);
  assert.match(snippet,/QUALITY_FACTORY_HANDOFF_CRON_DISABLED/);
  assert.match(snippet,/read: path=>adminHoldSupabaseRest\(env,path\)/);
  assert.doesNotMatch(snippet,/enqueueStudioProductionJob|fanoutProductionRequestOutputs|PATCH|publishNow|studioPublish|approveOutput/);
});
