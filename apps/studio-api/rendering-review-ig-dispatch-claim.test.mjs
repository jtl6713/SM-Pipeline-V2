import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {claimChicagoInstagramDispatch as claim,igDispatchClaimEnabled as enabled}
  from "./rendering-review-ig-dispatch-claim.mjs";

const ID="recA1B2C3D4E5F6G7";
const ITEM="recQ1W2E3R4T5Y6U7";
const CHICAGO="recT2rbKX3MF7cVFU";
const SECRET="secret-for-server-only-test-123456789";
const fields={
  Content_Item:[ITEM],Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
  Review_Status:"Approved",Output_Status:"Approved for Publishing",
  Publish_Status:"Ready to Publish",Publish_Method:"Automated",
  Auto_Publish_Enabled:true,Do_Not_Publish:false,
  Final_File_ID:"source-123456",Final_File_URL:"https://drive.test/video.mp4",
  Publish_Asset_URL:"https://media.test/ready.mp4",
};
const flags={
  RENDERING_REVIEW_IG_DISPATCH_CLAIM_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_SHARED_SECRET:SECRET,
};
const input={
  output_id:ID,expected_publish_asset_url:fields.Publish_Asset_URL,
  expected_final_file_id:fields.Final_File_ID,client_request_id:"ap1ig_test_12345678",
};
function fixture({body=input,env=flags,secret=SECRET}={}){
  let current=structuredClone(fields), patches=0,locks=0;
  const output=()=>({id:ID,fields:structuredClone(current)});
  const readOutput=async()=>output();
  let profile=CHICAGO;
  const readContentItem=async()=>({id:ITEM,fields:{Content_Profile:[profile]}});
  const patchOutput=async(_id,fields)=>{patches++;Object.assign(current,fields)};
  const withOutputLock=async(_id,fn)=>{locks++;return fn()};
  const makeRequest=()=>new Request("https://studio.test/internal/rendering-review/ig-dispatch-claim",{
    method:"POST",headers:{"Content-Type":"application/json",
      "X-Review-Dispatch-Token":secret},body:JSON.stringify(body),
  });
  const send=()=>claim({request:makeRequest(),env,readOutput,readContentItem,patchOutput,withOutputLock,
    now:()=>new Date("2026-10-28T15:00:00Z")});
  return {send,env,output,readOutput,readContentItem,patchOutput,
    withOutputLock,get patches(){return patches},get locks(){return locks},
    change:(f,v)=>current[f]=v,setProfile:id=>{profile=id}};
}
test("all protected flags and a separate 24-character server secret are necessary",async()=>{
  assert.equal(enabled({}),false);
  for(const k of Object.keys(flags).filter(k=>k.startsWith("RENDERING_REVIEW_")&&k!=="RENDERING_REVIEW_DISPATCH_SHARED_SECRET")){
    const env={...flags};delete env[k];
    const f=fixture({env});
    await assert.rejects(()=>f.send(),e=>e.status===405);
    assert.equal(f.patches,0);
  }
  const bad=fixture({secret:"not-the-server-secret"});
  await assert.rejects(()=>bad.send(),e=>e.status===403);
  assert.equal(bad.locks,0);
});
test("Chicago publisher claims shared approval lock and independently reads back",async()=>{
  const f=fixture();
  const receipt=await f.send();
  assert.deepEqual(receipt,{
    ok:true,output_id:ID,owner:"AP1-IG",
    publish_started_at:"2026-10-28T15:00:00.000Z",
    claim_id:input.client_request_id,review_hold_active:false,
    remote_media_created:false,
  });
  assert.equal(f.locks,1);
  assert.equal(f.patches,1);
  assert.equal(f.output().fields.Publish_Locked_By,"AP1-IG");
  await assert.rejects(()=>f.send(),e=>e.code==="DISPATCH_ALREADY_OWNED");
  assert.equal(f.patches,1);
});
test("review wins the race: output hold blocks publisher under the same lock",async()=>{
  const f=fixture();
  f.change("Studio_Render_Review_Hold_Active",true);
  await assert.rejects(()=>f.send(),e=>e.code==="REVIEW_HOLD_ACTIVE");
  assert.equal(f.patches,0);
});
test("publishing wins the race: pre-existing publish lock cannot be overwritten",async()=>{
  const f=fixture();
  f.change("Publish_Locked_By","another-in-flight-owner");
  await assert.rejects(()=>f.send(),e=>e.code==="DISPATCH_ALREADY_OWNED");
  assert.equal(f.patches,0);
});
test("other profiles, stale identity, provider IDs and unapproved posts cannot claim",async()=>{
  const other=fixture();other.setProfile("recO1T2H3E4R5P6R7");
  await assert.rejects(()=>other.send(),e=>e.status===403);
  const stale=fixture();stale.change("Publish_Asset_URL","https://media.test/changed.mp4");
  await assert.rejects(()=>stale.send(),e=>e.code==="ARTIFACT_CHANGED");
  const remote=fixture();remote.change("Platform_Media_ID","1789sample");
  await assert.rejects(()=>remote.send(),e=>e.code==="DISPATCH_ALREADY_OWNED");
  const unapproved=fixture();unapproved.change("Review_Status","Review Sent");
  await assert.rejects(()=>unapproved.send(),e=>e.code==="OUTPUT_NOT_READY");
  for(const f of [other,stale,remote,unapproved])assert.equal(f.patches,0);
});
test("invalid client-supplied authority and malformed source cannot bypass gate",async()=>{
  const f=fixture({body:{...input,owner:"AP1-IG",approve:true}});
  await assert.rejects(()=>f.send(),e=>e.status===400);
  assert.equal(f.locks,0);
});
test("ambiguous patch readback fails closed",async()=>{
  const f=fixture();
  await assert.rejects(()=>claim({
    request:new Request("https://studio.test/internal/rendering-review/ig-dispatch-claim",{
      method:"POST",headers:{"Content-Type":"application/json","X-Review-Dispatch-Token":SECRET},
      body:JSON.stringify(input)}),
    env:flags,readOutput:f.readOutput,readContentItem:f.readContentItem,
    patchOutput:async()=>{},withOutputLock:f.withOutputLock,
  }),e=>e.code==="CLAIM_READBACK_FAILED");
});
test("Worker mounts internal shared claim before Studio user access and not on review UI route",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const internal=worker.indexOf('url.pathname === "/internal/rendering-review/ig-dispatch-claim"');
  const auth=worker.indexOf('const authorization = await resolveAuthorization(request, env);',internal);
  const block=worker.slice(internal,auth);
  assert.ok(internal>0&&auth>internal);
  assert.match(block,/igDispatchClaimEnabled\(env\)/);
  assert.match(block,/claimChicagoInstagramDispatch/);
  assert.match(block,/withOutputApprovalLock\(env.STUDIO_MEDIA,id,fn\)/);
  assert.match(block,/readContentItem:/);
  assert.doesNotMatch(block,/graph\.publish|APPROVE_ATTEMPT|RELEASE_REVIEW_HOLD/);
});
