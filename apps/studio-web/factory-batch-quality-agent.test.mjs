import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { factoryBatchQualitySignals } from "../studio-api/factory-approval-queue.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,"index.html"),"utf8");
const quality=fs.readFileSync(path.join(here,"assets/factory-batch-quality-0710.js"),"utf8");
const css=fs.readFileSync(path.join(here,"assets/factory-batch-quality-0710.css"),"utf8");

test("Quality Agent has profile-scoped, read-only Factory batch findings in Factory and Operations",()=>{
  new Function(quality);
  for(const id of [
    "factoryBatchQuality","factoryBatchQualitySignals","factoryBatchQualityRefresh",
    "operationsFactoryBatchQuality","operationsFactoryBatchQualitySignals",
    "operationsFactoryBatchQualityRefresh"
  ])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/factory-batch-quality-0710\.js/);
  assert.match(html,/factory-batch-quality-0710\.css/);
  assert.match(quality,/credentials: "same-origin"/);
  assert.match(quality,/cache: "no-store"/);
  assert.match(quality,/new URLSearchParams\(\{ profile: profileId \}\)/);
  assert.doesNotMatch(quality,/method:\s*"POST"/);
  assert.doesNotMatch(quality,/\/api\/factory\/approve-all/);
  assert.match(css,/@media \(max-width: 600px\)/);
});

test("all canonical Factory batch Quality Agent signatures have visible explanatory actions",()=>{
 const cases=[
   ["QA-FACTORY-BATCH-STALLED","Approval batch stalled"],
   ["QA-FACTORY-BATCH-STATE-MISMATCH","Batch status needs reconciliation"],
   ["QA-FACTORY-BATCH-DUPLICATE-ITEM","Duplicate output IDs in batch"],
   ["QA-FACTORY-BATCH-TRANSIENT-WAIT","Waiting for a scheduled retry"],
   ["QA-FACTORY-BATCH-FAILED-ITEM","Approval item failed"]
 ];
 for(const [code,label] of cases){
  assert.ok(quality.includes(code));
  assert.ok(quality.includes(label));
 }
 const now=Date.parse("2026-10-17T12:00:00.000Z");
 const job={
  job_id:"fb_test",profile_id:"recProfile123",
  request_id:"factory_quality_test_20261017",status:"running",
  updated_at:"2026-10-17T11:35:00.000Z",
  items:[
   {id:"recSame",status:"failed",attempts:2,error:"test failure"},
   {id:"recSame",status:"pending",attempts:1,next_attempt_ms:now+100000}
  ]
 };
 const codes=factoryBatchQualitySignals(job,now).map(s=>s.code);
 for(const code of [
  "QA-FACTORY-BATCH-STALLED","QA-FACTORY-BATCH-DUPLICATE-ITEM",
  "QA-FACTORY-BATCH-TRANSIENT-WAIT","QA-FACTORY-BATCH-FAILED-ITEM"
 ])assert.ok(codes.includes(code),code);
 job.status="completed";
 assert.ok(factoryBatchQualitySignals(job,now).some(s=>s.code==="QA-FACTORY-BATCH-STATE-MISMATCH"));
});
