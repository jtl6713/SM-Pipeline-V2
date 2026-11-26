import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canonicalVibeDraftNotes,verifiedVibeDraftInput,verifiedVibeDraftReceipt,vibeRequestOperationAllowed,dedicatedVibeIntakeEnabled} from "./vibe-dedicated-intake.mjs";
import {dedicatedProductionRoute,dedicatedRouteEnabled,verifyDedicatedProductionAccess} from "./dedicated-production-routes.mjs";
const ideaId="recIdea0000000001",profileId="recProfile0000001",requestId="recRequest0000001",orgId="recOrg00000000001",brandId="recBrand000000001";
const profile={id:"11111111-1111-1111-1111-111111111111",airtable_record_id:profileId};
const owner={id:"22222222-2222-2222-2222-222222222222",airtable_record_id:ideaId,content_profile_id:profile.id,content_profiles:profile,production_source:"vibe_cut",production_mode:"automatic"};
const scope={organizationId:orgId,profiles:[{id:profileId,brandIds:[brandId]}]};
const idea={id:ideaId,fields:{Content_Profile:[profileId],Studio_Production_Source:"vibe_cut",Studio_Production_Mode:"automatic",Candidate_Status:"Generated"}};
const path="/api/vibe-cut/production-requests",requestPath=path+"/"+requestId;
const enabled={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_DEDICATED_PRODUCTION_ROUTES:"true",STUDIO_DEDICATED_VIBE_INTAKE:"true"};
function payload(aspect="vertical"){
 return {idea_record_id:ideaId,content_profile_id:profileId,production_notes:canonicalVibeDraftNotes({target_seconds:15,versions:2},aspect),
 content_type:aspect==="vertical"?"Vertical Short Video":"Longform Video",platforms:aspect==="vertical"?["Instagram","Facebook","TikTok","YouTube"]:["YouTube"],
 voiceover_mode:"No",background_music_mode:"Yes",thumbnail_mode:"Yes",video_duration_seconds:15};
}
function draft(body=payload(),patch={}){
 return {id:requestId,fields:{Idea_Candidate:[ideaId],Active:true,Production_Notes:body.production_notes,Master_Content_Type:body.content_type,
 Target_Platforms:body.platforms,Voiceover_Mode:"No",Background_Music_Mode:"Yes",Thumbnail_Mode:"Yes",Video_Duration_Seconds:15,Request_Status:"Draft",Studio_Master_Asset_Count:0,...patch}};
}
function canonical(record,patch={}){
 return {airtable_record_id:requestId,idea_candidate_id:owner.id,idea_candidates:owner,
 organization_id:"33333333-3333-3333-3333-333333333333",organizations:{id:"33333333-3333-3333-3333-333333333333",airtable_record_id:orgId},
 brand_id:"44444444-4444-4444-4444-444444444444",brands:{id:"44444444-4444-4444-4444-444444444444",airtable_record_id:brandId},
 request_status:record.fields.Request_Status,production_notes:record.fields.Production_Notes,publish_status:{},...patch};
}
const startBody={origin_kind:"vibe-cut",filename:"street.mov",size_bytes:30000000,mime_type:"video/quicktime"};
const source={id:"source",origin_kind:"vibe-cut",media_kind:"video",r2_key:"studio/master-assets/source",multipart_upload_id:"upload",upload_status:"multipart_pending"};
test("Vibe transport has an independent default-off flag and exact multipart-only allowlist",()=>{
 assert.equal(dedicatedVibeIntakeEnabled({}),false);
 for(const key of Object.keys(enabled))assert.equal(dedicatedVibeIntakeEnabled({...enabled,[key]:"false"}),false);
 for(const [suffix,method] of [["/item4","GET"],["/assets/upload-session","POST"],["/assets/upload-session/source/parts/1","PUT"],["/assets/upload-session/source/complete","POST"]]){
   const route=dedicatedProductionRoute(requestPath+suffix,method);
   assert.equal(route.allowed,true);
   assert.equal(dedicatedRouteEnabled(enabled,route),true);
   assert.equal(route.path,"/api/production-requests/"+requestId+suffix);
 }
 for(const [suffix,method] of [["","GET"],["/assets","POST"],["/promote","POST"],["/outputs","PUT"],["/plan","POST"],["/vibe-to-review","POST"],["/assets/upload-session/source","DELETE"],["/assets/upload-session/source/parts/0","PUT"]])
   assert.equal(dedicatedProductionRoute(requestPath+suffix,method).allowed,false,suffix);
 assert.equal(dedicatedProductionRoute(path+"/recShort/item4","GET").allowed,false);
 assert.equal(dedicatedProductionRoute(path,"GET").allowed,false);
});
test("exact typed owner, source orientation, music-only plan and directive are necessary for draft creation",()=>{
 for(const aspect of ["vertical","horizontal"]){
   const body=payload(aspect);
   assert.equal(verifiedVibeDraftInput(idea,body),true);
   assert.equal(verifiedVibeDraftReceipt(draft(body),idea,body),true);
   assert.equal(verifiedVibeDraftReceipt(draft(body,{Production_Notes:body.production_notes+"\n\nIdea creative direction: city montage"}),idea,body),true);
   for(const patch of [{platforms:["Facebook"]},{voiceover_mode:"Yes"},{content_type:"Carousel"},{production_notes:body.production_notes+"\norigin=az-finished-video"},{production_notes:body.production_notes+"\nsource-aspect=horizontal"},{publish_mode:"immediate"},{schedules:{}},{content_profile_id:"recOther000000001"}])
     assert.equal(verifiedVibeDraftInput(idea,{...body,...patch}),false,JSON.stringify(patch));
   assert.equal(verifiedVibeDraftInput({...idea,fields:{...idea.fields,Studio_Production_Source:"finished_video"}},body),false);
   assert.equal(verifiedVibeDraftInput({...idea,fields:{...idea.fields,Studio_Production_Mode:"manual"}},body),false);
   assert.equal(verifiedVibeDraftReceipt(draft(body,{Studio_Publish_Requested_At:"now"}),idea,body),false);
 }
});
test("multipart starts only on an empty Draft, and parts and completion belong to the single exact Vibe source",()=>{
 const empty=draft();
 assert.equal(vibeRequestOperationAllowed({operation:"start"},empty,startBody),true);
 assert.equal(vibeRequestOperationAllowed({operation:"start"},empty,{...startBody,origin_kind:"finished-video"}),false);
 assert.equal(vibeRequestOperationAllowed({operation:"start"},empty,{...startBody,filename:"photo.png"}),false);
 const staged=draft(payload(),{Studio_Master_Asset_Count:1,Studio_Master_Assets_JSON:JSON.stringify([source])});
 assert.equal(vibeRequestOperationAllowed({operation:"start"},staged,startBody),false);
 assert.equal(vibeRequestOperationAllowed({operation:"part",asset:"source"},staged),true);
 assert.equal(vibeRequestOperationAllowed({operation:"part",asset:"other"},staged),false);
 assert.equal(vibeRequestOperationAllowed({operation:"complete",asset:"source"},staged),true);
 const done=draft(payload(),{Studio_Master_Asset_Count:1,Studio_Master_Assets_JSON:JSON.stringify([{...source,upload_status:"complete"}])});
 assert.equal(vibeRequestOperationAllowed({operation:"part",asset:"source"},done),false);
 assert.equal(vibeRequestOperationAllowed({operation:"complete",asset:"source"},done),true);
 for(const status of ["Submitted","Promoted","Cancelled"]){
   const locked=draft(payload(),{...staged.fields,Request_Status:status});
   assert.equal(vibeRequestOperationAllowed({operation:"complete",asset:"source"},locked),false);
   assert.equal(vibeRequestOperationAllowed({operation:"snapshot"},locked),status!=="Cancelled");
 }
});
test("canonical row and exact request readback must agree; no ordinary or AZ owner can borrow Vibe transport",async()=>{
 const record=draft(),row=canonical(record);
 const route=dedicatedProductionRoute(requestPath+"/assets/upload-session","POST");
 const verify=(r=row,d=record,i=idea,s=scope,b=startBody)=>verifyDedicatedProductionAccess({route,body:b,scope:s,read:async()=>[r],loadIdea:async()=>i,loadRequest:async()=>d});
 assert.equal(await verify(),true);
 assert.equal(await verify({...row,idea_candidates:{...owner,production_source:"finished_video"}}),false);
 assert.equal(await verify({...row,idea_candidates:{...owner,production_mode:"manual"}}),false);
 assert.equal(await verify({...row,production_notes:"origin=az-finished-video"}),false);
 assert.equal(await verify(row,record,idea,{...scope,profiles:[]}),false);
 assert.equal(await verify(row,draft(payload(),{Request_Status:"Promoted"})),false);
 assert.equal(await verify(row,record,idea,scope,{...startBody,origin_kind:"finished-video"}),false);
 const create=dedicatedProductionRoute(path,"POST");
 assert.equal(await verifyDedicatedProductionAccess({route:create,body:payload(),scope,read:async()=>[owner],loadIdea:async()=>idea}),true);
 assert.equal(await verifyDedicatedProductionAccess({route:create,body:payload(),scope,read:async()=>[owner,owner],loadIdea:async()=>idea}),false);
});
test("shared handler fences are applied before staging and AZ publishing continuation is not used",()=>{
 const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
 const create=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
 const media=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
 assert.match(worker,/dedicated_vibe_intake_enabled: dedicatedVibeIntakeEnabled/);
 assert.match(worker,/dedicatedRoute\?\.kind==="vibe_create"[\s\S]*?withOutputApprovalLock[\s\S]*?\{dedicatedVibe:true\}/);
 assert.match(create,/if \(automaticEzIntake \|\| dedicatedVibe\) \{\s*let existingId;/);
 assert.match(create,/verifiedVibeDraftReceipt\(saved,idea,payload\)/);
 const start=media.slice(media.indexOf("export async function createItem4LargeVideoUploadSession("),media.indexOf("/*__STUDIO_WORKER_END:createItem4LargeVideoUploadSession__*/"));
 const finish=media.slice(media.indexOf("export async function completeItem4LargeVideoUploadSession("),media.indexOf("/*__STUDIO_WORKER_END:completeItem4LargeVideoUploadSession__*/"));
 assert.ok(start.indexOf("vibeRequestOperationAllowed(")<start.indexOf("await env.STUDIO_MEDIA.createMultipartUpload("));
 assert.ok(finish.indexOf("vibeRequestOperationAllowed(")<finish.indexOf("await multipart.complete("));
 assert.match(finish,/if \(!dedicatedVibe && studioIsAzFinishedVideo/);
});
