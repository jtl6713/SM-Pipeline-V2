/**
 * Actual HTTPS acceptance against the isolated deployed Cloudflare Worker and
 * real writable staging Airtable. All test output records are temporary.
 * Cloudflare Workers handle canonical POST/status; Airtable API seeds/verifies.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { maeIsBlackoutLocalTime, maeIsPriorityLocalTime } from "./mae-schedule.mjs";

const BASE = "appJ0ox62OMfZuE1v";
const PROFILE = "rect1wQB9BeUSEimn";
const CONTENT = "recd6FckgjjFxMQTo";
const CONTENTS = "tblszaHkgn51wajDV";
const OUTPUTS = "tbl5sA6Mwiz9pGNOi";
const PROFILES = "tbllz6Y0mvMTgPYup";
const TOKEN = process.env.STAGING_AIRTABLE_API_TOKEN;
const AUTH = process.env.STAGING_TEST_AUTH;
const WORKER = String(process.env.STAGING_WORKER_URL || "").replace(/\/$/,"");
assert.ok(TOKEN?.startsWith("pat"),"Staging-only Airtable token not provided");
assert.ok(AUTH?.length>=24,"Ephemeral staging HTTP test authorization missing");
assert.match(WORKER,/^https:\/\/sm-pipeline-v2-factory-approval-staging\.[a-z0-9-]+\.workers\.dev$/);
const requestId = "factory_stage_http_" + Date.now().toString(36) + crypto.randomBytes(8).toString("hex");
fs.writeFileSync("/tmp/factory-stage-requestid.txt",requestId);
let createdIds = [];
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function jsonFetch(url,init={}) {
  const res=await fetch(url,{...init,signal:AbortSignal.timeout(30000)});
  const data=await res.json().catch(()=>({}));
  return {status:res.status,data};
}
async function airtable(method,table,id="",payload=null) {
  assert.ok([CONTENTS,OUTPUTS,PROFILES].includes(table),"Only staging tables allowed");
  assert.ok(!id||/^rec[A-Za-z0-9]+$/.test(id));
  const url="https://api.airtable.com/v0/"+BASE+"/"+table+(id?"/"+id:"");
  for(let attempt=0;attempt<8;attempt++){
    const {status,data}=await jsonFetch(url,{method,
      headers:{"Authorization":"Bearer "+TOKEN,...(payload?{"Content-Type":"application/json"}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    if(status===429||status>=500){
      if(attempt===7)throw Error("Staging Airtable HTTP "+status);
      await delay(Math.min(7000,400*2**attempt));continue;
    }
    if(status<200||status>=300)
      throw Error("Staging Airtable HTTP "+status+" "+JSON.stringify(data.error||{}).slice(0,250));
    return data;
  }
}
async function stage(method,path,payload=null,withAuth=true) {
  return jsonFetch(WORKER+path,{
    method,
    headers:{...(withAuth?{"Authorization":"Bearer "+AUTH}:{}),
      ...(payload?{"Content-Type":"application/json"}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
}
const platforms=[
  ["Instagram","Reel"],["Facebook","Reel"],
  ["YouTube","Short"],["TikTok","Video Draft"],["Instagram","Reel"],
];
try{
  const profile=await airtable("GET",PROFILES,PROFILE);
  assert.match(profile.fields.Profile_Name,/^STAGING ONLY/);
  assert.equal(profile.fields.Timezone,"America/Los_Angeles");
  const content=await airtable("GET",CONTENTS,CONTENT);
  assert.deepEqual(content.fields.Content_Profile,[PROFILE]);

  const unauth=await stage("GET","/api/factory/approval-batches?profile_id="+PROFILE,null,false);
  assert.equal(unauth.status,401,"Staging API must reject unauthenticated clients");
  const health=await stage("GET","/__staging/health");
  assert.equal(health.status,200);
  assert.equal(health.data.staging,true);
  assert.equal(health.data.approvals_enabled,true);
  assert.equal(health.data.airtable_base,BASE);
  assert.equal(health.data.transport,"intercepted");

  const created=await airtable("POST",OUTPUTS,"",{
    records:platforms.map(([platform,format],i)=>({fields:{
      Output_Title:"STAGING ONLY / HTTP "+requestId+"/"+i,
      Content_Item:[CONTENT],Platform:platform,Format:format,
      Studio_Output_Type:format,Output_Status:"Ready for Review",
      Review_Status:"Review Sent",Publish_Status:"Not Ready",
      Render_Status:"Rendered",Do_Not_Publish:i===4,
      Final_File_URL:"https://staging.invalid/"+requestId+"/"+i+".mp4",
    }})),typecast:true
  });
  createdIds=created.records.map(row=>row.id);
  assert.equal(createdIds.length,5);
  // Persist identities immediately so a failed CI step still has cleanup evidence.
  fs.writeFileSync("/tmp/factory-stage-output-ids.json",JSON.stringify(createdIds));

  const invalidProfile=await stage("POST","/api/factory/approval-batches",{
    action:"start",profile_id:"recNotThisStagingProfile",
    request_id:"factory_stage_http_badowner_001",record_ids:[createdIds[0]],
  });
  assert.equal(invalidProfile.status,403);

  const payload={
    action:"start",profile_id:PROFILE,request_id:requestId,
    record_ids:[...createdIds,createdIds[0]],
    items:createdIds.map((id,i)=>({id,platform:platforms[i][0],format:platforms[i][1]})),
    notes:"STAGING ONLY: Worker/R2/Airtable HTTP test. ALL publishing intercepted."
  };
  const submitted=await stage("POST","/api/factory/approval-batches",payload);
  assert.equal(submitted.status,200,JSON.stringify(submitted.data));
  assert.equal(submitted.data.accepted,true);
  assert.equal(submitted.data.total,5,"overlapping selections deduplicated");
  console.log("staging_http_submit=PASS unique_outputs=5");

  // Poll from entirely new HTTPS requests; no browser/client-owned state.
  let status;
  for(let i=0;i<120;i++){
    await delay(i===0?200:1000);
    const response=await stage("GET","/api/factory/approval-batches?profile_id="+PROFILE+
      "&request_id="+requestId);
    assert.equal(response.status,200,JSON.stringify(response.data));
    status=response.data;
    if(status.pending_count===0)break;
  }
  assert.equal(status.total,5);
  assert.equal(status.pending_count,0,JSON.stringify(status));
  assert.equal(status.approved_count,4,JSON.stringify(status));
  assert.equal(status.failed_count,1,JSON.stringify(status));
  assert.equal(status.done_count,5);
  assert.ok(Array.isArray(status.quality_signals));
  const blocked=status.items.find(row=>row.id===createdIds[4]);
  assert.equal(blocked.status,"failed");
  assert.match(blocked.error,/Do_Not_Publish|Cannot approve/i);
  console.log("staging_http_background_r2_status=PASS approved=4 failed=1");

  const times=[];
  for(let i=0;i<4;i++){
    const output=await airtable("GET",OUTPUTS,createdIds[i]);
    assert.equal(output.fields.Review_Status,"Approved");
    assert.equal(output.fields.Output_Status,"Approved for Publishing");
    assert.equal(output.fields.Auto_Publish_Enabled,true);
    const stamp=Date.parse(output.fields.Scheduled_Post_Date||"");
    assert.ok(Number.isFinite(stamp),"MAE scheduled timestamp missing");
    assert.equal(maeIsBlackoutLocalTime(stamp,"America/Los_Angeles"),false);
    assert.equal(maeIsPriorityLocalTime(stamp,"America/Los_Angeles"),true);
    times.push(stamp);
  }
  const held=await airtable("GET",OUTPUTS,createdIds[4]);
  assert.equal(held.fields.Do_Not_Publish,true);
  assert.equal(held.fields.Review_Status,"Review Sent");
  console.log("staging_airtable_real_writes=PASS count=4 blocked=1");

  const duplicate=await stage("POST","/api/factory/approval-batches",payload);
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.already_submitted,true);
  const retry=await stage("POST","/api/factory/approval-batches",{
    action:"retry",profile_id:PROFILE,request_id:requestId,
  });
  assert.equal(retry.status,200,JSON.stringify(retry.data));
  for(let i=0;i<45;i++){
    const response=await stage("GET","/api/factory/approval-batches?profile_id="+PROFILE+
      "&request_id="+requestId);
    status=response.data;
    if(status.pending_count===0)break;
    await delay(1000);
  }
  assert.equal(status.approved_count,4);
  assert.equal(status.failed_count,1);
  for(let i=0;i<4;i++){
    const row=await airtable("GET",OUTPUTS,createdIds[i]);
    assert.equal(Date.parse(row.fields.Scheduled_Post_Date),times[i],
      "Failed-only retry must not reschedule successful outputs");
  }
  console.log("staging_http_idempotence_retry=PASS");
  console.log("FACTORY_DEPLOYED_STAGING_HTTP=PASS 4 Airtable writes, isolated Cloudflare R2, real canonical HTTP handlers, 0 external publishing transports");
}finally{
  let failures=0;
  for(const id of createdIds){
    try{await airtable("DELETE",OUTPUTS,id);}
    catch(e){failures++;console.error("STAGING_OUTPUT_DELETE_FAILED id="+id+" "+String(e.message));}
  }
  if(createdIds.length)console.log("staging_temporary_output_cleanup="+(failures?"FAIL":"PASS")+
    " deleted="+(createdIds.length-failures));
  if(failures)process.exitCode=1;
}
