import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertFactoryCreativeQaDeleteSafe } from "./factory-creative-qa-delete-gate.mjs";

const a="recAAAABBBBCCCCDD",b="recDDDDCCCCBBBBAA";
const item=(id,held=false)=>({airtable_record_id:id,do_not_publish:held,error_messages:held
  ? { SM_2618_Creative_QA_Hold: { publishing_permitted:false, state:"unresolved_requires_creative_correction" } }
  : {}});

test("#2618: Factory Delete fails closed if a single selected output has an unresolved creative media QA marker", async () => {
  await assert.rejects(assertFactoryCreativeQaDeleteSafe([a],async()=>[item(a,true)]),/Creative QA hold:/);
  await assert.rejects(assertFactoryCreativeQaDeleteSafe([a],async()=>[
    {...item(a,true),do_not_publish:false},
  ]),/Creative QA hold:/);
});
test("#2618: Delete of a normal sibling cannot silently skip any creative QA held peer", async () => {
  await assert.rejects(assertFactoryCreativeQaDeleteSafe([a,b],async()=>[item(a),item(b,true)]),/Creative QA hold:/);
  assert.deepEqual(await assertFactoryCreativeQaDeleteSafe([a,b],async()=>[item(a),item(b)]),
    {safe:true,checked_count:2});
});
test("#2618: incomplete or ambiguous canonical Supabase coverage never permits a skip", async () => {
  await assert.rejects(assertFactoryCreativeQaDeleteSafe([a,b],async()=>[item(a)]),/coverage unavailable/);
  await assert.rejects(assertFactoryCreativeQaDeleteSafe([a,b],async()=>[item(a),item(a)]),/target mismatch/);
  await assert.rejects(assertFactoryCreativeQaDeleteSafe([a,a],async()=>[item(a)]),/ambiguous/);
  await assert.rejects(assertFactoryCreativeQaDeleteSafe(["not-an-output"],async()=>[]),/ambiguous/);
});
test("#2618: production Factory delete/skip integrates the fail-closed canonical gate before mutating siblings",()=>{
  const worker=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const block=worker.split("export async function factoryDeleteDeskItem")[1]
    ?.split("/*__STUDIO_WORKER_END:factoryDeleteDeskItem__*/")[0] || "";
  const guard=block.indexOf("assertFactoryCreativeQaDeleteSafe(ids");
  const mutations=block.indexOf("const patches = [...targets.values()]");
  assert.ok(guard>0 && mutations>guard,"the exact set must be checked before any Skip mutations");
  assert.match(block,/select=airtable_record_id,error_messages,do_not_publish/);
  assert.match(block,/new HttpError\(message\.startsWith\("Creative QA hold:"\) \? 409 : 503/);
});
