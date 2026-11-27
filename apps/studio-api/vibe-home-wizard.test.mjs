import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {canonicalVibeDraftNotes,verifiedVibeDraftInput} from "./vibe-dedicated-intake.mjs";
const source=readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");
const start=source.indexOf("  // #3094: Home-only Vibe intake.");
const end=source.indexOf("  function dedicatedVibeStorageKey(",start);
assert.ok(start>0&&end>start);
const window={};
vm.runInNewContext(readFileSync(new URL("../studio-web/assets/vibe-cut.js",import.meta.url),"utf8"),{window});
const f=vm.runInNewContext(source.slice(start,end)+"\n({dedicatedVibePlan,runDedicatedVibeWizardUpload})",
 {vibeCutApi:()=>window.ChicagoShiningVibeCut});
const profile="recProfile0000001",ideaId="recIdea0000000001",requestId="recRequest0000001";
const config=window.ChicagoShiningVibeCut.defaultConfig({style:"fast-cuts",energy:4,target_seconds:45,chronology:"chronological",beat_sync:"off",versions:3,prefer_unused:true,find_best:true});
const idea={id:ideaId,production_source:"vibe_cut",production_mode:"automatic",status:"Generated",content_profile_links:[profile]};
const partSize=5*1024*1024;
const file={name:"original.mov",size:partSize+100,lastModified:123,type:"video/quicktime",slice:(start,end)=>({start,end})};
function session(aspect="horizontal"){return {profile,aspect,width:aspect==="horizontal"?1920:1080,height:aspect==="horizontal"?1080:1920,plan:f.dedicatedVibePlan(config,aspect),title:"Vibe",summary:"Creative",location:"",file:{name:file.name,size:file.size,lastModified:file.lastModified},parts:[]};}
function record(s){return {id:requestId,idea_record_id:ideaId,status:"Draft",...s.plan};}
const pending={id:"asset1",name:file.name,size_bytes:file.size,origin_kind:"vibe-cut",media_kind:"video",upload_status:"multipart_pending",multipart_upload_id:"session1"};
const complete={...pending,upload_status:"complete",multipart_upload_id:undefined};
function snapshot(asset,extra={}){return {ok:true,snapshot:true,production_request_id:requestId,idea_id:ideaId,multipart_part_size:partSize,assets_status:"Uploading",assets:asset?[asset]:[],...extra};}
function args(s,responses){
 const calls=[],parts=[],saved=[];
 return {calls,parts,saved,opts:{s,file,call:async(path,options)=>{calls.push({path,options});const value=responses.shift();if(value instanceof Error)throw value;return value;},part:async(path,chunk,n)=>{parts.push({path,n});return {ok:true,asset_id:"asset1",part_number:n,etag:"etag"+n};},digest:async chunk=>"digest:"+chunk.start,save:x=>saved.push(JSON.parse(JSON.stringify(x))),assertCurrent:()=>{},progress:()=>{}}};
}
test("canonical Vibe creative settings and destination policy match the server for both orientations",()=>{
 for(const aspect of ["horizontal","vertical"]){
  const s=session(aspect);
  assert.equal(s.plan.production_notes,canonicalVibeDraftNotes(config,aspect));
  assert.deepEqual(Array.from(s.plan.platforms),aspect==="horizontal"?["YouTube"]:["Instagram","Facebook","TikTok","YouTube"]);
  assert.equal(s.plan.content_type,aspect==="horizontal"?"Longform Video":"Vertical Short Video");
  assert.equal(s.plan.video_duration_seconds,45);
  assert.equal(s.plan.voiceover_mode,"No");
  assert.equal(verifiedVibeDraftInput({id:ideaId,fields:{Content_Profile:[profile],Studio_Production_Source:"vibe_cut",Studio_Production_Mode:"automatic",Candidate_Status:"Generated"}},{idea_record_id:ideaId,content_profile_id:profile,...s.plan}),true);
 }
});
test("new Vibe upload only uses scoped dedicated multipart transport and leaves Ready status to the server",async()=>{
 const s=session();
 const x=args(s,[{ok:true,record:idea},{dedicated_vibe_draft_verified:true,record:record(s)},snapshot(),
  {ok:true,asset_id:"asset1",upload_id:"session1",part_size:partSize,parts_expected:2,record:record(s)},snapshot(pending),
  {ok:true,uploaded:1,record:record(s),assets:[complete],authority_status:"Uploading"}]);
 const result=await f.runDedicatedVibeWizardUpload(x.opts);
 assert.equal(result.authority_status,"Uploading");
 assert.equal(s.ideaId,ideaId);assert.equal(s.requestId,requestId);assert.equal(s.assetId,"asset1");assert.equal(s.uploadId,"session1");
 assert.equal(s.parts.length,2);
 assert.deepEqual(x.calls.map(x=>x.path.split("?")[0]),["/api/ideas","/api/vibe-cut/production-requests","/api/vibe-cut/production-requests/"+requestId+"/item4","/api/vibe-cut/production-requests/"+requestId+"/assets/upload-session","/api/vibe-cut/production-requests/"+requestId+"/item4","/api/vibe-cut/production-requests/"+requestId+"/assets/upload-session/asset1/complete"]);
 assert.ok(x.calls.every(x=>x.path.endsWith("profile="+profile)&&x.options.retries===0));
 assert.ok(x.parts.every(x=>x.path.includes("/api/vibe-cut/")&&x.path.endsWith("profile="+profile)));
 assert.equal(x.saved[0].ideaStarted,true);
 assert.equal(JSON.parse(x.calls.at(-1).options.body).parts.length,2);
});
test("lost session response recovers existing exact server session and never creates another",async()=>{
 const s={...session(),ideaId,requestId,ideaStarted:true};
 const x=args(s,[{ok:true,record:idea},snapshot(pending),{ok:true,uploaded:1,record:record(s),assets:[complete],authority_status:"Uploading"}]);
 await f.runDedicatedVibeWizardUpload(x.opts);
 assert.equal(s.uploadId,"session1");assert.equal(s.partSize,partSize);
 assert.equal(x.calls.length,3);assert.equal(x.parts.length,2);
 assert.ok(x.calls.every(x=>!x.path.endsWith("/assets/upload-session?profile="+profile)));
});
test("lost completion response replays same acknowledged parts and never uploads another source",async()=>{
 const s={...session(),ideaId,requestId,ideaStarted:true,assetId:"asset1",uploadId:"session1",partSize,parts:[{part_number:1,etag:"etag1",digest:"digest:0"},{part_number:2,etag:"etag2",digest:"digest:"+partSize}]};
 const x=args(s,[{ok:true,record:idea},snapshot(complete),{ok:true,uploaded:1,record:record(s),assets:[complete],authority_status:"Uploading"}]);
 await f.runDedicatedVibeWizardUpload(x.opts);
 assert.equal(x.parts.length,0);assert.match(x.calls.at(-1).path,/\/asset1\/complete\?/);
});
test("incorrect Idea, request snapshot, session identity and changed acknowledged bytes fail closed",async()=>{
 const cases=[
  [{...session(),ideaId,requestId},[{ok:true,record:{...idea,content_profile_links:["other"]}}]],
  [{...session(),ideaId,requestId},[{ok:true,record:idea},snapshot(pending,{idea_id:"wrong"})]],
  [{...session(),ideaId,requestId,assetId:"asset1",uploadId:"wrong",partSize},[{ok:true,record:idea},snapshot(pending)]],
  [{...session(),ideaId,requestId,assetId:"asset1",uploadId:"session1",partSize,parts:[{part_number:1,etag:"etag1",digest:"different"}]},[{ok:true,record:idea},snapshot(pending)]],
  [{...session(),ideaStarted:true},[]],
 ];
 for(const [s,responses] of cases){const x=args(s,responses);await assert.rejects(f.runDedicatedVibeWizardUpload(x.opts));assert.equal(x.parts.length,0);assert.ok(x.calls.every(x=>!x.path.includes("/complete?")));}
});
test("Home integration checks dedicated capability before ordinary intake and never opens the editor",()=>{
 const finish=source.slice(source.indexOf("  async function finishEzWizard("),source.indexOf("  function drainPendingMasterUploads("));
 assert.ok(finish.indexOf("offerDedicatedVibeWizardIntake")<finish.indexOf("offerAutomaticEzWizardIntake"));
 const dedicated=source.slice(start,source.indexOf("  async function finishEzWizard(",start));
 assert.match(dedicated,/dedicated_vibe_intake_enabled/);assert.match(dedicated,/navigator\.locks\.request/);
 assert.doesNotMatch(dedicated,/openProductionRequestForIdea|vibe-to-review|azAutoApprove|switchToPage\("production"\)/);
});
