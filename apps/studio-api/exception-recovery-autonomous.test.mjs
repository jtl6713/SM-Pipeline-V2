import test from "node:test";
import assert from "node:assert/strict";
import {reconcilePublication,autonomousRecoveryPolicy,receiptBlock} from "./exception-recovery-autonomous.mjs";
import {verifyAuthenticatedYouTubeReceipt} from "./exception-recovery-authenticated-receipt.mjs";
import {normalizeRecoveryHistory,recoveryAuditFields} from "./exception-recovery-history.mjs";
const instant=Date.parse("2026-10-24T12:00:00Z");
const id="recAAAAAAAAAAAAAA", profile="recBBBBBBBBBBBBBB", video="hc1heQnfn6k";
const channel="UC"+"A".repeat(22);
function fixture() {
  let row={id,fields:{Output_ID:4092,Output_Title:"E Line To Beach",Platform:"YouTube",
    Content_Profile:[profile],Review_Status:"Approved",Output_Status:"Approved",Publish_Status:"Pending",
    YouTube_Video_ID:video,Platform_Post_URL:"https://www.youtube.com/shorts/"+video,
    Scheduled_Post_Date:"2026-10-23T12:00:00Z"}};
  let state=null, writes=0,reads=0;const audits=[];
  const receipt={platform:"YouTube",verified_public:true,verified_delivery:true,ownership_verified:true,
    profile_id:profile,remote_id:video,channel_id:channel,
    permalink:"https://www.youtube.com/watch?v="+video,
    published_at:"2026-10-23T13:00:00.000Z",checked_at:new Date(instant).toISOString()};
  const deps={recordId:id,now:()=>instant,uuid:()=>"attempt-1",
    policy:{...autonomousRecoveryPolicy({}),mutate:true,canaryRecord:id},
    readOutput:async()=>{reads++;return structuredClone(row);},
    verifyRemote:async()=>structuredClone(receipt),
    patchStatus:async(_,fields)=>{writes++;Object.assign(row.fields,fields);},
    appendAudit:async event=>{audits.push(structuredClone(event));},
    readState:async()=>structuredClone(state),
    saveState:async(_,value)=>{state=structuredClone(value);}};
  return {deps,row,receipt,audits,get state(){return state;},get writes(){return writes;},get reads(){return reads;}};
}
test("default gates are OFF and existing administrator gate cannot activate automation",()=>{
  assert.equal(autonomousRecoveryPolicy({}).mutate,false);
  assert.equal(autonomousRecoveryPolicy({EXCEPTION_RECOVERY_ACTIONS_ENABLED:"true"}).mutate,false);
  assert.equal(autonomousRecoveryPolicy({PUBLICATION_RECONCILIATION_ENABLED:true}).mutate,false);
});
test("exact public canary writes only status and provider time; readback precedes success",async()=>{
  const f=fixture();const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Corrected");assert.equal(f.writes,1);assert.equal(f.reads,4);
  assert.equal(f.row.fields.Scheduled_Post_Date,"2026-10-23T12:00:00Z");
  assert.equal(f.row.fields.Published_At,f.receipt.published_at);
  assert.equal(f.audits[0].phase,"intent");assert.equal(f.audits[1].outcome,"Corrected");
  assert.equal(f.state.terminal,true);
  assert.equal((await reconcilePublication(f.deps)).outcome,"Already Reconciled");
  assert.equal(f.audits.length,2);assert.equal(f.writes,1);
});
for(const [name,change] of [
  ["hold",{Do_Not_Publish:true}],["approval",{Review_Status:"Rejected"}],
  ["test",{Test_Run_ID:"test"}],["lock",{Publish_Locked_By:"publisher",Publish_Locked_At:new Date(instant).toISOString()}],
  ["cooldown",{Publish_Next_Retry_At:new Date(instant+60000).toISOString()}],
  ["retry ceiling",{Publish_Attempt_Count:3}],["missing saved URL",{Platform_Post_URL:""}],
  ["conflicting URL",{Manual_Published_URL:"https://www.youtube.com/watch?v=abcdefghijk"}],
  ["conflicting ID",{Platform_Post_ID:"abcdefghijk"}],["conflicting time",{Published_At:"2026-10-23T14:00:00Z"}],
  ["wrong provider",{Platform:"Instagram"}],
]) test(name+" blocks without status mutation",async()=>{
  const f=fixture();Object.assign(f.row.fields,change);
  const result=await reconcilePublication(f.deps);assert.notEqual(result.outcome,"Corrected");assert.equal(f.writes,0);
});
for(const [name,change] of [
  ["wrong identity",{remote_id:"abcdefghijk"}],["wrong profile",{profile_id:"recCCCCCCCCCCCCCC"}],
  ["no ownership",{ownership_verified:false}],["private",{verified_public:false}],
  ["stale evidence",{checked_at:"2026-10-24T11:58:00Z"}],["no provider timestamp",{published_at:null}],
]) test(name+" fails closed",async()=>{
  const f=fixture();Object.assign(f.receipt,change);
  assert.notEqual((await reconcilePublication(f.deps)).outcome,"Corrected");assert.equal(f.writes,0);
});
test("public visibility without authenticated delivery ownership never authorizes a status correction",async()=>{
  const f=fixture();f.receipt.verified_delivery=false;
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Needs Decision");
  assert.equal(result.reason,"delivery_ownership_unverified");
  assert.equal(f.writes,0);
});
test("dry run obtains proof but never writes",async()=>{
  const f=fixture();f.deps.policy.mutate=false;
  assert.equal((await reconcilePublication(f.deps)).reason,"verified_publication_mutation_not_authorized");
  assert.equal(f.writes,0);
});
test("different canary cannot mutate",async()=>{
  const f=fixture();f.deps.policy.canaryRecord="recCCCCCCCCCCCCCC";
  await reconcilePublication(f.deps);assert.equal(f.writes,0);
});
test("hold added during provider request blocks repair",async()=>{
  const f=fixture();f.deps.verifyRemote=async()=>{f.row.fields.Do_Not_Publish=true;return f.receipt;};
  assert.equal((await reconcilePublication(f.deps)).outcome,"Blocked");assert.equal(f.writes,0);
});
test("audit failure before intent prevents mutation",async()=>{
  const f=fixture();f.deps.appendAudit=async()=>{throw new Error("ledger down");};
  await assert.rejects(reconcilePublication(f.deps));assert.equal(f.writes,0);
});
test("failed readback retains durable intent; restart confirms without another write",async()=>{
  const f=fixture(),read=f.deps.readOutput;let calls=0;
  f.deps.readOutput=async()=>{calls++;if(calls===4)throw new Error("timeout");return read();};
  assert.equal((await reconcilePublication(f.deps)).outcome,"Awaiting Verification");
  assert.ok(f.state.pending);assert.equal(f.writes,1);
  f.deps.readOutput=read;
  assert.equal((await reconcilePublication(f.deps)).outcome,"Corrected");assert.equal(f.writes,1);
});
test("partial write remains visible and is never blindly retried",async()=>{
  const f=fixture();f.deps.patchStatus=async()=>{f.row.fields.Output_Status="Published";};
  assert.equal((await reconcilePublication(f.deps)).outcome,"Awaiting Verification");
  assert.equal((await reconcilePublication(f.deps)).outcome,"Needs Decision");
});
test("Airtable history retains title, evidence and before/after independent of active output",async()=>{
  const f=fixture();const result=await reconcilePublication(f.deps);
  const row={id:"recDDDDDDDDDDDDDD",fields:recoveryAuditFields(result)};
  const history=normalizeRecoveryHistory([row],{q:"E Line",actor:"automatic",outcome:"Corrected"});
  assert.equal(history.length,1);assert.equal(history[0].receipt.remote_id,video);
  assert.equal(history[0].before.Output_Status,"Approved");
  assert.equal(history[0].after.Output_Status,"Published");
  assert.equal(normalizeRecoveryHistory([row],{platform:"Facebook"}).length,0);
});
function providerFixture(change={}) {
  const f=fixture(),requests=[];
  const videoData={id:video,status:{privacyStatus:"public",uploadStatus:"processed"},
    snippet:{channelId:channel,publishedAt:f.receipt.published_at,liveBroadcastContent:"none"}};
  Object.assign(videoData,change);
  return {f,requests,videoData,options:{expectedChannelId:channel,now:()=>instant,
    settings:{YOUTUBE_UPLOAD_SERVICE_URL:"https://uploader.example",YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET:"test-secret"},
    fetcher:async(url,options)=>{
      requests.push({url,options});
      return {ok:true,json:async()=>url.endsWith("/youtube/oauth/status")
        ?{refresh_ok:true,channel_identity_ok:true,channel_id:channel}:{items:[videoData]}};
    }}};
}
test("YouTube adapter reuses only authenticated GETs and exact owned public video",async()=>{
  const p=providerFixture();const r=await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options);
  assert.equal(r.verified_public,true);assert.equal(r.ownership_verified,true);
  assert.equal(p.requests.length,2);assert.ok(p.requests.every(r=>r.options.method==="GET"&&r.options.redirect==="error"));
  assert.ok(!JSON.stringify(r).includes("test-secret"));
});
for(const [name,change] of [
  ["private",{status:{privacyStatus:"private",uploadStatus:"processed"}}],
  ["draft",{status:{privacyStatus:"public",uploadStatus:"uploaded"}}],
  ["scheduled",{status:{privacyStatus:"public",uploadStatus:"processed",publishAt:"2026-11-01T00:00:00Z"}}],
  ["wrong channel",{snippet:{channelId:"UCwrong",publishedAt:"2026-10-23T00:00:00Z"}}],
  ["wrong video",{id:"abcdefghijk"}],
  ["premiere",{snippet:{channelId:channel,publishedAt:"2026-10-23T00:00:00Z",liveBroadcastContent:"upcoming"}}],
])test("authenticated provider rejects "+name,async()=>{
  const p=providerFixture(change);assert.equal((await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options)).verified_public,false);
});
test("missing channel configuration and inaccessible provider fail closed",async()=>{
  const p=providerFixture();p.options.expectedChannelId=null;
  assert.equal((await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options)).verified_public,false);
  assert.equal(p.requests.length,0);
  p.options.expectedChannelId=channel;p.options.fetcher=async()=>({ok:false});
  assert.equal((await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options)).verified_public,false);
});
