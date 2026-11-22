import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
const start=source.indexOf("export async function fetchPromotionHandoff(");
const end=source.indexOf("/*__STUDIO_WORKER_END:fetchPromotionHandoff__*/",start);
assert.ok(start>=0 && end>start);
const body=source.slice(start,end).replace(/^export /,"");

test("Worker binds exact Production Request to I3 and requires I4 content receipt",async()=>{
  const calls=[];
  const ctx={
    HttpError:class HttpError extends Error{constructor(status,message){super(message);this.status=status}},
    item4PulsePipelineStage: async(_env,stage,payload)=>{
      calls.push({stage,payload});
      return {response:{ok:true,status:200},payload:{
        status:"ok",recovery_approval_hold:true,
        details:{run:{i4:{processed:true,content_item_id:"recABCDEF12345678"}}}
      }};
    }
  };
  const fn=vm.runInNewContext(body+"\nfetchPromotionHandoff",ctx);
  const url=new URL("https://example.test/path?action=video_submit&record_id=recHkyoKeALlfq2jM");
  const result=await fn({},""+url,"recR4EQcshFZ4fNL0").catch(()=>null);
  assert.equal(result,null,"URL objects must be passed rather than raw strings");
  const completed=await fn({},url,"recR4EQcshFZ4fNL0");
  assert.equal(completed.recoveryHold,true);
  assert.equal(calls.at(-1).stage,"i3");
  assert.equal(calls.at(-1).payload.extra.production_request_record_id,"recR4EQcshFZ4fNL0");
  assert.equal(calls.at(-1).payload.extra.record_id,"recHkyoKeALlfq2jM");
  assert.equal(calls.at(-1).payload.extra.trigger_i4,true);
});
test("I3 without a committed I4 result never fabricates a successful approval",async()=>{
  const ctx={
    HttpError:class HttpError extends Error{constructor(status,message){super(message);this.status=status}},
    item4PulsePipelineStage:async()=>({response:{ok:true,status:200},payload:{status:"ok",details:{run:{i4:{processed:false}}}}}),
  };
  const fn=vm.runInNewContext(body+"\nfetchPromotionHandoff",ctx);
  await assert.rejects(fn({},new URL("https://test.invalid/?action=video_submit"),"recR4EQcshFZ4fNL0"),
    e=>e.status===503 && /I4 Content Item/.test(e.message));
});
test("failed or ambiguous network completion preserves Submitted until readback",()=>{
  const promote=source.slice(source.indexOf("export async function promoteProductionRequestViaI3I4("),
    source.indexOf("/*__STUDIO_WORKER_END:promoteProductionRequestViaI3I4__*/"));
  assert.match(promote,/let promotionHandoff = null/);
  assert.match(promote,/if \(persistedIdea && promotionCompleted\(persistedIdea\)\)/);
  assert.match(promote,/This request remains Submitted/);
  assert.match(promote,/recoveryHold: promotionHandoff\?\.recoveryHold === true/);
  assert.match(promote,/Request_Status: "Draft", Submitted_At: null/);
  assert.match(source,/Do_Not_Publish: true,[\s\S]*?Auto_Publish_Enabled: false/);
});
