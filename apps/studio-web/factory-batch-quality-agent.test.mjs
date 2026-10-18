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

test("Factory dashboard puts Quality Agent in full-width row below batches and approvals", () => {
  const section = html.split('id="factoryBatchActivity"')[1]
    ?.split('id="factoryBatchRolloutNotice"')[0];
  assert.ok(section, "Factory batch activity exists");
  const metric = section.indexOf('id="factoryBatchMetricValue"');
  const approvals = section.indexOf('id="factoryBatchRecentList"');
  const qualityPanel = section.indexOf('id="factoryBatchQuality"');
  const qualityButton = section.indexOf('id="factoryBatchQualityRefresh"');
  assert.ok(metric >= 0 && approvals > metric && qualityPanel > approvals,
    "dashboard must present Recent batches, Recent approvals, then Quality Agent");
  assert.ok(section.indexOf('class="factory-global-history"') < qualityPanel,
    "Quality Agent must be a sibling below the Recent approvals column");
  assert.ok(section.indexOf('class="factory-global-quality"') === -1
    || section.indexOf('class="factory-global-quality"') > approvals);
  assert.equal((section.match(/id="factoryBatchQuality"/g) || []).length, 1);
  assert.equal((section.match(/id="factoryBatchQualityRefresh"/g) || []).length, 1);
  assert.ok(qualityButton > qualityPanel);
  assert.match(css, /\.factory-global-quality\s*\{\s*grid-column:1\s*\/\s*-1/);
  assert.match(css, /\.factory-global-summary\s*\{[^}]*grid-template-columns:minmax\(170px,220px\) minmax\(0,1fr\)/);
  assert.match(css, /\.factory-global-quality \.factory-batch-quality-list\s*\{[^}]*display:grid/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(html, /factory-batch-quality-0710\.css\?v=0\.6\.712-active-factory-batches&global=factory-v2-quality-horizontal/);
});
