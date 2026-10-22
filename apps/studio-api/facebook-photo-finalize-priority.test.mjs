import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { FACEBOOK_PENDING_FINALIZE_FORMULA, fb3FinalizeEligible, selectFb3FinalizeBatch } from "./facebook-photo-finalize-priority.mjs";

const now = Date.parse("2026-10-22T14:00:00.000Z");
const row = (n, fields = {}) => ({
  id: "recFbTest" + n, fields: {
    Output_ID: n, Platform: "Facebook", Review_Status: "Approved",
    Output_Status: "Approved for Publishing", Publish_Status: "Publishing",
    FB_Publish_Status: "Published Pending Finalize",
    Platform_Post_ID: "831080826745798_" + String(122148502503022170 + n),
    FB_Last_Checked_At: "2026-10-16T12:00:00.000Z", ...fields,
  },
});

test("FB3 scan is existing-post-only and never a publish/create candidate scan", () => {
  for (const token of ["FB_Publish_Status", "Published Pending Finalize", "Platform_Post_ID",
    "Published_At", "Publish_Status", "Do_Not_Publish", "Platform"]) {
    assert.ok(FACEBOOK_PENDING_FINALIZE_FORMULA.includes(token), token);
  }
});

test("only evidence-positive already-posted Facebook candidates can finalize", () => {
  assert.equal(fb3FinalizeEligible(row(1), now), true);
  const reject = [
    { Platform: "Instagram" }, { Platform_Post_ID: "" },
    { Publish_Status: "Published" }, { Output_Status: "Published" },
    { Published_At: "2026-10-20T00:00:00Z" }, { Do_Not_Publish: true },
    { Test_Run_ID: "QA-TEST" }, { FB_Publish_Status: "Ready for Photo Media" },
    { Publish_Locked_By: "active", Publish_Locked_At: "2026-10-22T13:55:00Z" },
    { Publish_Locked_By: "invalid", Publish_Locked_At: "" },
    { Publish_Locked_By: "stale", Publish_Locked_At: "2026-10-01T00:00:00Z" },
  ];
  for (const bad of reject) assert.equal(fb3FinalizeEligible(row(9,bad), now), false, JSON.stringify(bad));
});

test("rotate across four-item windows without resetting attempts or blocking later posts", () => {
  const rows = Array.from({length:13}, (_,i)=>row(i+1));
  const first = selectFb3FinalizeBatch(rows, {limit:4,nowMs:0});
  const second = selectFb3FinalizeBatch(rows, {limit:4,nowMs:300_000});
  const third = selectFb3FinalizeBatch(rows, {limit:4,nowMs:600_000});
  const fourth = selectFb3FinalizeBatch(rows, {limit:4,nowMs:900_000});
  assert.deepEqual([first.length, second.length, third.length, fourth.length], [4,4,4,1]);
  assert.equal(new Set([...first,...second,...third,...fourth].map(x=>x.id)).size,13);
});

test("FB3 is launched independently before Factory recovery and gated by cooldown", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const worker = fs.readFileSync(path.join(dir, "worker.js"), "utf8");
  const start = worker.indexOf("const cadence = studioCronAirtableCadence(cadenceNow");
  const end = worker.indexOf("// --- LIGHT (every 5 min):", start);
  assert.ok(start >= 0 && end > start);
  const light = worker.slice(start, end);
  const fb3 = light.indexOf("studioReconcileFacebookPhotoFinalizes(env, { limit: 4 })");
  const factory = light.indexOf("await factoryBatchCronResume(env, ctx)");
  assert.ok(fb3 > 0 && factory > 0 && fb3 < factory, "FB3 must not wait behind Factory batch recovery");
  assert.match(light, /ctx\.waitUntil\(studioReconcileFacebookPhotoFinalizes/);
  assert.match(light, /fb3CooldownMs > AIRTABLE_SLOT_FAIL_FAST_MS/);
  assert.match(light, /creates: 0/);
  assert.equal((light.match(/studioReconcileFacebookPhotoFinalizes\(env/g) || []).length, 1);
});

test("light cadence invokes FB3 existing-post finalize separately from heavy publishing", () => {
  const dir=path.dirname(fileURLToPath(import.meta.url));
  const worker=fs.readFileSync(path.join(dir,"worker.js"),"utf8");
  const ops=fs.readFileSync(path.join(dir,"worker-functions-04.mjs"),"utf8");
  assert.match(worker,/studioReconcileFacebookPhotoFinalizes\(env, \{ limit: 4 \}\)/);
  assert.ok(worker.indexOf("studioReconcileFacebookPhotoFinalizes(env, { limit: 4 })") <
    worker.indexOf("if (!cadence.heavy) return;"));
  const fn=ops.slice(ops.indexOf("export async function studioReconcileFacebookPhotoFinalizes("),
    ops.indexOf("/*__STUDIO_WORKER_END:studioReconcileFacebookPhotoFinalizes__*/"));
  assert.match(fn,/studioPulseFb3\(env, latest\)/);
  assert.match(fn,/persistVerifiedRecoveryInAirtable/);
  assert.match(fn,/airtable_existing_publication_receipt/);
  assert.match(fn,/durable_recovery_recorded/);
  assert.doesNotMatch(fn,/studioPulseFb0|studioPulseFb1|studioPulseFb2\(/);
});
