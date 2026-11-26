import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");
const start=source.indexOf("  // #3094: dedicated ordinary EZ intake");
const end=source.indexOf("  function automaticEzWizardAssertCurrent",start);
assert.ok(start>0&&end>start);
const f=vm.runInNewContext(source.slice(start,end)+"\n({runAutomaticEzWizardMedia,checkAutomaticEzWizardAcceptance,automaticEzWizardCandidate,automaticEzWizardCounts})",{FormData,Blob});
const ideaId="recIdea0000000001",requestId="recRequest0000001",profile="recProfile0000001";
const session=()=>({profile,kind:"single-ai",counts:{photos:0,clips:0,ai:1,total:1},planned:{platforms:["Instagram"]},title:"Title",summary:"Summary",location:"",payload:{content_type:"Feed Post",platforms:["Instagram"],production_notes:"origin=ez-wizard; ez-input=single-ai; ez-package=slides"}});
const idea={automatic_ez_intake_saved:true,record:{id:ideaId,production_mode:"automatic",production_source:"idea",status:"Generated",content_profile_links:[profile]}};
const draft={automatic_ez_draft_verified:true,record:{id:requestId,idea_record_id:ideaId,platforms:["Instagram"],content_type:"Feed Post",production_notes:session().payload.production_notes,status:"Draft",studio_master_asset_count:0}};
const ai={ok:true,production_request:{id:requestId},content_profile_id:profile,requested_count:1,generated_count:1,assets:[{}]};
const receipt={ok:true,queued:true,idea_id:ideaId,production_request_id:requestId,publishing:false,requires_factory_approval:true};
test("new automatic AI intake uses only dedicated routes and waits for exact acceptance receipt",async()=>{
 const s=session(),calls=[],results=[idea,draft,ai,{ok:true,snapshot:true,assets_status:"Uploading",assets:[{}]},{ok:true,snapshot:true,assets_status:"Ready",assets:[{}]},receipt];
 const call=async(path,options)=>{calls.push({path,options});return results.shift();};
 const args={session:s,call,assertCurrent:()=>{},files:[],preparePhoto:()=>{},makeMetadata:()=>{},isVideo:()=>false,progress:()=>{}};
 await f.runAutomaticEzWizardMedia(args);assert.equal(s.mediaSubmitted,true);
 assert.equal(await f.checkAutomaticEzWizardAcceptance(args),null);assert.equal(s.acceptStarted,undefined);
 assert.equal(await f.checkAutomaticEzWizardAcceptance(args),receipt);
 assert.deepEqual(calls.map(x=>x.path.split("?")[0]),["/api/ideas","/api/automatic-ez/production-requests","/api/automatic-ez/production-requests/"+requestId+"/generate-ai-masters","/api/automatic-ez/production-requests/"+requestId+"/item4","/api/automatic-ez/production-requests/"+requestId+"/item4","/api/automatic-ez/production-requests/"+requestId+"/accept"]);
 assert.ok(calls.every(x=>x.options.retries===0&&x.path.endsWith("?profile="+profile)));
 assert.deepEqual(JSON.parse(calls.at(-1).options.body),{accept_intake:true});
});
test("unverified Idea, changed destination or wrong profile stops before generating or accepting",async()=>{
 for(const results of [[{...idea,automatic_ez_intake_saved:false}],[idea,{...draft,record:{...draft.record,platforms:["Facebook"]}}],[idea,draft,{...ai,content_profile_id:"other"}]]) {
  const s=session();let calls=0;
  await assert.rejects(f.runAutomaticEzWizardMedia({session:s,call:async()=>{calls++;return results.shift();},assertCurrent:()=>{},files:[],progress:()=>{}}));
  assert.equal(s.mediaSubmitted,undefined);assert.ok(calls<=3);
 }
});
test("accept replay skips snapshot but never uploads or grants publishing permission",async()=>{
 const s={...session(),ideaId,requestId,mediaSubmitted:true,acceptStarted:true};
 let calls=0;
 await assert.rejects(f.checkAutomaticEzWizardAcceptance({session:s,assertCurrent:()=>{},call:async(path)=>{calls++;assert.match(path,/\/accept\?/);return {...receipt,publishing:true};}}));
 assert.equal(calls,1);
});
test("dedicated and existing Idea paths are excluded from new ordinary intake",()=>{
 for(const inputKind of ["vibe-cut","finished-video","finished-stills"])assert.equal(f.automaticEzWizardCandidate({inputKind}),false);
 assert.equal(f.automaticEzWizardCandidate({inputKind:"single-photo",ideaId}),false);
 assert.equal(f.automaticEzWizardCandidate({inputKind:"multiple-photos",photoWait:true}),false);
 assert.equal(f.automaticEzWizardCandidate({inputKind:"mixed"}),true);
});
