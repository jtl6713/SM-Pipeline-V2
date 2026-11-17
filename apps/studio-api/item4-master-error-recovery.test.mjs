import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const worker01=fs.readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
const worker02=fs.readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");

test("failed Master Original is rearmed only with staging, cooldown and finite attempts",()=>{
  const start=worker01.indexOf("export async function item4UpsertMasterQueue(");
  const end=worker01.indexOf("/*__STUDIO_WORKER_END:item4UpsertMasterQueue__*/",start);
  const upsert=worker01.slice(start,end);
  assert.match(upsert,/if \(!r2Key\) throw new HttpError\(409/);
  assert.match(upsert,/const attempts = Math\.max\(0, Number\(current \? f\(current, "Attempt_Count"\)/);
  assert.match(upsert,/\["Error", "Failed"\]\.includes\(currentStatus\)/);
  assert.match(upsert,/attempts < 4/);
  assert.match(upsert,/Date\.now\(\) - lastAttemptMs >= 120000/);
  assert.match(upsert,/fields\.Transfer_Status = retryFailedMaster \? "Pending"/);
  assert.match(upsert,/const transferId = item4MasterTransferId\(recordId, asset\.id\)/);
  assert.match(upsert,/const current = byTransferId\.get\(transferId\)/);
  assert.match(upsert,/\["Ready", "Drive Uploaded", "Processing"\]\.includes\(currentStatus\)/);
});
test("crop status polls resume the failed master before missing platform variants",()=>{
  const start=worker02.indexOf("export async function getItem4Variants(");
  const end=worker02.indexOf("/*__STUDIO_WORKER_END:getItem4Variants__*/",start);
  const route=worker02.slice(start,end);
  assert.match(route,/ctx\.waitUntil/);
  assert.ok(route.indexOf("await item4ResumePendingMasterAuthority(")>=0);
  assert.ok(route.indexOf("await item4ResumePendingVariants(")>route.indexOf("await item4ResumePendingMasterAuthority("));
  assert.match(route,/resumedMaster\?\.record \|\| reconciled\.record/);
});
