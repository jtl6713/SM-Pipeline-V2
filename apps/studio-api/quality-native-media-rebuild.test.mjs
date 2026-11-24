import test from "node:test";
import assert from "node:assert/strict";
import {rebuildCandidate,buildRebuiltPackage,recoverNativeReviewWithRebuild,oldClaimSafe,rebuildWrongNativeReview} from "./quality-native-media-rebuild.mjs";
const id="rec8I104V9gQmiOxf",at="2026-11-23T04:55:01.976Z",later="2026-11-24T15:00:00Z";
const row={id:"11111111-1111-4111-8111-111111111111",airtable_record_id:id,output_number:10857,
 content_item_id:"22222222-2222-4222-8222-222222222222",content_profile_id:"33333333-3333-4333-8333-333333333333",
 platform:"TikTok",studio_output_type:"Multi-Photo",render_status:"Native Photo Route",output_status:"Ready for Review",
 review_status:"Review Sent",publish_status:"Not Ready",tiktok_draft_status:"Waiting for Schedule",updated_at:at,
 do_not_publish:false,auto_publish_enabled:false,output_title:"Ferry",output_caption:"Ferry views",
 selected_assets:{selected_clips:[{url:"wrong"}],render_prep:{render_clip_list_json:"wrong"}},render_clip_list:[{url:"wrong"}],
 error_messages:{SM_NYC_Sibling_Visual_QA_Hold_20261122:{source_replacement_required:true,manual_reapproval_required:true,
 no_recorded_native_or_dispatch_attempt:true,provider_writes:0},SM_Scheduling_Approval_Preflight_v1:{status:"verified"},
 SM_Factory_Supabase_Approval_Receipt:{approved_at:"2026-11-21T00:00:00Z"},Clip_1_URL:"wrong"}};
const sha="a".repeat(64),source={source_output:10855,source_version:at,assets:[1,2].map(i=>({
 index:i,media_asset_id:"recSource0000000"+i,asset_name:"Ferry "+i,drive_id:"drive"+i,transfer_id:"LIB-"+i,
 source_url:"https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2221/slide-0"+i+"-"+sha.slice(0,16)+".jpg",
 source_hash_prefix:sha.slice(0,16),branded_sha256:sha}))};
const stage={verified:true,output:10857,source_output:10855,target_version:at,source_version:at,source_writes:0,provider_writes:0,
 assets:source.assets.map((a,i)=>({...a,source_sha256:sha,sha256:sha,geometry:"1080x1920",cdn_verified:true,
 url:"https://media.chicagoshining.com/studio/previews/watermarked/quality-native-rebuild/"+id+"/slide-0"+(i+1)+"-"+sha+".jpg"}))};
test("only documented wrong-media stale review can rebuild, never real publishing or active holds",()=>{
 assert.equal(rebuildCandidate(row),true);
 for(const patch of [{do_not_publish:true},{auto_publish_enabled:true},{scheduled_post_date:at},{published_at:at},
 {review_status:"Approved"},{platform_publish_response:{id:"prior"}},{error_messages:{}},
 {error_messages:{...row.error_messages,TikTok_Draft_Attempt_Count:1}},
 {error_messages:{...row.error_messages,Studio_Render_Review_Hold_Active:true}}])assert.equal(rebuildCandidate({...row,...patch}),false);
});
test("new media replaces every active manifest and preserves historical approval without new approval",()=>{
 const mutation=buildRebuiltPackage(row,source,stage,later);
 assert.ok(mutation);assert.equal(mutation.tiktok_draft_status,null);
 assert.equal(mutation.aspect_ratio,"9:16");
 assert.deepEqual(mutation.selected_assets.selected_clips,mutation.render_clip_list);
 assert.deepEqual(JSON.parse(mutation.selected_assets.render_prep.render_clip_list_json),mutation.render_clip_list);
 assert.equal(mutation.error_messages.Clip_1_URL,stage.assets[0].url);
 assert.equal(mutation.error_messages.SM_Scheduling_Approval_Preflight_v1.requires_human_approval,true);
 assert.equal(mutation.error_messages.SM_Scheduling_Approval_Preflight_v1.scheduling_authorized,false);
 assert.equal(mutation.error_messages.SM_Scheduling_Approval_Preflight_v1.publishing_authorized,false);
 assert.deepEqual(mutation.error_messages.SM_Factory_Supabase_Approval_Receipt,row.error_messages.SM_Factory_Supabase_Approval_Receipt);
 assert.equal(mutation.error_messages.SM_Quality_Native_Media_Rebuild_v1.requires_human_approval,true);
 for(const forbidden of ["output_status","review_status","publish_status","auto_publish_enabled","do_not_publish","scheduled_post_date","published_at"])assert.ok(!(forbidden in mutation));
 for(const bad of [{...stage,provider_writes:1},{...stage,target_version:later},{...stage,assets:[{...stage.assets[0],source_sha256:"b".repeat(64)},stage.assets[1]]}])assert.equal(buildRebuiltPackage(row,source,bad,later),null);
});
test("scheduled fallback dispatch is explicitly enabled and only for media blockers",async()=>{
 let called=0;
 const options={recover:async()=>({status:"skipped",reason:"not_stale_native_review_handoff"}),rebuild:async()=>{called++;return {status:"repaired"};}};
 assert.equal((await recoverNativeReviewWithRebuild({}, {},options)).status,"skipped");
 assert.equal(called,0);
 assert.equal((await recoverNativeReviewWithRebuild({QUALITY_NATIVE_MEDIA_REBUILD_ENABLED:"true"},{},options)).status,"repaired");
 assert.equal(called,1);
 for(const reason of ["hold_or_prior_provider_evidence","shared_admission_denied","exact_revision_already_attempted"]){
   await recoverNativeReviewWithRebuild({QUALITY_NATIVE_MEDIA_REBUILD_ENABLED:"true"},{},{...options,recover:async()=>({status:"skipped",reason})});
 }
 assert.equal(called,1);
});
test("active or uncertain Factory claim blocks media replacement",async()=>{
 const profile="recgtK8Z7eNADNtVy",rid="original-request-12345",root="studio/state/factory-approvals/v2/";
 const data=new Map([[root+"output-claims-v1/"+profile+".json",{schema:"studio.factory-output-claims.1",profile_id:profile,outputs:{[id]:{request_id:rid,at:"2026-11-21T00:00:00Z"}}}],
 [root+"jobs/"+profile+"/"+rid+".json",{request_id:rid,profile_id:profile,status:"completed",updated_at:"2026-11-21T00:01:00Z",items:[{id,status:"failed"}]}]]);
 const bucket={get:async k=>data.has(k)?{size:100,text:async()=>JSON.stringify(data.get(k))}:null};
 assert.equal(await oldClaimSafe(bucket,profile,id,at),true);
 data.get(root+"jobs/"+profile+"/"+rid+".json").status="running";
 assert.equal(await oldClaimSafe(bucket,profile,id,at),false);
 data.delete(root+"jobs/"+profile+"/"+rid+".json");
 assert.equal(await oldClaimSafe(bucket,profile,id,at),false);
});

test("complete worker adapter: proven source -> staged bytes -> CAS -> human Factory review, or fail closed",async()=>{
 const profile="recgtK8Z7eNADNtVy",idea="recIdea0000000001",siblingId="recO494MDnQ1Tk51b";
 const request="44444444-4444-4444-8444-444444444444",ideaUuid="55555555-5555-4555-8555-555555555555";
 const proofs=source.assets.map(a=>({...a,branded_url:a.source_url.replace(/\/slide-/, "/shared-small-bottom-right/slide-")}));
 const currentStage={...stage,assets:stage.assets.map((a,i)=>({...a,branded_url:proofs[i].branded_url}))};
 for(const fault of ["none","bytes","claim","race","denied","duplicate","rights","uncertain"]){
  let state=structuredClone(row),writes=0,stages=0,reservations=0,reads=0,releases=0;
  const read=async path=>{
   if(path.startsWith("platform_outputs?airtable_record_id=")){reads++;if(fault==="race"&&reads===2)state.updated_at=later;return [structuredClone(state)];}
   if(path.startsWith("content_items?"))return [{id:row.content_item_id,content_profile_id:row.content_profile_id,production_request_id:request}];
   if(path.startsWith("production_requests?"))return [{id:request,promoted_content_item_id:row.content_item_id,idea_candidate_id:ideaUuid,request_status:"Promoted",output_plan_status:"Ready",production_job:{step:"done"},updated_at:at,output_plan:{items:[{platform:"Instagram",output_type:"Carousel"},{platform:"TikTok",output_type:"Multi-Photo"}]}}];
   if(path.startsWith("idea_candidates?"))return [{airtable_record_id:idea,content_profile_id:row.content_profile_id}];
   if(path.startsWith("content_profiles?"))return [{airtable_record_id:profile}];
   if(path.startsWith("platform_outputs?content_item_id="))return [{airtable_record_id:siblingId,output_number:10855,content_profile_id:row.content_profile_id,
    output_title:row.output_title,output_caption:row.output_caption,output_status:"Approved for Publishing",review_status:"Approved",selected_clip_count:2,updated_at:at,
    selected_assets:{selected_clips:proofs.map(a=>({order:a.index,mediaAssetRecordId:a.media_asset_id,googleDriveFileId:a.drive_id,url:a.branded_url}))}}];
   if(path.startsWith("media_assets?"))return proofs.map(a=>({airtable_record_id:a.media_asset_id,asset_name:a.asset_name,google_drive_file_id:a.drive_id,media_class:"Image",active:true,do_not_use:false,asset_status:"Available",metadata:{rights_status:fault==="rights"?"Unknown":"Owned",content_profile_airtable_id:profile,studio_transfer_id:a.transfer_id}}));
   if(path.startsWith("carousel_slides?"))return proofs.map(a=>({current_order:a.index,fields:{"Platform Output":[siblingId],Asset_Family_Key:a.media_asset_id,"Google Drive File ID":a.drive_id,"Final Image URL":a.branded_url,
    SM_NYC_AI_Creative_QA_20261122:{brand_verified:true,source_owner_rights_verified:true,verified_branded_sha256:a.branded_sha256},
    SM_NYC_Shared_Small_Watermark_20261122:{cdn_sha256_verified:true,geometry:"1080x1350",verified_branded_url:a.branded_url,branded_sha256:a.branded_sha256,source_unbranded_url:a.source_url}}}));
   throw Error("unexpected read "+path);
  };
  const opts={read,lock:async(_id,fn)=>fn(),claim:async()=>({admitted:fault!=="denied"}),release:async()=>{releases++;},
   heartbeat:()=>({assertOwned(){},stop:async()=>{}}),claimSafe:async()=>fault!=="claim",now:()=>new Date(later),
   bucket:{put:async()=>{reservations++;return fault==="duplicate"?null:{etag:"exact"};}},
   stage:async body=>{stages++;assert.equal(body.assets.length,2);assert.equal(body.source_output,10855);return currentStage;},
   checkBytes:async()=>fault!=="bytes",patch:async(path,body)=>{writes++;assert.match(path,/updated_at=eq\./);assert.match(path,/auto_publish_enabled=eq.false/);
    assert.ok(!("review_status" in body));assert.ok(!("scheduled_post_date" in body));if(fault==="uncertain")return [];state={...state,...body};return [state];}};
  const report={status:"ok",findings:[{reason:"stale_tiktok_waiting_schedule_blocks_review",record_id:id,output_id:10857,content_item_id:row.content_item_id}]};
  const run=()=>rebuildWrongNativeReview({},report,opts);
  if(["bytes","race","uncertain"].includes(fault))await assert.rejects(run());
  else {const result=await run();assert.equal(result.status,fault==="none"?"repaired":"skipped");}
  assert.equal(writes,["none","uncertain"].includes(fault)?1:0);
  assert.equal(stages,["none","bytes","race","uncertain"].includes(fault)?1:0);
  if(fault==="none"){assert.equal(state.tiktok_draft_status,null);assert.equal(state.review_status,"Review Sent");assert.equal(state.auto_publish_enabled,false);
   assert.equal(state.error_messages.SM_Scheduling_Approval_Preflight_v1.requires_human_approval,true);assert.equal((await run()).status,"skipped");assert.equal(writes,1);}
  if(fault==="uncertain")assert.equal(reservations,1,"unknown commit remains reserved");
 }
});


test("exact source policy adds no bindings and manual rebuild cannot widen cron or target scope",async()=>{
 const {qualityNativeManualCanary,manualQualityCanaryTarget}=await import("./quality-native-manual-canary.mjs");
 const target=qualityNativeManualCanary.record_id;
 assert.equal(manualQualityCanaryTarget({}),target);
 assert.equal(manualQualityCanaryTarget({QUALITY_FACTORY_HANDOFF_CRON_DISABLED:"true"}),null);
 assert.equal(manualQualityCanaryTarget({QUALITY_FACTORY_HANDOFF_REPAIR_CANARY_RECORD_ID:"recOther00000000"}),null);
 const report={status:"ok",findings:[{record_id:target,reason:"stale_tiktok_waiting_schedule_blocks_review"}]};
 let rebuilt=0,recovered=0;
 const recover=async()=>{recovered++;return {status:"skipped",reason:"not_stale_native_review_handoff"}};
 const rebuild=async()=>{rebuilt++;return {status:"repaired"}};
 assert.equal((await recoverNativeReviewWithRebuild({},report,{recover,rebuild})).status,"skipped");
 assert.equal(rebuilt,0,"normal cron remains default off");
 assert.equal((await recoverNativeReviewWithRebuild({},report,{recover,rebuild,manualCanaryRecordId:target})).status,"repaired");
 assert.equal(rebuilt,1);
 for(const [env,r,id] of [
  [{QUALITY_FACTORY_HANDOFF_CRON_DISABLED:"true"},report,target],
  [{QUALITY_FACTORY_HANDOFF_REPAIR_CANARY_RECORD_ID:target},report,target],
  [{},report,"recOther00000000"],
  [{},{...report,findings:[{...report.findings[0],record_id:"recOther00000000"}]},target],
  [{},{...report,findings:[report.findings[0],report.findings[0]]},target],
 ]){
  const before=recovered;
  assert.equal((await recoverNativeReviewWithRebuild(env,r,{recover,rebuild,manualCanaryRecordId:id})).status,"skipped");
  assert.equal(recovered,before,"must not enter even the status repair adapter");
 }
 assert.equal(rebuilt,1);
});
