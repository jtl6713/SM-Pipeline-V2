import test from "node:test";
import assert from "node:assert/strict";
import {rebuildCandidate,buildRebuiltPackage,recoverNativeReviewWithRebuild,oldClaimSafe} from "./quality-native-media-rebuild.mjs";
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
 assert.equal(mutation.error_messages.SM_Scheduling_Approval_Preflight_v1,undefined);
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
