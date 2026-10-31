import test from "node:test";
import assert from "node:assert/strict";
import {factoryCorrectionReceiptStore} from "./factory-correction-receipts.mjs";

const actor="recA1B2C3D4E5F6G7";
function bucketFixture(){
  const values=new Map();
  let count=0;
  const bucket={
    async get(key){
      const entry=values.get(key);
      return entry?{
        etag:entry.etag,
        text:async()=>entry.body,
      }:null;
    },
    async put(key,text,options={}){
      const previous=values.get(key);
      const guard=options.onlyIf;
      if(guard instanceof Headers && guard.get("If-None-Match")==="*"&&previous)
        return null;
      if(guard?.etagMatches&&guard.etagMatches!==previous?.etag)
        return null;
      const etag="etag-"+(++count);
      values.set(key,{etag,body:text});
      return {etag};
    },
  };
  return {bucket,values};
}
test("receipt store rejects duplicate create, version drift, and identity mutation",async()=>{
  const {bucket,values}=bucketFixture();
  const store=factoryCorrectionReceiptStore(bucket,actor);
  const first={
    schema:"studio.factory-correction-batch.1",
    client_request_id:"batch-12345678",version:1,fingerprint:"a".repeat(64),
    production_request_id:"rec12345678901234",profile_id:"rec22222222222222",
    selected_output_ids:["rec33333333333333"],outputs:{},
  };
  assert.equal(await store.createBatchReceiptIfAbsent(first.client_request_id,first),true);
  assert.equal(await store.createBatchReceiptIfAbsent(first.client_request_id,first),false);
  const changed={...first,version:2,status:"holding"};
  assert.equal(await store.updateBatchReceiptIfVersion(first.client_request_id,1,changed),true);
  assert.equal((await store.readBatchReceipt(first.client_request_id)).version,2);
  await assert.rejects(
    store.updateBatchReceiptIfVersion(first.client_request_id,1,{...changed,version:2}),
    /Concurrent/);
  await assert.rejects(
    store.updateBatchReceiptIfVersion(first.client_request_id,2,
      {...changed,version:3,profile_id:"rec44444444444444"}),
    /identity changed/);
  assert.equal(values.size,1);
});
test("actor namespace cannot read another reviewer's receipt",async()=>{
  const {bucket}=bucketFixture();
  const a=factoryCorrectionReceiptStore(bucket,actor);
  const b=factoryCorrectionReceiptStore(bucket,"recB1B2C3D4E5F6G7");
  const v={client_request_id:"request-1234567",version:1,
    fingerprint:"1".repeat(64),production_request_id:"rec12345678901234",
    profile_id:"rec22222222222222"};
  await a.createBatchReceiptIfAbsent(v.client_request_id,v);
  assert.equal(await b.readBatchReceipt(v.client_request_id),null);
});
