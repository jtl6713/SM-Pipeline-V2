import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const code=fs.readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
const section=(name)=>code.slice(code.indexOf("export async function "+name+"("),
  code.indexOf("/*__STUDIO_WORKER_END:"+name+"__*/"));

test("source extraction includes new backend repair without duplicate definitions",()=>{
 assert.doesNotThrow(()=>readStudioWorkerSource());
 assert.match(worker,/\/*__STUDIO_WORKER_EXTRACT:studioRecoverEmptyPlatformOutputCron__\*\//);
 assert.match(worker,/ctx\.waitUntil\(studioRecoverEmptyPlatformOutputCron\(env,ctx\)/);
});

test("root repair is per-profile, exact-plan and zero-output only",()=>{
 const body=section("studioRecoverEmptyPlatformOutputCron");
 assert.match(body,/studioWriteSource\(env\) !== "supabase"/);
 assert.match(body,/No Platform Outputs found for this Production Request/);
 assert.match(body,/String\(f\(requestRecord,"Request_Status"\)\|\|""\)==="Submitted"/);
 assert.match(body,/String\(f\(idea,"Candidate_Status"\)\|\|""\)==="Promoted"/);
 assert.match(body,/owners\.length===1 && owners\[0\]===sampled\.id/);
 assert.match(body,/outputs\.length===0/);
 assert.match(body,/plan\.items\.length===rows\.length/);
 assert.match(body,/planned\.size===rows\.length/);
 assert.match(body,/!productionRequestRevisionOpen\(requestRecord\)/);
 assert.ok(body.indexOf('STUDIO_MEDIA.put(receiptKey') <
   body.indexOf('finalizeProductionRequestPromotion(env,sampled.id'));
 assert.match(body,/recoveryHold:true,skipDirectiveSync:true/);
 assert.match(body,/real\.length===rows\.length/);
 assert.match(body,/recoveryReviewOnly:true/);
 assert.match(body,/real\.every\(row=>f\(row,"Do_Not_Publish"\)!==true/);
 for (const field of ["Output_Status","Review_Status","Publish_Status","Auto_Publish_Enabled","Review_Decision_At","Published_At","Platform_Post_URL","YouTube_Video_ID","Scheduled_Post_Date","Studio_Scheduled_At","YouTube_Scheduled_Publish_At"]) {
   assert.ok(body.includes('f(row,"'+field+'")'), "recovery verifies "+field);
 }
 assert.match(body,/f\(row,"Auto_Publish_Enabled"\)===false/);
 assert.match(body,/studioFinishedOriginKind\(requestRecord\)!=="finished-video"/);
 assert.doesNotMatch(body,/publishNow|scheduleOutput|sendToMeta|approveAll/i);
});

test("media source failure cannot block creation of user-editable recovery outputs or silently publish",()=>{
 const effect=code.slice(code.indexOf("export async function buildOutputWorkItemEffective("),
   code.indexOf("/*__STUDIO_WORKER_END:buildOutputWorkItemEffective__*/"));
 const seed=code.slice(code.indexOf("function platformOutputSeedFields("),
   code.indexOf("/*__STUDIO_WORKER_END:platformOutputSeedFields__*/"));
 assert.match(effect,/options\.recoveryHold !== true\) throw error/);
 assert.match(effect,/effective\.music = emptyStudioMusic\(\)/);
 assert.match(effect,/effective\.recovery_media_issue/);
 assert.match(seed,/Render_Status: "Blocked"/);
 assert.match(seed,/Asset_Selection_Notes: effective\.recovery_media_issue/);
 assert.match(seed,/options\.recoveryReviewOnly === true \? \{\} : \{ Do_Not_Publish: true \}/);
 assert.match(seed,/productionRequestRevisionOpen\(requestRecord\)/);
 assert.match(seed,/Test_Run_ID/);
 assert.match(seed,/Review-only recovery requires a new non-test output/);
 assert.match(code,/if \(poId && options\.recoveryReviewOnly === true\)/);
 assert.ok(code.indexOf("Existing output discovered during review-only recovery; reconcile instead") <
   code.indexOf("let createdNewPlatformOutput=false"));
 assert.match(seed,/Publish_Status: "Not Ready"/);
 assert.match(seed,/Output_Status: "In Production"/);
 assert.match(seed,/Auto_Publish_Enabled: false/);
 assert.match(seed,/Scheduled_Post_Date: null/);
 assert.match(seed,/Review_Status: "Pending Review"/);
 assert.match(code,/buildOutputWorkItemEffective\(env,outputRow,requestRecord,parent,profileDefaults,\{recoveryHold:options\.recoveryHold===true\}\)/);
});

test("execute real seed: ordinary recovery cannot arm publication; legacy and test recovery stay held",()=>{
 const start=code.indexOf("export function platformOutputSeedFields(");
 const end=code.indexOf("/*__STUDIO_WORKER_END:platformOutputSeedFields__*/",start);
 assert.ok(start>=0 && end>start);
 const seed=vm.runInNewContext(code.slice(start,end).replace(/^export /,"")+"\nplatformOutputSeedFields",{
   f:(r,k)=>r?.fields?.[k],
   HttpError:class extends Error{constructor(status,message){super(message);this.status=status;}},
   productionRequestRevisionOpen:r=>Boolean(r.fields.revision),
   item4PlanItemForOutput:()=>({}),
   studioOutputIsNativePhotoRoute:()=>false,
   storySeedRenderStatus:()=> "Ready for Render",
   studioAiThumbnailUrl:()=>null,
   item4ThumbnailSource:()=> "none",
   studioWritableTextMode:x=>x,
   studioIsFinishedPassthrough:()=>false,
   studioFinishedSeedOverlay:()=>({}),
   item4StudioDirectiveYes:x=>x==="Yes",
 });
 const parent={id:"parent",fields:{}};
 const request={id:"request",fields:{}};
 const output={id:"output",fields:{}};
 const effective={platform:"Instagram",output_type:"Story",voiceover_mode:"Yes",
   background_music_mode:"Yes",video_duration_seconds:10,
   scheduled_at:"2026-12-01T12:00:00Z",recovery_media_issue:"Music source unavailable"};
 const pkg={story_teaser:true,clips:[]};
 const ordinary=seed(parent,request,output,effective,pkg,{recoveryHold:true,recoveryReviewOnly:true});
 assert.equal(Object.hasOwn(ordinary,"Do_Not_Publish"),false);
 assert.equal(ordinary.Render_Status,"Blocked");
 assert.equal(ordinary.Asset_Selection_Notes,"Music source unavailable");
 for(const [key,value] of Object.entries({Output_Status:"In Production",Review_Status:"Pending Review",
   Publish_Status:"Not Ready",Auto_Publish_Enabled:false,Scheduled_Post_Date:null,
   Studio_Scheduled_At:null,YouTube_Scheduled_Publish_At:null})) assert.equal(ordinary[key],value,key);
 assert.equal(ordinary.Studio_Effective_Video_Duration_Seconds,10);
 assert.equal(ordinary.Studio_Effective_Voiceover_Mode,"Yes");
 assert.equal(ordinary.Studio_Effective_Background_Music_Mode,"Yes");
 const ready=seed(parent,request,output,{...effective,recovery_media_issue:null},pkg,{recoveryHold:true,recoveryReviewOnly:true});
 assert.equal(ready.Render_Status,"Ready for Render");
 assert.equal(ready.Output_Status,"In Production");
 assert.equal(Object.hasOwn(ready,"Do_Not_Publish"),false);
 const legacy=seed(parent,request,output,effective,pkg,{recoveryHold:true});
 assert.equal(legacy.Do_Not_Publish,true);
 assert.equal(legacy.Auto_Publish_Enabled,false);
 assert.equal(legacy.Scheduled_Post_Date,null);
 const testRequest={...request,fields:{Test_Run_ID:"test"}};
 assert.equal(seed(parent,testRequest,output,effective,pkg,{recoveryHold:true}).Do_Not_Publish,true);
 for(const [req,options] of [[testRequest,{recoveryHold:true,recoveryReviewOnly:true}],
   [{...request,fields:{revision:true}},{recoveryHold:true,recoveryReviewOnly:true}],
   [request,{recoveryReviewOnly:true}]]) {
   assert.throws(()=>seed(parent,req,output,effective,pkg,options),/new non-test output/);
 }
});
