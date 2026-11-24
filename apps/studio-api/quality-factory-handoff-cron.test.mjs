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
  // Output of the cron is a fixed key whitelist; neither URLs nor captions
  // can be accidentally included by a future diagnostic extension.
  assert.deepEqual(Object.keys(receipt).sort(),[
    "approval_actions","checked_at","finding_count","publish_actions",
    "repair_required","scanned","schedule_actions","signature","stages",
    "status","verification_required",
  ].sort());
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

test("no eligible promoted requests is a real bounded empty sample, not an outage",async()=>{
  const calls=[];
  const receipt=await runQualityFactoryHandoffCron({
    read:async path=>{calls.push(path);return [];},
  });
  assert.equal(calls.length,1,"no output-table scan when zero candidate content IDs");
  assert.equal(receipt.status,"checked");
  assert.equal(receipt.scanned,0);
  assert.equal(receipt.repair_required,0);
  assert.equal(receipt.verification_required,0);
  assert.equal(receipt.publish_actions,0);
});

test("oldest failure: completed Production with no promoted Content owner is investigated, never silently zero",async()=>{
  const p={airtable_record_id:"recOriginalZero111",promoted_content_item_id:null,
    request_status:"Submitted",output_plan:{items:[
      {platform:"Instagram",output_type:"Carousel"},
      {platform:"YouTube",output_type:"Short"},
    ]},production_job:{step:"escalated"}};
  const reads=[];
  const receipt=await runQualityFactoryHandoffCron({
    read:async path=>{reads.push(path);return [p];},
  });
  assert.equal(reads.length,1,"no output enumeration when Content ownership missing");
  assert.equal(receipt.status,"checked");
  assert.equal(receipt.repair_required,1);
  assert.equal(receipt.finding_count,1);
  assert.deepEqual(receipt.stages,["fanout"]);
  assert.equal(receipt.publish_actions,0);
});

test("newly Submitted, still-active promotion is not a false failure",async()=>{
  const p={airtable_record_id:"recRunningProd001",promoted_content_item_id:null,
    request_status:"Submitted",output_plan:{items:[
      {platform:"Facebook",output_type:"Story"},
    ]},production_job:{step:"running"}};
  const result=await runQualityFactoryHandoffCron({
    read:async()=>[p],
  });
  assert.equal(result.status,"checked");
  assert.equal(result.repair_required,0);
  assert.equal(result.finding_count,1,"advisory content owner pending, not an auto repair");
  assert.equal(result.publish_actions,0);
});

test("scheduled repair is opt-in, exact-ID, signature matched and at most one per tick",async()=>{
  const contentId="11111111-1111-4111-8111-111111111111";
  const rec="recFHzU0h4f4mjgrj";
  const pr={airtable_record_id:"recR4EQcshFZ4fNL0",promoted_content_item_id:contentId,
    request_status:"Promoted",output_plan:{items:[{platform:"TikTok",output_type:"Multi-Photo"}]},
    production_job:{step:"done"}};
  const candidate={airtable_record_id:rec,content_item_id:contentId,content_profile_id:"profile",
    output_number:12345,platform:"TikTok",studio_output_type:"Multi-Photo",render_status:"Native Photo Route",
    output_status:"Ready for Review",review_status:"Review Sent",publish_status:"Not Ready",
    auto_publish_enabled:false,do_not_publish:false,tiktok_draft_status:"Waiting for Schedule",
    selected_clip_count:3,output_caption:"Verified media",
    studio_preview_url:"https://media.chicagoshining.com/a.jpg",
    thumbnail_url:"https://media.chicagoshining.com/a.jpg"};
  const read=async path=>path.startsWith("production_requests?")?[pr]:[candidate];
  let actions=0;
  const repair=async report=>{
    actions++;assert.equal(report.findings.length,1);assert.equal(report.findings[0].record_id,rec);
    return {status:"repaired"};
  };
  await runQualityFactoryHandoffCron({read,repair});
  await runQualityFactoryHandoffCron({read,repair,canaryRecordId:"recNotTheTargetABC"});
  assert.equal(actions,0);
  const receipt=await runQualityFactoryHandoffCron({read,repair,canaryRecordId:rec});
  assert.equal(actions,1);
  assert.equal(receipt.repair.status,"repaired");
  assert.equal(receipt.repair.approval_actions,0);
  assert.equal(receipt.repair.schedule_actions,0);
  assert.equal(receipt.repair.publish_actions,0);
  const uncertain=await runQualityFactoryHandoffCron({read,canaryRecordId:rec,repair:async()=>{throw Error("uncertain")}});
  assert.equal(uncertain.repair.status,"unverified");
  assert.equal(uncertain.repair.reason,"repair_requires_reconciliation");
});

test("older exact production canary is detected even outside recent plans",async()=>{
  const rec="rec8I104V9gQmiOxf";
  const candidate={airtable_record_id:rec,output_number:10857,
    content_item_id:"11111111-1111-4111-8111-111111111111",
    platform:"TikTok",studio_output_type:"Multi-Photo",render_status:"Native Photo Route",
    output_status:"Ready for Review",review_status:"Review Sent",publish_status:"Not Ready",
    auto_publish_enabled:false,do_not_publish:false,tiktok_draft_status:"Waiting for Schedule"};
  const calls=[];
  let dispatched=0;
  const result=await runQualityFactoryHandoffCron({
    canaryRecordId:rec,
    read:async path=>{
      calls.push(path);
      if(path.startsWith("production_requests?"))return [];
      assert.match(path,/^platform_outputs\?airtable_record_id=eq\.rec8I104V9gQmiOxf&/);
      assert.match(path,/&limit=2$/);
      return [candidate];
    },
    repair:async report=>{
      dispatched++;
      assert.equal(report.findings.length,1);
      assert.equal(report.findings[0].output_id,10857);
      assert.equal(report.findings[0].reason,"stale_tiktok_waiting_schedule_blocks_review");
      // Current real record is missing protected variant proof; this fixture
      // confirms detection and dispatch, not a successful production mutation.
      return {status:"skipped",reason:"missing_protected_exact_variant_receipt"};
    }
  });
  assert.equal(calls.length,2);
  assert.equal(dispatched,1);
  assert.equal(result.repair.status,"skipped");
  assert.equal(result.repair.output_id,10857);
  for(const rows of [null,[candidate,candidate],[{...candidate,scheduled_post_date:"2026-12-01"}],
    [{...candidate,test_run_id:"synthetic"}],[{...candidate,airtable_record_id:"recOther00000000"}]]){
    const blocked=await runQualityFactoryHandoffCron({
      canaryRecordId:rec,
      read:async path=>path.startsWith("production_requests?")?[]:rows,
      repair:async()=>{throw Error("must never dispatch");}
    });
    assert.notEqual(blocked.repair.reason,"repair_requires_reconciliation");
    assert.notEqual(blocked.repair.status,"repaired");
  }
});
