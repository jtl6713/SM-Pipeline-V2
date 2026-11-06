import test from "node:test";
import assert from "node:assert/strict";
import {reconcilePublication,autonomousRecoveryPolicy,receiptBlock} from "./exception-recovery-autonomous.mjs";
import {verifyAuthenticatedYouTubeReceipt,verifyAuthenticatedInstagramReceipt} from "./exception-recovery-authenticated-receipt.mjs";
import {normalizeRecoveryHistory,recoveryAuditFields} from "./exception-recovery-history.mjs";
import {homeApprovedExceptionKind} from "./profile-summary-classification.mjs";
import {approvedPastDueFormula} from "./approved-past-due-quality.mjs";
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
  assert.equal(result.completion_kind,"public_publication_verified");
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
  
  ["conflicting URL",{Manual_Published_URL:"https://www.youtube.com/watch?v=abcdefghijk"}],
  ["conflicting ID",{Platform_Post_ID:"abcdefghijk"}],["conflicting time",{Published_At:"2026-10-23T14:00:00Z"}],
  ["wrong provider",{Platform:"Instagram"}],
]) test(name+" blocks without status mutation",async()=>{
  const f=fixture();Object.assign(f.row.fields,change);
  const result=await reconcilePublication(f.deps);assert.notEqual(result.outcome,"Corrected");assert.equal(f.writes,0);
});
for(const [name,change] of [
  ["wrong identity",{remote_id:"abcdefghijk"}],["wrong profile",{profile_id:"recCCCCCCCCCCCCCC"}],
  ["no ownership",{ownership_verified:false}],
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
test("exact privately uploaded YouTube video counts as Studio delivery, never as public publication",async()=>{
  const f=fixture();
  f.receipt.verified_public=false;
  f.receipt.published_at=null;
  f.receipt.summary={privacy_status:"private",upload_status:"processed"};
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Corrected");
  assert.equal(f.writes,1);
  assert.equal(f.row.fields.Output_Status,"Awaiting Public Release");
  assert.equal(f.row.fields.Publish_Status,"Published Privately");
  assert.equal(f.row.fields.YouTube_Stage,"Complete");
  assert.equal(f.row.fields.Published_At,undefined);
  assert.equal(f.state.terminal,true);
  assert.equal(f.audits[0].provider_visibility,"private");
});
test("an authenticated scheduled private YouTube upload completes Studio without changing its schedule",async()=>{
  const f=fixture();
  f.row.fields.YouTube_Scheduled_Publish_At="2026-11-01T14:00:00Z";
  f.row.fields.YouTube_Privacy_Status="private";
  f.row.fields.YouTube_Upload_Status="Uploaded";
  f.receipt.verified_public=false;
  f.receipt.published_at=null;
  f.receipt.scheduled_at="2026-11-01T14:00:00Z";
  f.receipt.summary={privacy_status:"private",upload_status:"processed"};
  const output=await reconcilePublication(f.deps);
  assert.equal(output.outcome,"Corrected");
  assert.equal(f.row.fields.YouTube_Scheduled_Publish_At,"2026-11-01T14:00:00Z");
  assert.equal(f.row.fields.YouTube_Privacy_Status,"private");
  assert.equal(f.row.fields.Output_Status,"Awaiting Public Release");
  assert.equal(f.row.fields.Publish_Status,"Published Privately");
  assert.equal(f.row.fields.Published_At,undefined);
  assert.equal(f.writes,1);
});
test("privacy or scheduled date changed during provider read blocks any status correction",async()=>{
  for(const [field,change] of [["YouTube_Privacy_Status","private"],["YouTube_Scheduled_Publish_At","2026-11-01T14:00:00Z"]]){
    const f=fixture();
    f.deps.verifyRemote=async()=>{f.row.fields[field]=change;return f.receipt;};
    const output=await reconcilePublication(f.deps);
    assert.equal(output.outcome,"Blocked");
    assert.equal(f.writes,0);
  }
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
  assert.equal(p.requests.length,2);assert.ok(p.requests.every(r=>r.options.method==="GET"&&r.options.redirect==="manual"));
  assert.ok(!JSON.stringify(r).includes("test-secret"));
});
test("a formerly scheduled video that is now public does not require obsolete publishAt",async()=>{
  const p=providerFixture();
  p.f.row.fields.YouTube_Scheduled_Publish_At="2026-10-23T12:30:00Z";
  const receipt=await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options);
  assert.equal(receipt.verified_public,true);
  assert.equal(receipt.scheduled_at,null);
  assert.equal(receiptBlock(p.f.row,receipt,instant),null);
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

test("authenticated uploader returns sanitized transport diagnostics and never follows redirects",async()=>{
  for(const [name,fetcher,expected] of [
    ["oauth rejection",async()=>({ok:false,status:401}),
      {stage:"oauth_status",category:"http_rejected",http_status:401,redirect:false}],
    ["redirect",async()=>({ok:false,status:302,headers:{get:()=>"/login"}}),
      {stage:"oauth_status",category:"redirect_rejected",http_status:302,redirect:true}],
    ["network",async()=>{throw new TypeError("secret: network details");},
      {stage:"oauth_status",category:"network_or_transport_error",http_status:null,redirect:false}],
    ["timeout",async()=>{throw Object.assign(new Error("secret: timed out"),{name:"TimeoutError"});},
      {stage:"oauth_status",category:"timeout",http_status:null,redirect:false}],
    ["malformed JSON",async()=>({ok:true,status:200,json:async()=>{throw Error("secret: HTML");}}),
      {stage:"oauth_status",category:"invalid_json",http_status:200,redirect:false}],
    ["malformed body",async()=>({ok:true,status:200,json:async()=>({})}),
      {stage:"oauth_status",category:"invalid_response_shape",http_status:null,redirect:false}],
  ]) {
    const p=providerFixture();p.options.fetcher=fetcher;
    const result=await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options);
    assert.equal(result.evidence,"authenticated_provider_unavailable",name);
    assert.deepEqual(result.provider_diagnostic,expected,name);
    assert.equal(result.ownership_verified,false);
    assert.ok(!JSON.stringify(result).includes("secret"),name);
    assert.ok(!JSON.stringify(result).includes("/login"),name);
  }
  const p=providerFixture();
  p.options.fetcher=async(url)=>url.endsWith("/oauth/status")
    ?{ok:true,status:200,json:async()=>({refresh_ok:true,channel_identity_ok:true,channel_id:channel})}
    :{ok:false,status:503};
  const video=await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options);
  assert.deepEqual(video.provider_diagnostic,
    {stage:"video_details",category:"http_rejected",http_status:503,redirect:false});
});
test("missing saved public URL is repaired from authenticated public receipt, without a second upload",async()=>{
  const f=fixture();delete f.row.fields.Platform_Post_URL;
  const done=await reconcilePublication(f.deps);
  assert.equal(done.outcome,"Corrected");assert.equal(f.writes,1);
  assert.equal(f.row.fields.Platform_Post_URL,"https://www.youtube.com/watch?v="+video);
  assert.equal(f.row.fields.Published_At,f.receipt.published_at);
});
test("private processed delivery with no public URL closes Studio handoff, never fabricates publication",async()=>{
  const f=fixture();delete f.row.fields.Platform_Post_URL;
  f.receipt.verified_public=false;f.receipt.published_at=null;
  f.receipt.summary={privacy_status:"private",upload_status:"processed"};
  const done=await reconcilePublication(f.deps);
  assert.equal(done.outcome,"Corrected");
  assert.equal(done.completion_kind,"studio_delivery_completed");
  assert.equal(done.provider_visibility,"private");
  assert.equal(f.row.fields.Output_Status,"Awaiting Public Release");
  assert.equal(f.row.fields.Publish_Status,"Published Privately");
  assert.equal(f.row.fields.YouTube_Stage,"Complete");
  assert.equal(f.row.fields.Published_At,undefined);
  assert.equal(f.row.fields.Platform_Post_URL,undefined);
  assert.equal(f.row.fields.Publish_Retry_Eligible,false);
  assert.equal(f.writes,1);
  assert.equal((await reconcilePublication(f.deps)).outcome,"Already Reconciled");
});
test("provider scheduled handoff mismatch blocks automatic correction",async()=>{
  const f=fixture();
  f.row.fields.YouTube_Scheduled_Publish_At="2026-11-01T14:00:00Z";
  f.receipt.verified_public=false;f.receipt.published_at=null;
  f.receipt.scheduled_at="2026-11-02T14:00:00Z";
  assert.equal((await reconcilePublication(f.deps)).reason,"scheduled_handoff_mismatch");
  assert.equal(f.writes,0);
});
test("authenticated YouTube provider reports true privacy mode and rejects mismatched schedule",async()=>{
  const p=providerFixture({status:{privacyStatus:"private",uploadStatus:"processed",publishAt:"2026-11-01T14:00:00Z"}});
  p.f.row.fields.YouTube_Scheduled_Publish_At="2026-11-01T14:00:00Z";
  const receipt=await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options);
  assert.equal(receipt.verified_delivery,true);
  assert.equal(receipt.verified_public,false);
  assert.equal(receipt.summary.privacy_status,"private");
  assert.equal(receipt.scheduled_at,"2026-11-01T14:00:00Z");
  p.f.row.fields.YouTube_Scheduled_Publish_At="2026-11-03T14:00:00Z";
  const mismatch=await verifyAuthenticatedYouTubeReceipt(p.f.row,p.options);
  assert.equal(mismatch.verified_delivery,undefined);
  assert.equal(mismatch.evidence,"scheduled_handoff_mismatch");
});

test("existing publisher retry ceiling and cooldown do not block authenticated STATUS-only reconciliation",async()=>{
 const f=fixture();
 f.row.fields.Publish_Attempt_Count=9;
 f.row.fields.Studio_Publish_Dispatch_Count=9;
 f.row.fields.Publish_Next_Retry_At=new Date(instant+60_000).toISOString();
 const result=await reconcilePublication(f.deps);
 assert.equal(result.outcome,"Corrected");
 assert.equal(f.row.fields.Publish_Attempt_Count,9);
 assert.equal(f.row.fields.Studio_Publish_Dispatch_Count,9);
 assert.equal(f.row.fields.Publish_Next_Retry_At,null);
 assert.equal(f.writes,1);
});
test("Airtable omitting cleared null and unchecked checkbox fields still counts as authoritative readback",async()=>{
 const f=fixture();
 f.deps.patchStatus=async(_,fields)=>{
   Object.assign(f.row.fields,fields);
   for(const key of ["Publish_Next_Retry_At","Publish_Retry_Eligible"])
     if(f.row.fields[key]===null||f.row.fields[key]===false)delete f.row.fields[key];
 };
 const output=await reconcilePublication(f.deps);
 assert.equal(output.outcome,"Corrected");
 assert.equal(f.state.terminal,true);
});

test("verified private handoff disappears from Home and QA overdue without claiming public release",async()=>{
 const f=fixture();f.receipt.verified_public=false;f.receipt.published_at=null;
 f.receipt.summary={privacy_status:"private",upload_status:"processed"};
 const result=await reconcilePublication(f.deps);
 assert.equal(result.outcome,"Corrected");
 assert.equal(f.row.fields.Published_At,undefined);
 const mapped={platform:"YouTube",review_status:"Approved",studio_state:"Awaiting Public Release",
   output_status:f.row.fields.Output_Status,publish_status:f.row.fields.Publish_Status,
   scheduled_post_date:f.row.fields.Scheduled_Post_Date,do_not_publish:false};
 assert.equal(homeApprovedExceptionKind(mapped,instant),"");
 const formula=approvedPastDueFormula(instant);
 assert.match(formula,/\{Publish_Status\}!="Published Privately"/);
});
test("cooldown does not authorize repair without fresh authenticated provider identity",async()=>{
  const f=fixture();
  f.row.fields.Publish_Next_Retry_At=new Date(instant+60000).toISOString();
  f.receipt.ownership_verified=false;
  const result=await reconcilePublication(f.deps);
  assert.notEqual(result.outcome,"Corrected");
  assert.equal(f.writes,0);
});


test("live canary: successful PATCH plus lost first readback automatically finalizes despite unrelated poller progress",async()=>{
  const f=fixture(),originalRead=f.deps.readOutput;let reads=0;
  f.deps.readOutput=async()=>{if(++reads===4)throw new Error("Airtable readback timeout");return originalRead();};
  const first=await reconcilePublication(f.deps);
  assert.equal(first.reason,"status_write_or_audit_uncertain");
  assert.equal(f.writes,1);assert.ok(f.state.pending);
  f.row.fields.YouTube_Stage="Complete";
  f.row.fields.YouTube_Processing_Status="Succeeded";
  f.deps.readOutput=originalRead;
  const next=await reconcilePublication(f.deps);
  assert.equal(next.outcome,"Corrected");
  assert.equal(next.reason,"authoritative_readback_after_uncertain_write");
  assert.equal(next.completion_kind,"public_publication_verified");
  assert.equal(f.writes,1);
  assert.equal(f.state.pending,null);assert.equal(f.state.terminal,true);
  assert.equal(f.audits.filter(x=>x.outcome==="Corrected").length,1);
});
test("uncertain write with changed immutable YouTube video identity cannot be silently finalized or patched again",async()=>{
  const f=fixture(),originalRead=f.deps.readOutput;let reads=0;
  f.deps.readOutput=async()=>{if(++reads===4)throw new Error("lost readback");return originalRead();};
  assert.equal((await reconcilePublication(f.deps)).outcome,"Awaiting Verification");
  assert.equal(f.writes,1);
  f.row.fields.YouTube_Video_ID="abcdefghijk";
  f.deps.readOutput=originalRead;
  const later=await reconcilePublication(f.deps);
  assert.equal(later.outcome,"Needs Decision");
  assert.equal(later.reason,"uncertain_write_requires_review");
  assert.equal(f.writes,1);
});


test("uncertain canary with omitted unchecked Airtable checkbox finalizes on next readback, without another PATCH",async()=>{
  const f=fixture(),originalRead=f.deps.readOutput,originalPatch=f.deps.patchStatus;
  let reads=0;
  f.deps.patchStatus=async(...args)=>{
    await originalPatch(...args);
    delete f.row.fields.Publish_Retry_Eligible;
    delete f.row.fields.Publish_Next_Retry_At;
  };
  f.deps.readOutput=async()=>{
    if(++reads===4)throw new Error("Airtable readback timeout");
    return originalRead();
  };
  const first=await reconcilePublication(f.deps);
  assert.equal(first.reason,"status_write_or_audit_uncertain");
  assert.equal(f.writes,1);
  assert.ok(f.state.pending);
  f.deps.readOutput=originalRead;
  const next=await reconcilePublication(f.deps);
  assert.equal(next.outcome,"Corrected");
  assert.equal(next.reason,"authoritative_readback_after_uncertain_write");
  assert.equal(f.writes,1);
  assert.equal(f.state.pending,null);
  assert.equal(f.state.terminal,true);
  assert.equal(f.audits.filter(x=>x.outcome==="Corrected").length,1);
});


test("exact account-owned Instagram carousel recovers without any remote publish request",async()=>{
  const f=fixture(),post="18041644475837071";
  Object.assign(f.row.fields,{Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",
    Platform_Post_ID:post,Platform_Media_ID:post,IG_Carousel_Published_Media_ID:post,
    IG_Carousel_Published_At:"2026-10-23T10:51:04Z"});
  delete f.row.fields.YouTube_Video_ID;delete f.row.fields.Platform_Post_URL;
  Object.assign(f.receipt,{platform:"Instagram",remote_id:post,account_id:"17841400000000000",
    permalink:"https://www.instagram.com/p/ABCxyz123/",
    published_at:"2026-10-23T10:51:04.000Z",verified_public:true});
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Corrected");
  assert.equal(result.completion_kind,"public_publication_verified");
  assert.equal(f.row.fields.Platform_Post_URL,f.receipt.permalink);
  assert.equal(f.row.fields.Published_At,f.receipt.published_at);
  assert.equal(f.row.fields.IG_Carousel_Published_Media_ID,post);
  assert.equal(f.writes,1);
  assert.equal((await reconcilePublication(f.deps)).outcome,"Already Reconciled");
});
test("Instagram account-owned published receipt allows bounded Airtable completion latency only",()=>{
  const nowMs=Date.parse("2026-11-05T01:00:00Z");
  const post="18168690085479740";
  const publishedAt="2026-10-24T12:42:20.000Z";
  const basePublished=Date.parse(publishedAt);
  const permalink="https://www.instagram.com/reel/De4KD9XDWRQ/";
  const fields={
    Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
    Content_Profile:["recBBBBBBBBBBBBBB"],Platform_Post_ID:post,
    Platform_Post_URL:permalink,
  };
  const receipt={
    platform:"Instagram",remote_id:post,permalink,
    profile_id:"recBBBBBBBBBBBBBB",verified_public:true,
    ownership_verified:true,verified_delivery:true,
    checked_at:new Date(nowMs-1000).toISOString(),published_at:publishedAt,
  };
  for(const lag of [0,8000,120000]) {
    const row={fields:{...fields,Published_At:new Date(basePublished+lag).toISOString()}};
    assert.equal(receiptBlock(row,receipt,nowMs),null, "bounded lag "+lag);
  }
  for(const lag of [-1000,120001,600000]) {
    const row={fields:{...fields,Published_At:new Date(basePublished+lag).toISOString()}};
    assert.equal(receiptBlock(row,receipt,nowMs),"conflicting_publication_timestamp");
  }
  assert.equal(receiptBlock({fields:{...fields,Published_At:"not-a-date"}},receipt,nowMs),
    "conflicting_publication_timestamp");
  assert.notEqual(receiptBlock({fields:{...fields,Published_At:new Date(basePublished+8000).toISOString()}},
    {...receipt,ownership_verified:false},nowMs),null);
  assert.notEqual(receiptBlock({fields:{...fields,Published_At:new Date(basePublished+8000).toISOString(),
    Platform_Post_ID:"18168690085479741"}},receipt,nowMs),null);
});
test("YouTube saved publication timestamps remain exact despite Instagram latency allowance",()=>{
  const nowMs=Date.parse("2026-11-05T01:00:00Z");
  const id="hc1heQnfn6k",publishedAt="2026-10-24T12:42:20Z";
  const receipt={platform:"YouTube",profile_id:"recBBBBBBBBBBBBBB",remote_id:id,
    verified_delivery:true,verified_public:true,ownership_verified:true,
    permalink:"https://www.youtube.com/watch?v="+id,
    published_at:publishedAt,checked_at:new Date(nowMs-1000).toISOString()};
  const fields={Platform:"YouTube",Content_Profile:["recBBBBBBBBBBBBBB"],
    YouTube_Video_ID:id,Platform_Post_URL:"https://www.youtube.com/watch?v="+id};
  assert.equal(receiptBlock({fields:{...fields,Published_At:publishedAt}},receipt,nowMs),null);
  assert.equal(receiptBlock({fields:{...fields,Published_At:"2026-10-24T12:42:28Z"}},receipt,nowMs),
    "conflicting_publication_timestamp");
});

test("Instagram containers, stories and mismatched published IDs never authorize a correction",async()=>{
  for(const mutation of [
    f=>{f.row.fields.Platform_Post_ID="";f.row.fields.IG_Carousel_Published_Media_ID="";},
    f=>{f.row.fields.Platform_Output_Type="Instagram Story";},
    f=>{f.row.fields.IG_Carousel_Published_Media_ID="18041644475837072";},
  ]) {
    const f=fixture(),post="18041644475837071";
    Object.assign(f.row.fields,{Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",
      Platform_Post_ID:post,IG_Carousel_Published_Media_ID:post});
    delete f.row.fields.Platform_Post_URL;delete f.row.fields.YouTube_Video_ID;
    Object.assign(f.receipt,{platform:"Instagram",remote_id:post,permalink:"https://www.instagram.com/p/ABC123/",
      verified_public:true,published_at:"2026-10-23T10:51:04Z"});
    mutation(f);
    assert.notEqual((await reconcilePublication(f.deps)).outcome,"Corrected");
    assert.equal(f.writes,0);
  }
});
test("authenticated Instagram verifier requires exact account-feed membership, owner and timestamp",async()=>{
  const post="18041644475837071",account="17841400000000000",profile="recBBBBBBBBBBBBBB",queries=[];
  const row={fields:{Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",
    Content_Profile:[profile],Platform_Post_ID:post,IG_Carousel_Published_Media_ID:post}};
  const settings={META_GRAPH_API_ACCESS_TOKEN:"test-secret",META_GRAPH_API_VERSION:"v26.0"};
  const fetcher=async(url,opt)=>{
    queries.push({url,opt});
    assert.equal(opt.method,"GET");
    assert.equal(opt.redirect,"manual");
    assert.equal(opt.headers.Authorization,"Bearer test-secret");
    assert.equal(new URL(url).pathname,"/v26.0/"+account+"/media");
    return {ok:true,status:200,json:async()=>({data:[{id:post,permalink:"https://www.instagram.com/p/ABC123/",
      timestamp:"2026-10-23T10:51:04+0000",media_type:"CAROUSEL_ALBUM"}]})};
  };
  const time=()=>Date.parse("2026-10-24T12:00:00Z");
  const verified=await verifyAuthenticatedInstagramReceipt(row,{settings,expectedAccountId:account,fetcher,now:time});
  assert.equal(verified.ownership_verified,true);
  assert.equal(verified.verified_public,true);
  assert.equal(verified.remote_id,post);
  assert.equal(verified.profile_id,profile);
  assert.equal(queries.length,1);
  assert.equal(queries[0].url.includes("test-secret"),false);
  const absent=await verifyAuthenticatedInstagramReceipt(row,{settings,expectedAccountId:account,now:time,
    fetcher:async()=>({ok:true,status:200,json:async()=>({data:[{id:"999999999999999"}]})})});
  assert.equal(absent.ownership_verified,false);
  const noToken=await verifyAuthenticatedInstagramReceipt(row,{settings:{},expectedAccountId:account,now:time,
    fetcher:async()=>{throw Error("should not call provider");}});
  assert.equal(noToken.verified_public,false);
  const wrongPermalink=await verifyAuthenticatedInstagramReceipt(row,{settings,expectedAccountId:account,now:time,
    fetcher:async()=>({ok:true,status:200,json:async()=>({data:[{id:post,
      permalink:"https://www.instagram.com/not-a-post",timestamp:"2026-10-23T10:51:04+0000"}]})})});
  assert.equal(wrongPermalink.verified_public,false);
});


test("legacy missing Chicago channel configuration is reprobed once after repair, then corrected",async()=>{
  const f=fixture();
  const old={terminal:true,attempts:1,next_at:instant+3600000,
    pending:null,last:{outcome:"Needs Decision",reason:"expected_profile_channel_not_configured"}};
  f.deps.readState=async()=>structuredClone(old);
  let saved=null;
  f.deps.saveState=async(_,state)=>{saved=structuredClone(state);};
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Corrected");
  assert.equal(f.writes,1);
  assert.equal(saved.terminal,true);
  assert.equal(saved.last.reason,"authoritative_airtable_readback_confirmed");
});
test("unfixed channel configuration backs off instead of requiring administrator decisions",async()=>{
  const f=fixture();
  f.deps.verifyRemote=async()=>({platform:"YouTube",verified_public:false,verified_delivery:false,
    ownership_verified:false,evidence:"expected_profile_channel_not_configured"});
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Awaiting Verification");
  assert.equal(result.reason,"expected_profile_channel_not_configured");
  assert.equal(f.state.terminal,false);
  assert.equal(f.writes,0);
  assert.equal((await reconcilePublication(f.deps)).skipped,true);
});
test("known remote identity or ownership conflicts remain terminal and cannot auto-reprobe",async()=>{
  const f=fixture();
  const prior={terminal:true,attempts:1,next_at:instant+3600000,
    pending:null,last:{outcome:"Needs Decision",reason:"remote_identity_mismatch"}};
  f.deps.readState=async()=>prior;
  f.deps.verifyRemote=async()=>{throw new Error("must not probe terminal identity conflict");};
  const result=await reconcilePublication(f.deps);
  assert.equal(result.skipped,true);
  assert.equal(f.writes,0);
});

test("same remote YouTube upload is reprobed after processing cooldown; no republish or premature Published state",async()=>{
  const f=fixture();
  f.receipt.verified_delivery=false;f.receipt.verified_public=false;
  f.receipt.ownership_verified=false;f.receipt.evidence="upload_not_processed";
  const first=await reconcilePublication(f.deps);
  assert.equal(first.outcome,"Awaiting Verification");
  assert.equal(first.reason,"upload_not_processed");
  assert.equal(f.state.terminal,false);
  assert.equal(f.writes,0);
  assert.equal((await reconcilePublication(f.deps)).skipped,true);
  const old={terminal:true,attempts:1,next_at:instant+3600000,
    pending:null,last:{outcome:"Needs Decision",reason:"upload_not_processed"}};
  let clock=instant;f.deps.now=()=>clock;
  f.deps.readState=async()=>structuredClone(old);
  f.deps.saveState=async(_,newState)=>{Object.assign(old,structuredClone(newState));};
  f.deps.verifyRemote=async()=>{throw Error("cooldown must prevent provider poll");};
  assert.equal((await reconcilePublication(f.deps)).skipped,true);
  clock+=3600001;
  f.deps.verifyRemote=async()=>({
    ...structuredClone(f.receipt),
    verified_delivery:true,verified_public:true,ownership_verified:true,
    checked_at:new Date(clock).toISOString(),evidence:"oauth_owned_channel_exact_public_processed_video"
  });
  const corrected=await reconcilePublication(f.deps);
  assert.equal(corrected.outcome,"Corrected");
  assert.equal(f.writes,1);
  assert.equal(old.terminal,true);
  assert.equal(old.last.reason,"authoritative_airtable_readback_confirmed");
});
test("processing reprobe respects attempts ceiling and never overrides identity conflicts",async()=>{
  for(const reason of ["upload_not_processed","remote_identity_mismatch"]){
   const f=fixture();
   const old={terminal:true,attempts:5,next_at:instant-1,pending:null,last:{outcome:"Needs Decision",reason}};
   f.deps.readState=async()=>structuredClone(old);
   f.deps.verifyRemote=async()=>{throw Error("terminal/limit state must never hit provider");};
   assert.equal((await reconcilePublication(f.deps)).skipped,true);
   assert.equal(f.writes,0);
  }
});

test("Stage 3: completed private YouTube handoff receives one provider-proven public status catch-up", async()=>{
  const f=fixture(),captured=[];
  Object.assign(f.row.fields,{
    Output_ID:9277,Output_Status:"Awaiting Public Release",
    Publish_Status:"Published Privately",YouTube_Scheduled_Publish_At:"2026-10-23T12:00:00Z",
    YouTube_Stage:"Complete",Publish_Next_Retry_At:"2026-10-23T10:00:00Z",
    Publish_Attempt_Count:3,Studio_Publish_Dispatch_Count:3,
  });
  delete f.row.fields.Platform_Post_URL;
  let previous={terminal:true,attempts:1,next_at:instant-1,pending:null,last:{
    outcome:"Corrected",completion_kind:"studio_delivery_completed"
  }};
  f.deps.readState=async()=>structuredClone(previous);
  f.deps.saveState=async(_,value)=>{previous=structuredClone(value);};
  const originalPatch=f.deps.patchStatus;
  f.deps.patchStatus=async(row,fields)=>{captured.push({...fields});await originalPatch(row,fields);};
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Corrected");
  assert.equal(result.completion_kind,"public_publication_verified");
  assert.equal(f.writes,1);
  assert.deepEqual(Object.keys(captured[0]).sort(),
    ["Output_Status","Publish_Status","Published_At","Platform_Post_URL"].sort());
  assert.equal(f.row.fields.Output_Status,"Published");
  assert.equal(f.row.fields.Publish_Status,"Published");
  assert.equal(f.row.fields.Published_At,f.receipt.published_at);
  assert.equal(f.row.fields.Platform_Post_URL,f.receipt.permalink);
  assert.equal(f.row.fields.Publish_Attempt_Count,3);
  assert.equal(f.row.fields.Studio_Publish_Dispatch_Count,3);
  assert.equal(f.row.fields.Publish_Next_Retry_At,"2026-10-23T10:00:00Z");
  assert.equal(previous.last.outcome,"Corrected");
  assert.equal(f.audits[0].phase,"intent");
  assert.equal(f.audits[1].phase,"outcome");
  assert.equal((await reconcilePublication(f.deps)).outcome,"Already Reconciled");
  assert.equal(f.writes,1);
});
test("Stage 3: still-private provider stays Published Privately and backs off without patching",async()=>{
  const f=fixture();
  Object.assign(f.row.fields,{
    Output_Status:"Awaiting Public Release",Publish_Status:"Published Privately",
    YouTube_Scheduled_Publish_At:"2026-10-23T12:00:00Z",
  });
  delete f.row.fields.Platform_Post_URL;
  Object.assign(f.receipt,{
    verified_public:false,published_at:null,scheduled_at:"2026-10-23T12:00:00Z",
    summary:{privacy_status:"private",upload_status:"processed"}
  });
  const result=await reconcilePublication(f.deps);
  assert.equal(result.outcome,"Awaiting Verification");
  assert.equal(result.reason,"public_release_not_yet_verified");
  assert.equal(f.row.fields.Publish_Status,"Published Privately");
  assert.equal(f.row.fields.Published_At,undefined);
  assert.equal(f.writes,0);
  assert.equal(f.state.terminal,false);
  assert.equal((await reconcilePublication(f.deps)).skipped,true);
});
test("Stage 3: future private release remains completed Studio delivery and is not polled",async()=>{
  const f=fixture();
  Object.assign(f.row.fields,{
    Output_Status:"Awaiting Public Release",Publish_Status:"Published Privately",
    YouTube_Scheduled_Publish_At:"2026-10-25T12:00:00Z",
    Scheduled_Post_Date:"2026-10-25T12:00:00Z"
  });
  f.deps.verifyRemote=async()=>{throw new Error("no provider call before scheduled release");};
  assert.equal((await reconcilePublication(f.deps)).outcome,"Already Reconciled");
  assert.equal(f.writes,0);
});
test("Stage 3: conflicting scheduled clocks or hold cannot reopen private handoff",async()=>{
  for(const fields of [
    {YouTube_Scheduled_Publish_At:"2026-10-23T13:00:00Z"},
    {Do_Not_Publish:true}, {Review_Status:"Rejected"}, {Test_Run_ID:"synthetic"},
  ]){
    const f=fixture();
    Object.assign(f.row.fields,{
      Output_Status:"Awaiting Public Release",Publish_Status:"Published Privately",
      YouTube_Scheduled_Publish_At:"2026-10-23T12:00:00Z",...fields
    });
    f.deps.verifyRemote=async()=>{throw new Error("not a public catch-up candidate");};
    assert.equal((await reconcilePublication(f.deps)).outcome,"Already Reconciled");
    assert.equal(f.writes,0);
  }
});
test("Stage 3: terminal identity conflict, exhausted ceiling and stale provider evidence never bypass safety",async()=>{
  for(const variant of ["terminal_identity_conflict","attempt_limit","stale_receipt","active_lock"]){
    const f=fixture();
    Object.assign(f.row.fields,{
      Output_Status:"Awaiting Public Release",Publish_Status:"Published Privately",
      YouTube_Scheduled_Publish_At:"2026-10-23T12:00:00Z"
    });
    delete f.row.fields.Platform_Post_URL;
    if(variant==="terminal_identity_conflict"){
      f.deps.readState=async()=>({terminal:true,attempts:1,next_at:instant-1,pending:null,
        last:{outcome:"Needs Decision",reason:"remote_identity_mismatch"}});
    }else if(variant==="attempt_limit"){
      f.deps.readState=async()=>({terminal:true,attempts:5,next_at:instant-1,pending:null,
        last:{outcome:"Corrected",completion_kind:"studio_delivery_completed"}});
    }else if(variant==="stale_receipt"){
      f.receipt.checked_at=new Date(instant-120000).toISOString();
    }else {
      f.row.fields.Publish_Locked_By="publisher";
      f.row.fields.Publish_Locked_At=new Date(instant).toISOString();
    }
    const result=await reconcilePublication(f.deps);
    assert.notEqual(result.outcome,"Corrected",variant);
    assert.equal(f.writes,0,variant);
  }
});
test("Stage 3: lost readback after private-to-public PATCH cannot cause second PATCH",async()=>{
  const f=fixture(),read=f.deps.readOutput;
  Object.assign(f.row.fields,{
    Output_Status:"Awaiting Public Release",Publish_Status:"Published Privately",
    YouTube_Scheduled_Publish_At:"2026-10-23T12:00:00Z"
  });
  delete f.row.fields.Platform_Post_URL;
  let count=0;f.deps.readOutput=async()=>{if(++count===4)throw Error("readback lost");return read();};
  const first=await reconcilePublication(f.deps);
  assert.equal(first.reason,"status_write_or_audit_uncertain");
  assert.equal(f.writes,1);
  assert.ok(f.state.pending);
  f.deps.readOutput=read;
  const second=await reconcilePublication(f.deps);
  assert.equal(second.reason,"authoritative_readback_after_uncertain_write");
  assert.equal(second.outcome,"Corrected");
  assert.equal(f.writes,1);
});
