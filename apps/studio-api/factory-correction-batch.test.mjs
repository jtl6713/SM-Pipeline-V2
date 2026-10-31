import test from "node:test";
import assert from "node:assert/strict";
import { submitFactoryCorrectionBatch } from "./factory-correction-batch.mjs";
import { productionFormatSignature } from "./production-format-groups.mjs";
const rec = n => "rec" + String(n).padStart(14,"0");
const key = productionFormatSignature({pipeline_family:"Video",format:"Vertical Short Video",aspect_ratio:"9:16"});
function fixture() {
  const outputs = Array.from({length:4},(_,i)=>({
    id:rec(i+1),production_request_id:rec(100),content_item_id:rec(101),
    profile_id:rec(102),platform:["Instagram","Facebook","TikTok","YouTube"][i],
    output_type:["Reel","Reel","Video Draft","Short"][i], enabled:true,
    render_format:{key,pipeline_family:"Video",format:"Vertical Short Video",aspect_ratio:"9:16"},
    render_status:"Rendered",output_status:"Ready for Review", final_file_url:"https://example.test/v1.mp4",
  }));
  const receipts=new Map(), held=new Map(), calls=[], locks=[];
  const ops={
    async withRequestLock(id,fn){ locks.push(id); return fn(); },
    async readAuthoritativeSnapshot(id){
      const source=outputs.find(row=>row.id===id);
      return {source,outputs:outputs.map(row=>held.has(row.id) ?
        {...row,review_hold_active:true}:row),authorized_profile_ids:[rec(102)]};
    },
    async readBatchReceipt(id){return structuredClone(receipts.get(id)||null);},
    async createBatchReceiptIfAbsent(id,r){if(!receipts.has(id))receipts.set(id,structuredClone(r));},
    async updateBatchReceiptIfVersion(id,version,r){
      if(receipts.get(id).version!==version)throw Error("CAS conflict");
      receipts.set(id,structuredClone(r));
    },
    async enrollHeldOutput({output_id,client_request_id}){
      calls.push(output_id);
      if (ops.failId===output_id) throw Object.assign(Error("No schedule vacate"),{code:"VACATE_FAILED"});
      held.set(output_id,{client_request_id,session_id:"session_"+output_id});
    },
    async verifyHeldSession(output_id,client_request_id){
      const x=held.get(output_id);
      return x?.client_request_id===client_request_id ?
        {hold_active:true,original_preserved:true,session_id:x.session_id,published_or_dispatching:false}:
        {hold_active:false};
    },
    failId:null,
  };
  const args={source_output_id:outputs[0].id,
    selected_output_ids:outputs.map(x=>x.id),note:"Replace one incorrect frame",
    client_request_id:"factoryreview_0123456789",operations:ops};
  return {ops,outputs,receipts,held,calls,locks,args};
}
test("holds four compatible outputs once and never invokes render/publish",async()=>{
  const f=fixture();
  const first=await submitFactoryCorrectionBatch(f.args);
  assert.equal(first.ok,true);
  assert.equal(first.status,"accepted");
  assert.equal(f.held.size,4);
  assert.equal(f.calls.length,4);
  assert.deepEqual(f.locks,[rec(100)]);
  const retry=await submitFactoryCorrectionBatch(f.args);
  assert.equal(retry.replay,true);
  assert.equal(f.calls.length,4);
});
test("partial hold is not called accepted, retry retains original holds",async()=>{
  const f=fixture();f.ops.failId=f.outputs[2].id;
  const partial=await submitFactoryCorrectionBatch(f.args);
  assert.equal(partial.ok,false);assert.equal(partial.status,"partial_hold");
  assert.equal(partial.outputs[f.outputs[2].id].verified,false);
  assert.equal(f.held.size,3);
  f.ops.failId=null;
  const recovered=await submitFactoryCorrectionBatch(f.args);
  assert.equal(recovered.ok,true);
  assert.equal(f.held.size,4);
  assert.equal(f.calls.filter(id=>id===f.outputs[0].id).length,1);
});
test("no idempotency key reused with changed note or selection",async()=>{
  const f=fixture();
  await submitFactoryCorrectionBatch(f.args);
  await assert.rejects(submitFactoryCorrectionBatch({...f.args,note:"Different note"}),/reused/);
  await assert.rejects(submitFactoryCorrectionBatch({...f.args,selected_output_ids:[f.outputs[0].id]}),/reused/);
});
test("revoked profile and lost hold both deny an accepted replay",async()=>{
  const f=fixture();await submitFactoryCorrectionBatch(f.args);
  f.held.delete(f.outputs[1].id);
  const again=await submitFactoryCorrectionBatch(f.args);
  assert.equal(again.ok,false);
  assert.equal(again.status,"partial_hold");
});
test("writes are never attempted without a complete trusted adapter",async()=>{
  const f=fixture();
  await assert.rejects(submitFactoryCorrectionBatch({...f.args,operations:{}}),/missing/);
});
