import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  videoRecoveryFileName, videoRecoveryIdentity,
  selectRecoveredDriveVideo, selectRecoveredMediaAsset,
} from "./story-first-video-recovery.mjs";
import { recoverOriginalStoryVideo } from "./story-first-video-recovery-route.mjs";

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const ID="recJ8E51XIayb6Zy8", PROFILE="recgtK8Z7eNADNtVy";
const RUN="deadbeef-1111-4222-8333-555555555555";
const NAME="New-York-City-Then-and-Now-Scene-4-deadbeef.mp4";
const ORIGINAL_SIZE=12_500;
const recent = minutes => new Date(Date.now()-minutes*60_000).toISOString();
function fixture({
  state="accepting", ageMinutes=90, acceptingAgeMinutes=ageMinutes,
  driveFiles=[], catalog=[], runnerStatus="processing",
  headValid=true, asyncStatus=202, driveReplyStatus=200, driveComplete=true,
}={}) {
  let job={run_id:RUN,idea_id:ID,profile_id:PROFILE,scene_number:4,
    attempt:1,state,approved_at:recent(ageMinutes),scene_visual:"West 28th Street",
    settings:{model_id:"veo-3.1-fast-generate-001",generate_audio:false}};
  let etag=0, uploads=0, driveSearches=0, writes=0, creates=0, selected=null, paid=0, createdFields=null;
  let files=driveFiles, rows=catalog;
  const head={size:ORIGINAL_SIZE,customMetadata:{run_id:RUN,ideaId:ID,profileId:PROFILE,sceneNumber:"4"}};
  const env={PIPELINE_RUNNER_URL:"https://runner.example",PIPELINE_RUNNER_SHARED_SECRET:"test"};
  const context={
    env,ideaId:ID,sceneNumber:4,profileId:PROFILE,profileName:"NYC - New York City",
    title:"New York City: Then and Now",scene:{visual:"West 28th Street",media:"clip"},
    expectedRunId:RUN,audioMixAcknowledged:false,mediaOverride:false,
    jobKey:"key",mediaKey:"mp4",
    readJob:async()=>({job,etag:String(etag),uploaded_at:recent(acceptingAgeMinutes)}),
    writeJob:async(next,expected)=>{if(expected!==String(etag)) throw new HttpError(409,"CAS lost");
      job=next;etag++;writes++;return String(etag);},
    lookupCatalog:async()=>rows,
    createMedia:async fields=>{
      creates++;createdFields=fields;
      rows=[{airtable_record_id:"reca1234567890ab1",media_class:"Video",
        google_drive_file_id: fields["Google Drive File ID"],active:true,do_not_use:false,
        metadata:{studio_transfer_id:"LIB-AIV-"+RUN,content_profile_airtable_id:PROFILE}}];
      return {records:[{id:"reca1234567890ab1"}]};
    },
    saveSelectedScene:async id=>{selected=id;},
    watermarkRequired:false,rightsVerified:true,HttpError,
  };
  env.STUDIO_MEDIA={
    head:async()=>headValid?head:null,
    get:async()=>({size:ORIGINAL_SIZE,arrayBuffer:async()=>new ArrayBuffer(ORIGINAL_SIZE)}),
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{
    const u=String(url);
    if(u.includes("api.elevenlabs.io")){paid++;throw new Error("paid video call prohibited");}
    if(u.includes("/jobs/studio-asset-library/recovery-lookup?")){
      driveSearches++;
      return {ok:driveReplyStatus===200,status:driveReplyStatus,
        json:async()=>({ok:true,complete:driveComplete,files, nextPageToken:null})};
    }
    if(u.endsWith("/jobs/studio-asset-library") && options.method==="POST"){
      uploads++;
      return {ok:asyncStatus===202,status:asyncStatus,
        json:async()=>({job_id:"b".repeat(32)})};
    }
    if(u.includes("/jobs/studio-asset-library/") && options.method==="GET"){
      return {ok:true,status:200,json:async()=>({status:runnerStatus,result:null})};
    }
    throw new Error("Unexpected network request: "+u);
  };
  return {
    context,restore:()=>{globalThis.fetch=originalFetch;},
    stats:()=>({uploads,driveSearches,writes,creates,createdFields,selected,paid,job}),
    setFiles:newFiles=>{files=newFiles;},
    setRows:newRows=>{rows=newRows;},
    setJob:newJob=>{job=newJob;},
  };
}

test("original run and exact filename are deterministic",()=>{
  const job={run_id:RUN,idea_id:ID,profile_id:PROFILE,scene_number:4,attempt:1};
  assert.equal(videoRecoveryIdentity(job,{ideaId:ID,profileId:PROFILE,sceneNumber:4}),true);
  assert.equal(videoRecoveryIdentity(job,{ideaId:ID,profileId:"rec00000000000000",sceneNumber:4}),false);
  assert.equal(videoRecoveryFileName(job,"New York City: Then and Now",4),NAME);
});

test("Drive and catalog duplicates or metadata mismatches fail closed",()=>{
  const file={id:"1aaaaaaaaaaaaaaa",name:NAME,mimeType:"video/mp4",size:String(ORIGINAL_SIZE)};
  assert.equal(selectRecoveredDriveVideo([file,file],NAME,ORIGINAL_SIZE).kind,"ambiguous");
  assert.equal(selectRecoveredDriveVideo([{...file,size:"9999"}],NAME,ORIGINAL_SIZE).kind,"mismatch");
  assert.equal(selectRecoveredDriveVideo([file],NAME,ORIGINAL_SIZE).kind,"found");
  const row={airtable_record_id:"reca1234567890ab1",media_class:"Video",google_drive_file_id:file.id,
    metadata:{studio_transfer_id:"LIB-AIV-"+RUN,content_profile_airtable_id:PROFILE}};
  assert.equal(selectRecoveredMediaAsset([row,row],"LIB-AIV-"+RUN,PROFILE).kind,"ambiguous");
  assert.equal(selectRecoveredMediaAsset([row],"LIB-AIV-"+RUN,"rec00000000000000").kind,"mismatch");
});

test("existing catalog is selected without any Drive request or paid call",async()=>{
  const row={airtable_record_id:"reca1234567890ab1",media_class:"Video",google_drive_file_id:"1aaaaaaaaaaaaaaa",
    metadata:{studio_transfer_id:"LIB-AIV-"+RUN,content_profile_airtable_id:PROFILE}};
  const fx=fixture({catalog:[row]});
  try{
    const result=await recoverOriginalStoryVideo(fx.context);
    assert.equal(result.state,"accepted");
    assert.equal(fx.stats().selected,row.airtable_record_id);
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().driveSearches,0);
    assert.equal(fx.stats().paid,0);
  }finally{fx.restore();}
});

test("existing exact Drive file registers once, then selects without any new upload",async()=>{
  const file={id:"1aaaaaaaaaaaaaaa",name:NAME,mimeType:"video/mp4",size:String(ORIGINAL_SIZE)};
  const fx=fixture({driveFiles:[file]});
  try{
    const result=await recoverOriginalStoryVideo(fx.context);
    assert.equal(result.state,"accepted");
    assert.equal(fx.stats().selected,"reca1234567890ab1");
    assert.equal(fx.stats().creates,1);
    assert.equal(fx.stats().createdFields.Asset_Role,"Raw Footage");
    assert.equal(fx.stats().createdFields.Capture_Source,"AI Generated");
    assert.equal(fx.stats().createdFields.Raw_Source_Eligibility,"Not Applicable");
    assert.equal(fx.stats().createdFields.Rights_Status,"Licensed");
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().paid,0);
  }finally{fx.restore();}
});

test("recent ambiguous registration cannot start a second Drive upload",async()=>{
  const fx=fixture({ageMinutes:2});
  try{
    const result=await recoverOriginalStoryVideo(fx.context);
    assert.equal(result.state,"recovering");
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().paid,0);
  }finally{fx.restore();}
});

test("old paid generation but recent Drive-accept CAS never causes a second upload",async()=>{
  const fx=fixture({ageMinutes:90,acceptingAgeMinutes:2});
  try{
    const result=await recoverOriginalStoryVideo(fx.context);
    assert.equal(result.state,"recovering");
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().paid,0);
  }finally{fx.restore();}
});

test("missing Drive asset starts exactly one original-MP4 async ingest",async()=>{
  const fx=fixture();
  try{
    const result=await recoverOriginalStoryVideo(fx.context);
    assert.equal(result.state,"recovery_polling");
    assert.equal(fx.stats().uploads,1);
    assert.equal(fx.stats().paid,0);
    const again=await recoverOriginalStoryVideo(fx.context);
    assert.equal(again.state,"recovery_polling");
    assert.equal(fx.stats().uploads,1);
    assert.equal(fx.stats().creates,0);
  }finally{fx.restore();}
});

test("ambiguous upload POST is never submitted again",async()=>{
  const fx=fixture({asyncStatus:504});
  try{
    await assert.rejects(()=>recoverOriginalStoryVideo(fx.context),e=>e.status===503);
    assert.equal(fx.stats().uploads,1);
    const again=await recoverOriginalStoryVideo(fx.context);
    assert.equal(again.state,"recovery_upload_started");
    assert.equal(fx.stats().uploads,1);
  }finally{fx.restore();}
});

test("Runner lookup not yet deployed never uploads or generates another paid video",async()=>{
  const fx=fixture({driveReplyStatus:404});
  try {
    await assert.rejects(()=>recoverOriginalStoryVideo(fx.context),e=>
      e.status===503 && /Runner needs|Pipeline Runner needs/.test(e.message));
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().paid,0);
  }finally{fx.restore();}
});

test("failed or incomplete Runner Drive verification never permits an upload",async()=>{
  for(const options of [{driveReplyStatus:401},{driveReplyStatus:503},{driveComplete:false}]){
    const fx=fixture(options);
    try {
      await assert.rejects(()=>recoverOriginalStoryVideo(fx.context),e=>e.status===503);
      assert.equal(fx.stats().uploads,0);
      assert.equal(fx.stats().creates,0);
      assert.equal(fx.stats().paid,0);
    }finally{fx.restore();}
  }
});

test("two Drive copies with same original filename block registration",async()=>{
  const file={id:"1aaaaaaaaaaaaaaa",name:NAME,mimeType:"video/mp4",size:String(ORIGINAL_SIZE)};
  const fx=fixture({driveFiles:[file,{...file,id:"1bbbbbbbbbbbbbbb"}]});
  try{
    await assert.rejects(()=>recoverOriginalStoryVideo(fx.context),e=>e.status===409);
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().creates,0);
  }finally{fx.restore();}
});

test("wrong R2 owner blocks all external requests",async()=>{
  const fx=fixture({headValid:false});
  try{
    await assert.rejects(()=>recoverOriginalStoryVideo(fx.context),e=>e.status===409);
    assert.equal(fx.stats().uploads,0);
    assert.equal(fx.stats().paid,0);
  }finally{fx.restore();}
});

test("routing, explicit original-run token, and user recovery control remain aligned",()=>{
  const worker=readFileSync(new URL("./worker-functions-03.mjs",import.meta.url),"utf8");
  const dispatch=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../studio-web/assets/story-first-workspace.js",import.meta.url),"utf8");
  const recovery=readFileSync(new URL("./story-first-video-recovery-route.mjs",import.meta.url),"utf8");
  assert.match(worker, /if \(videoAction === "recover"\)/);
  assert.match(worker, /expectedRunId: String\(body.expected_run_id/);
  assert.match(dispatch, /recover\|reconcile-unbilled/);
  assert.match(ui, /button\("Recover Existing Video"/);
  assert.match(ui, /expected_run_id:video.run_id/);
  assert.doesNotMatch(recovery,/submitStoryVideo|\/v1\/flows\/video|approve_paid_generation/);
  assert.match(recovery,/recovery_upload_started_at/);
});
