import test from "node:test";
import assert from "node:assert/strict";
import {
  mutateIgPublishLease,readIgPublishLease,fenceStaleIgPreRemoteLease,
  markIgLeaseRecovered,igPublishLeaseEnabled,IG_LEASE_STALE_MS,
} from "./qa-ig-publish-lease.mjs";

const OUTPUT="rec12345678901234";
const now=Date.parse("2026-11-02T18:00:00Z");
const settings={
  STUDIO_IG_PUBLISH_LEASE_ENABLED:"true",
  STUDIO_IG_PUBLISH_LEASE_EXCLUSIVE_VERIFIED:"true",
};
function fixture(){
  let version=0,store=null;
  const bucket={
    async get(_key) {
      return store ? {
        etag:String(version),
        text:async()=>JSON.stringify(store),
      } : null;
    },
    async put(_key,payload,opts) {
      if(store && opts.onlyIf?.etagMatches!==String(version))return null;
      if(!store && !opts.onlyIf?.get?.("If-None-Match"))return null;
      store=JSON.parse(payload);version++;
      return {etag:String(version)};
    },
  };
  const output={id:OUTPUT,fields:{
    Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
    Output_Status:"Approved for Publishing",Review_Status:"Approved",
    Publish_Method:"Automated",Auto_Publish_Enabled:true,
    Publish_Status:"Ready to Publish",
    Publish_Locked_By:"",Publish_Locked_At:null,
    Last_Publish_Attempt_At:null,
  }};
  const env={...settings,STUDIO_MEDIA:bucket};
  const readOutput=async()=>output;
  return {env,output,readOutput,get lease(){return store;}};
}
function lock(f,stamp="2026-11-02T18:00:00Z"){
  Object.assign(f.output.fields,{
    Publish_Status:"Publishing",
    Publish_Locked_By:"AP1-IG",
    Publish_Locked_At:stamp,Last_Publish_Attempt_At:stamp,
  });
}
test("lease is default-off unless exclusivity is verified",()=>{
  assert.equal(igPublishLeaseEnabled({}),false);
  assert.equal(igPublishLeaseEnabled({STUDIO_IG_PUBLISH_LEASE_ENABLED:"true"}),false);
  assert.equal(igPublishLeaseEnabled(settings),true);
});
test("claim, heartbeat, irreversible intent prohibit expired auto-fence",async()=>{
  const f=fixture();
  const token=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now});
  assert.equal(token.phase,"pre_remote");
  lock(f);
  const heartbeat=await mutateIgPublishLease(f.env,{
    action:"heartbeat",outputId:OUTPUT,attemptId:token.attempt_id,
    generation:token.generation,lockStamp:f.output.fields.Publish_Locked_At,
    readOutput:f.readOutput,nowMs:now+1000,
  });
  assert.equal(heartbeat.phase,"pre_remote");
  const result=await mutateIgPublishLease(f.env,{
    action:"remote_intent",outputId:OUTPUT,attemptId:token.attempt_id,
    generation:token.generation,lockStamp:f.output.fields.Publish_Locked_At,
    readOutput:f.readOutput,nowMs:now+2000,
  });
  assert.equal(result.phase,"remote_intent");
  const fenced=await fenceStaleIgPreRemoteLease(f.env,OUTPUT,{
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+120000,
  });
  assert.equal(fenced.safe,false);
  assert.equal(fenced.reason,"graph_request_may_exist");
  assert.equal(f.lease.irreversible_possible,true);
});
test("only stale pre-remote lease can be CAS-fenced and then rescheduled",async()=>{
  const f=fixture();
  const token=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now});
  lock(f);
  const early=await fenceStaleIgPreRemoteLease(f.env,OUTPUT,{
    readOutput:f.readOutput,nowMs:now+5*60000,
  });
  assert.equal(early.safe,false);
  const fenced=await fenceStaleIgPreRemoteLease(f.env,OUTPUT,{
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+120000,
  });
  assert.equal(fenced.safe,true);
  assert.equal(fenced.generation,token.generation);
  await assert.rejects(mutateIgPublishLease(f.env,{
    action:"remote_intent",outputId:OUTPUT,attemptId:token.attempt_id,
    generation:token.generation,lockStamp:f.output.fields.Publish_Locked_At,
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+121000,
  }),/publisher_fenced_or_lease_changed/);
  Object.assign(f.output.fields,{
    Publish_Status:"Ready to Schedule",Publish_Locked_By:"",
    Publish_Locked_At:null,
    Scheduled_Post_Date:"2026-12-01T16:30:00Z",
  });
  const mark=await markIgLeaseRecovered(f.env,OUTPUT,token.generation,{
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+125000,
  });
  assert.equal(mark.phase,"recovered");
  f.output.fields.Publish_Status="Ready to Publish";
  const next=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+130000,
  });
  assert.equal(next.generation,token.generation+1);
});
test("missing lease and invalid/held output never auto-fence",async()=>{
  const f=fixture();lock(f);
  let result=await fenceStaleIgPreRemoteLease(f.env,OUTPUT,{
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+120000,
  });
  assert.equal(result.safe,false);
  f.output.fields.Publish_Status="Ready to Publish";
  f.output.fields.Publish_Locked_By="";
  f.output.fields.Publish_Locked_At=null;
  const token=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now});
  lock(f);
  f.output.fields.Do_Not_Publish=true;
  result=await fenceStaleIgPreRemoteLease(f.env,OUTPUT,{
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+120000,
  });
  assert.equal(result.safe,false);
  assert.equal(result.reason,"authoritative_publication_state_ambiguous");
});
test("read-only lease inspection does not expose a false configured state",async()=>{
  const f=fixture();
  const state=await readIgPublishLease(f.env,OUTPUT);
  assert.deepEqual(state,{available:true,state:null});
  assert.equal((await readIgPublishLease({},OUTPUT)).available,false);
});

test("runner finish cannot erase a Graph-intent quarantine",async()=>{
  const f=fixture();
  const claim=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now});
  lock(f);
  await mutateIgPublishLease(f.env,{action:"remote_intent",outputId:OUTPUT,
    attemptId:claim.attempt_id,generation:claim.generation,
    lockStamp:"2026-11-02T18:00:00Z",readOutput:f.readOutput,nowMs:now+1000});
  await assert.rejects(mutateIgPublishLease(f.env,{action:"finish",outputId:OUTPUT,
    attemptId:claim.attempt_id,generation:claim.generation,
    lockStamp:"2026-11-02T18:00:00Z",readOutput:f.readOutput,nowMs:now+2000}),
    /irreversible_intent_requires_provider_reconciliation/);
  assert.equal(f.lease.phase,"remote_intent");
});

test("unused pre-lock claim can be reclaimed only after full stale threshold",async()=>{
  const f=fixture();
  const first=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now});
  await assert.rejects(mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now+10*60_000}),/publish_lease_requires_reconciliation/);
  const second=await mutateIgPublishLease(f.env,{action:"claim",outputId:OUTPUT,
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+1000});
  assert.equal(second.generation,first.generation+1);
  assert.notEqual(second.attempt_id,first.attempt_id);
  lock(f);
  await assert.rejects(mutateIgPublishLease(f.env,{action:"remote_intent",
    outputId:OUTPUT,attemptId:first.attempt_id,generation:first.generation,
    lockStamp:"2026-11-02T18:00:00Z",
    readOutput:f.readOutput,nowMs:now+IG_LEASE_STALE_MS+2000}),
    /publisher_fenced_or_lease_changed/);
});
