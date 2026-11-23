import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QUALITY_CHECK_BY_KIND, attachQualityChecks } from "./quality-checks.mjs";
import { CLASSIFIER_KINDS } from "./desk-inventory.mjs";
import { FACTORY_HANDOFF_SIGNATURE } from "./quality-factory-handoff.mjs";

const file = path => readFile(new URL(path, import.meta.url),"utf8");

test("Quality Agent catalog registers a single safe issue-2846 end-to-end signature",()=>{
  const row=QUALITY_CHECK_BY_KIND.production_factory_handoff;
  assert.ok(row);
  assert.equal(row.signature,FACTORY_HANDOFF_SIGNATURE);
  assert.equal(row.heal,"ticket_only","no false automatic approval/repair adapter");
  assert.equal(row.actor,"desk_agent");
  assert.ok(CLASSIFIER_KINDS.includes(row.kind));
  assert.equal(attachQualityChecks([],{scannedKinds:["health_down"]})
    .find(x=>x.kind===row.kind).status,"not_run");
  assert.equal(attachQualityChecks([{
    kind:row.kind,fingerprint:"e2e:req:planned_output_missing",
  }],{scannedKinds:[]}).find(x=>x.kind===row.kind).status,"finding");
});

test("existing Worker API exposes independently bounded handoff and exact Factory projection findings",async()=>{
  const worker=await file("./worker-functions-04.mjs");
  assert.match(worker,/import \{[\s\S]*?scanRecentProductionFactoryHandoffs,[\s\S]*?auditFactoryCardProjection,[\s\S]*?\} from "\.\/quality-factory-handoff\.mjs"/);
  assert.match(worker,/quality_agent_handoff: \{/);
  assert.match(worker,/findings: handoffFindings\.slice\(0,25\)/);
  assert.match(worker,/production_to_factory: productionToFactory/);
  assert.match(worker,/studioReadCoalesce\("quality-factory-handoff-2846", 60_000/);
  assert.match(worker,/if \(handoff\.verification_required_count === 0\)\s*scanned\("production_factory_handoff"\)/);
  const route=worker.slice(worker.indexOf('if (url.searchParams.get("quality_only") === "1")'),
    worker.indexOf('// Only the explicit view=completed request'));
  assert.doesNotMatch(route,/enqueueStudioProductionJob\(|factorySupabaseApproveOutput\(|studioPublishNow\(/);
});

test("Factory Quality Agent UI shows precise findings and unknown states without a publish or approve button",async()=>{
  const js=await file("../studio-web/assets/factory-batch-quality-0710.js");
  const page=await file("../studio-web/index.html");
  assert.match(js,/const handoff = data\.production_to_factory/);
  assert.match(js,/QA-PRODUCTION-FACTORY-E2E-2846/);
  assert.match(js,/deep verification required/);
  assert.match(js,/Production → Factory status unavailable/);
  assert.match(js,/handoffFindings\.map\(item/);
  assert.match(page,/factory-batch-quality-0710\.js\?v=[^"]*&handoff=qa2846/);
  // New monitor prose has no submit/hold-release actions.
  const markup=js.slice(js.indexOf("const handoff = data.production_to_factory"),
    js.indexOf("if (!data.job_id)",js.indexOf("const handoff = data.production_to_factory")));
  assert.doesNotMatch(markup,/data-qa-reapprove|data-factory-approve|data-release-hold|fetch\(/);
});

test("Handoff source includes no direct provider, production or status writes",async()=>{
  const s=await file("./quality-factory-handoff.mjs");
  assert.doesNotMatch(s,/\bsupabaseRest\(/);
  assert.doesNotMatch(s,/\bairtableFetch\(/);
  assert.doesNotMatch(s,/\benqueueStudioProductionJob\(/);
  assert.doesNotMatch(s,/\bfetch\(|\bPATCH\b|\bPOST\b|\bpublishNow\(/);
});
