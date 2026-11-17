import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const worker01 = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const worker02 = fs.readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");

function extractPureFunction(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  const end = source.indexOf(`/*__STUDIO_WORKER_END:${name}__*/`, start);
  assert.ok(start >= 0 && end > start, `Could not find ${name}`);
  return vm.runInNewContext(source.slice(start,end).replace("export function ", "function ") + `\n${name}`, {});
}

const recovery = extractPureFunction(worker01, "item4MasterQueueRecovery");
test("failed master original with staged source is eligible for bounded retry", () => {
  assert.equal(recovery("Error", 1, 1000, 200000).requeue, true);
  assert.equal(recovery("Failed", 2, 1000, 200000).requeue, true);
});
test("active, cooling down, or exhausted master is never blindly restarted", () => {
  assert.equal(recovery("Ready", 0, 1000, 200000).requeue, false);
  assert.equal(recovery("Processing", 1, 1000, 200000).requeue, false);
  assert.equal(recovery("Error", 1, 180000, 200000).reason, "retry-cooldown");
  assert.equal(recovery("Error", 4, 1000, 200000).reason, "retry-exhausted");
});
test("upsert preserves the same deterministic master transfer identity", () => {
  assert.match(worker01, /const transferId = item4MasterTransferId\(recordId, asset\.id\)/);
  assert.match(worker01, /fields\.Transfer_Status = recovery\.requeue \? "Pending"/);
  assert.match(worker01, /const current = byTransferId\.get\(transferId\)/);
  assert.match(worker01, /if \(!r2Key\) throw new HttpError\(409/);
});
test("variant poll resumes unfinished original before regenerating missing crop rows", () => {
  const begin=worker02.indexOf("export async function getItem4Variants(");
  const end=worker02.indexOf("/*__STUDIO_WORKER_END:getItem4Variants__*/",begin);
  const route=worker02.slice(begin,end);
  assert.ok(route.indexOf("await item4ResumePendingMasterAuthority(") >= 0);
  assert.ok(route.indexOf("await item4ResumePendingVariants(") > route.indexOf("await item4ResumePendingMasterAuthority("));
  assert.match(route, /ctx\.waitUntil/);
});
