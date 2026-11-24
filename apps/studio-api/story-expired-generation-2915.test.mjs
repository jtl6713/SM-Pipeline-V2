import test from "node:test";
import assert from "node:assert/strict";
import {STORY_2915_ID as id,story2915ReleaseReady,story2915ReleasePatch,story2915GenerationValid,story2915NewApprovalValid,story2915DispatchFence,story2915HeldApprovalRecoveryReady,story2915HeldRecoveryReceiptValid} from "./story-expired-generation-2915.mjs";
import {assessFreshSupabasePublish} from "./approved-publish-flow.mjs";
import {releaseFactoryHoldInSupabase} from "./factory-hold-release.mjs";
const sha="e9f4ad61913fe88aad28bcf6df5643bd8586c74c34ab0b2fe1c9b2d37c3a747f",old="18116418158139610",url="https://media.chicagoshining.com/studio/previews/repairs/issue2915/miami-1018/po5628-e9f4ad61913fe88a.mp4",drive="https://drive.google.com/file/d/1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV/view",actor="rec12345678901234",at="2026-11-24T13:10:00Z",profile="recpNlNn6U6eq0M9r",schedule="2026-12-01T13:30:00Z";
const row=()=>({id:"f68a570b-98e2-4537-97a5-d8516653ca95",airtable_record_id:id,output_number:5628,content_item_id:"d1ad9498-36fd-4e28-b398-d0a8aa4a6c54",content_profile_id:"65e9071a-d2fd-4898-88a4-111bf8a3bfb5",platform:"Instagram",platform_output_type:"Instagram Story",output_status:"Ready for Review",review_status:"Review Sent",publish_status:"Not Ready",render_status:"Rendered",do_not_publish:true,auto_publish_enabled:false,publish_retry_eligible:false,publish_hold_source:"issue2915_review_and_provider_reconciliation",updated_at:"2026-11-24T12:59:46Z",studio_preview_url:url,final_file_url:drive,output_caption:"Vizcaya",error_messages:{IG_Story_Container_ID:old,IG_Story_Status:"Failed",IG_Story_Attempt_Count:2,Studio_Publish_Dispatch_Count:2,Studio_Publish_Dispatch_At:"2026-11-17T10:41:51Z",IG_Story_Asset_URL:"https://old.example/video.mp4",SM_Issue2915_Story_Audio_Repair:{candidate_sha256:sha,candidate_bytes:8368028,candidate_drive_id:"1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV",provider_container_preserved:old,new_upload_authorized:false,prior_error_messages:{IG_Story_Container_ID:old}},SM_Issue2915_Story_Provider_Reconciliation:{verified_at:"2026-11-24T12:57:16Z",account_owned:true,account_username:"miamishining",original_container_id:old,original_container_status:"EXPIRED",current_story_scan_complete:true,current_story_count:0,candidate_sha256:sha,provider_writes:0,new_upload_authorized:false,historical_nonpublication_proven:false,owner_previously_reported_not_published:true}}});
const auth={authenticated:true,authorized:true,permissions:{outputs_review:true,publishing_control:true},user:{record_id:actor},authorized_profile_ids:[profile]};
const record=r=>({id,fields:{...r.error_messages,Output_ID:5628,Platform:"Instagram",Platform_Output_Type:"Instagram Story",Studio_Output_Type:"Story",Output_Status:r.output_status,Review_Status:r.review_status,Publish_Status:r.publish_status,Render_Status:r.render_status,Do_Not_Publish:r.do_not_publish,Auto_Publish_Enabled:r.auto_publish_enabled,Output_Caption:r.output_caption,Final_File_URL:r.final_file_url,Studio_Preview_URL:r.studio_preview_url,Publish_Asset_URL:r.publish_asset_url,Scheduled_Post_Date:r.scheduled_post_date}});
test("exact corrected revision requires complete provider proof and no existing publication",()=>{
 assert.equal(story2915ReleaseReady(row()),true);
 for(const mutate of [r=>{r.studio_preview_url="other"},r=>{r.published_at=at},r=>{r.error_messages.IG_Story_Post_ID="post"},r=>{r.error_messages.SM_Issue2915_Story_Provider_Reconciliation.original_container_status="PUBLISHED"},r=>{r.error_messages.SM_Issue2915_Story_Provider_Reconciliation.owner_previously_reported_not_published=false},r=>{r.error_messages.Copyright_Hold=true},r=>{r.content_profile_id="other"},r=>{r.error_messages.Studio_Publish_Dispatch_Count=3}]){
  const r=row();mutate(r);assert.equal(story2915ReleaseReady(r),false);
 }
});
test("release archives original identity and attempts; current asset is new and no publish is authorized",()=>{
 const original=row(),patch=story2915ReleasePatch(original,actor,at),next={...original,...patch};
 assert.equal(original.error_messages.IG_Story_Container_ID,old);
 assert.equal(next.error_messages.IG_Story_Container_ID,undefined);
 assert.equal(next.error_messages.Studio_Publish_Dispatch_Count,undefined);
 assert.equal(next.error_messages.SM_Issue2915_Story_Replacement_Generation.original_attempts.IG_Story_Container_ID,old);
 assert.equal(next.error_messages.SM_Issue2915_Story_Replacement_Generation.original_attempts.Studio_Publish_Dispatch_Count,2);
 assert.equal(next.publish_asset_url,url);assert.equal(story2915GenerationValid(next),true);
 assert.equal(story2915NewApprovalValid(next,actor,"2026-11-24T13:00:00Z"),false);
 assert.equal(story2915NewApprovalValid(next,actor,at),true);
 assert.throws(()=>story2915DispatchFence(record(next)),/Fresh authenticated/);
});
test("only separately approved exact revision reaches new due-time fence",()=>{
 const r={...row(),...story2915ReleasePatch(row(),actor,at),do_not_publish:false,auto_publish_enabled:true,output_status:"Approved for Publishing",review_status:"Approved",publish_status:"Ready to Schedule",scheduled_post_date:schedule};
 r.error_messages.SM_Factory_Supabase_Approval_Receipt={authority:"supabase",output_record_id:id,output_number:5628,actor_provenance:"authenticated_factory_submission",approval_actor_record_id:actor,approved_at:"2026-11-24T13:15:00Z",scheduled:true,scheduled_for:schedule};
 const rec=record(r),nowMs=Date.parse(schedule);
 assert.equal(assessFreshSupabasePublish(rec,{nowMs}).eligible,true);
 assert.equal(assessFreshSupabasePublish(rec,{nowMs:nowMs-1}).reason,"future_schedule");
 assert.equal(story2915DispatchFence(rec),"studio/state/initial-publish-fence/v1/"+id+"/vizcaya-"+sha+".json");
 const tampered=structuredClone(rec);tampered.fields.IG_Story_Container_ID=old;
 assert.equal(assessFreshSupabasePublish(tampered,{nowMs}).eligible,false);
 delete rec.fields.SM_Issue2915_Story_Replacement_Generation;assert.equal(assessFreshSupabasePublish(rec,{nowMs}).eligible,false);
});
test("authenticated release verifies media before CAS and leaves review pending",async()=>{
 let r=row(),writes=0,checked=0;
 const ops={read:async()=>new Map([[id,{row:r,record:record(r),profileId:profile}]]),verifyGallery:async()=>{},verifyImages:async x=>x,verifyStory:async()=>{checked++},rest:async(_e,_q,o)=>{assert.equal(checked,1);writes++;r={...r,...o.body,publish_hold_released_at:at};return [r];}};
 const result=await releaseFactoryHoldInSupabase({},id,auth,ops);
 assert.equal(writes,1);assert.equal(r.do_not_publish,false);assert.equal(r.auto_publish_enabled,false);assert.equal(r.review_status,"Review Sent");assert.equal(result.approved,false);assert.equal(result.published,false);assert.equal(r.publish_asset_url,url);
 r=row();writes=0;ops.verifyStory=async()=>{throw Error("hash mismatch")};await assert.rejects(releaseFactoryHoldInSupabase({},id,auth,ops),/hash mismatch/);assert.equal(writes,0);
});

test("existing held approval recovered only with exact owner authorization, no invented Factory submission",()=>{
 const reviewed=row(),heldAt="2026-11-24T13:19:27.223Z",reconciledAt="2026-11-24T13:30:00Z",owner="recaKAksAFrEv21RO",authRef="https://github.com/jtl6713/SM-Pipeline-V2/issues/2915#issuecomment-7132839239";
 reviewed.output_status="Approved for Publishing";reviewed.review_status="Approved";
 reviewed.error_messages.SM_Factory_Held_Review_Receipt={at:heldAt,actor:"owner@example.test",decision:"approve",publishing_authorized:false,publishing_hold_preserved:true,incident_creative_only:false,publish_state_at_decision:"Not Ready"};
 assert.equal(story2915ReleaseReady(reviewed),false);
 assert.equal(story2915HeldApprovalRecoveryReady(reviewed),true);
 const altered=structuredClone(reviewed);altered.error_messages.SM_Factory_Held_Review_Receipt.decision="reject";
 assert.equal(story2915HeldApprovalRecoveryReady(altered),false);
 const p=story2915ReleasePatch(row(),owner,reconciledAt);
 const next={...reviewed,...p,do_not_publish:false,auto_publish_enabled:true,publish_status:"Ready to Schedule",scheduled_post_date:schedule};
 const b=next.error_messages;
 b.SM_Factory_Held_Review_Receipt=reviewed.error_messages.SM_Factory_Held_Review_Receipt;
 b.SM_Issue2915_Story_Replacement_Generation.release_actor_provenance="owner_directed_recovery";
 b.SM_Issue2915_Held_Approval_Recovery={authorization_ref:authRef,authority:"owner_directed_recovery",actor_record_id:owner,original_held_review_at:heldAt,asset_sha256:sha,original_container_id:old,reconciled_at:reconciledAt,no_new_factory_submission:true};
 b.SM_Factory_Supabase_Approval_Receipt={authority:"supabase",output_record_id:id,output_number:5628,actor_provenance:"authenticated_held_review_owner_directed_recovery",approval_actor_record_id:owner,original_held_review_at:heldAt,approved_at:reconciledAt,scheduled:true,scheduled_for:schedule,request_id:"issue2915-held-review-recovery-5628",profile_record_id:"recpNlNn6U6eq0M9r"};
 const rec=record(next);assert.equal(story2915HeldRecoveryReceiptValid(rec),true);assert.equal(assessFreshSupabasePublish(rec,{nowMs:Date.parse(schedule)}).eligible,true);
 assert.equal(assessFreshSupabasePublish(rec,{nowMs:Date.parse(schedule)-1}).reason,"future_schedule");
 for(const mutate of [f=>{delete f.SM_Factory_Held_Review_Receipt},f=>{f.SM_Issue2915_Held_Approval_Recovery.authorization_ref="wrong"},f=>{f.SM_Factory_Supabase_Approval_Receipt.approval_actor_record_id=actor},f=>{f.SM_Issue2915_Story_Replacement_Generation.release_actor_provenance="unknown"},f=>{f.SM_Factory_Held_Review_Receipt.at=at},f=>{f.IG_Story_Container_ID=old}]){
  const bad=structuredClone(rec);mutate(bad.fields);assert.equal(assessFreshSupabasePublish(bad,{nowMs:Date.parse(schedule)}).eligible,false);
 }
});
