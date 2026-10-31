import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
const start=source.indexOf("export async function fanoutProductionRequestOutputsToContentItems(");
const end=source.indexOf("/*__STUDIO_WORKER_END:fanoutProductionRequestOutputsToContentItems__*/",start);
assert.ok(start>=0&&end>start,"guarded fanout function must exist");
const body=source.slice(start,end);

test("recover missing forward link by reusing exactly one verified inverse-linked Platform Output",()=>{
  assert.match(body,/arrayOrEmpty\(f\(outputRow,"Platform Outputs"\)\)/);
  assert.match(body,/if\(inverseIds\.length>1\) throw new HttpError\(409/);
  assert.match(body,/airtableFetch\(env,STUDIO_PLATFORM_OUTPUT_TABLE,inverseIds\[0\]\)/);
  assert.match(body,/arrayOrEmpty\(f\(inverse,"Production_Request_Output"\)\)\.includes\(outputRow\.id\)/);
  assert.match(body,/arrayOrEmpty\(f\(inverse,"Content_Item"\)\)\.includes\(parent\.id\)/);
  assert.match(body,/String\(f\(inverse,"Platform"\)/);
  assert.match(body,/String\(f\(inverse,"Studio_Output_Type"\)/);
  assert.match(body,/poId=inverse\.id/);
  assert.match(body,/if\(!poId && !onlyMissing\)/);
});

test("schedule collision defers only booking; preserves original requested time and output",()=>{
  assert.match(body,/const isConflict=Number\(error\?\.status\)===409/);
  assert.match(body,/Requested Platform Output seed schedule conflicts with another output/);
  assert.match(body,/if \(!isConflict \|\| atomicSeedVacate\) throw error/);
  assert.match(body,/const readback=await airtableFetch\(env,STUDIO_PLATFORM_OUTPUT_TABLE,po\.id\)/);
  assert.match(body,/if\(hasReservation\) throw error/);
  assert.match(body,/po=readback/);
  assert.match(body,/deferredScheduleMessage=/);
  assert.match(body,/normal approval-stage scheduler/);
  assert.match(body,/Pipeline_Route_Status:"Routed"/);
  assert.doesNotMatch(body,/promoteIdeaViaI3I4\(/);
});

test("production route does not silently rebook or publish a conflicting Story",()=>{
  const guard=body.split("} catch(error) {\n        // Production routing is not a publishing approval.")[1];
  assert.ok(guard,"schedule-conflict guard must be inside explicit reservation catch");
  assert.doesNotMatch(guard.split("    const now=new Date().toISOString();")[0],/maeScheduleNextSlot|Scheduled_Post_Date:\s*new Date|Publish_Status:\s*"Published"/);
  assert.match(body,/Routed_At:now,Updated_At:now/);
});
