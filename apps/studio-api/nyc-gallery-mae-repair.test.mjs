import test from "node:test";
import assert from "node:assert/strict";
import {nycGalleryRepairGuard,planNycGalleryRepair,nycGallerySchedulePatch,nycGalleryExactSelector} from "./nyc-gallery-mae-repair.mjs";
const id="recQHBwfiX0wj2NKo", profile="63c2e81b-0cd1-423d-a033-11366e69bdee";
const now=Date.parse("2026-11-28T16:15:00Z");
function entry(){
 const row={id:"row-1",airtable_record_id:id,output_number:11110,content_profile_id:profile,content_item_airtable_id:"recycKXsZHbHYj7B0",platform:"Instagram",platform_output_type:"Instagram Carousel",studio_output_type:"Carousel",render_status:"Native Photo Route",output_status:"Approved for Publishing",review_status:"Approved",publish_status:"Ready to Schedule",publish_method:"Automated",do_not_publish:false,auto_publish_enabled:true,scheduled_post_date:"2026-11-28T16:30:00Z",studio_scheduled_at:null,error_messages:{},updated_at:"2026-11-28T16:00:00Z"};
 return {row,profileUuid:profile,record:{id,fields:{Output_Status:row.output_status,Review_Status:row.review_status,Publish_Status:row.publish_status,Do_Not_Publish:false,Auto_Publish_Enabled:true,Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",Scheduled_Post_Date:row.scheduled_post_date,IG_Carousel_Status:"Ready for Asset Prep",Output_Caption:"Gallery"}}};
}
test("exact unattempted schedule-only repair permits incomplete media without authorizing publication",()=>{
 const e=entry();assert.equal(nycGalleryRepairGuard(e,now).ok,true);
 for(const fields of [{Studio_Publish_Dispatch_Count:1},{Publish_Attempt_Count:1},{IG_Carousel_Parent_Container_ID:"123456789"},{Platform_Post_ID:"123456789"},{Publish_Locked_At:"2026-11-27T10:00:00Z"}]){
   const x=entry();Object.assign(x.record.fields,fields);assert.equal(nycGalleryRepairGuard(x,now).ok,false);
 }
 for(const patch of [{studio_scheduled_at:e.row.scheduled_post_date},{publish_hold_reason:"hold"},{do_not_publish:true},{content_profile_id:"other"},{airtable_record_id:"recSiZREAQuoicqm7"}]){
   const x=entry();Object.assign(x.row,patch);assert.equal(nycGalleryRepairGuard(x,now).ok,false);
 }
});
test("MAE planning requires complete NYC occupancy, future slot and preserves both canonical timestamps",()=>{
 const e=entry(),opts={nowMs:now,timeZone:"America/New_York",horizonDays:30,laneOccupiedMs:[],platformOccupiedMs:[],occupancyComplete:true};
 assert.equal(planNycGalleryRepair(e,{...opts,occupancyComplete:false}).ok,false);
 assert.equal(planNycGalleryRepair(e,{...opts,timeZone:"America/Chicago"}).ok,false);
 const plan=planNycGalleryRepair(e,opts);assert.equal(plan.ok,true);assert.ok(Date.parse(plan.scheduled_for)>now+30*60000);
 const patch=nycGallerySchedulePatch(e.row,plan,"pending_commit",now);
 assert.equal(patch.scheduled_post_date,patch.studio_scheduled_at);
 assert.deepEqual(Object.keys(patch).sort(),["error_messages","scheduled_post_date","studio_scheduled_at","updated_at","youtube_scheduled_publish_at"]);
 assert.match(nycGalleryExactSelector(e.row),/publish_hold_reason=is.null/);
});
