import test from "node:test";
import assert from "node:assert/strict";
import {nycScheduleRepairEligible,nycMaeSchedulePatch,nycMaeExactSelector} from "./issue3159-nyc-mae-repair.mjs";
const id="recQHBwfiX0wj2NKo";
const entry=()=>({profileId:"recgtK8Z7eNADNtVy",profileUuid:"63c2e81b-0cd1-423d-a033-11366e69bdee",profileTimeZone:"America/New_York",row:{
 id:"uuid",updated_at:"2026-11-28T15:00:00Z",airtable_record_id:id,output_number:11110,content_item_airtable_id:"recycKXsZHbHYj7B0",platform:"Instagram",platform_output_type:"Instagram Carousel",render_status:"Native Photo Route",output_status:"Approved for Publishing",review_status:"Approved",publish_status:"Ready to Schedule",publish_method:"Automated",do_not_publish:false,auto_publish_enabled:true,scheduled_post_date:"2026-11-28T16:30:00Z",studio_scheduled_at:null,error_messages:{Existing_Evidence:"preserve"}}});
test("only exact two unattempted NYC records, never historical dispatch",()=>{
 const e=entry();assert.equal(nycScheduleRepairEligible(e,id),true);
 for(const p of [{do_not_publish:true},{publish_hold_reason:"hold"},{studio_scheduled_at:"2026-11-28T16:30:00Z"},{published_at:"2026-11-28T15:00:00Z"},{error_messages:{Studio_Publish_Dispatch_Count:1}},{error_messages:{IG_Carousel_Parent_Container_ID:"123"}},{error_messages:{Studio_3159_NYC_MAE_Repair_Receipt:{state:"pending_commit"}}}]){
  assert.equal(nycScheduleRepairEligible({...e,row:{...e.row,...p}},id),false);
 }
 assert.equal(nycScheduleRepairEligible(e,"rec4mFjnWYzj1rLI0"),false);
 assert.equal(nycScheduleRepairEligible({...e,profileId:"wrong"},id),false);
});
test("schedule only, exact CAS includes observed hold and provider evidence",()=>{
 const r=entry().row,plan={ok:true,scheduled_for:"2026-11-30T16:30:00Z",receipt:{version:"3159-nyc-mae-v1"}};
 const p=nycMaeSchedulePatch(r,plan,"pending_commit",Date.parse("2026-11-28T16:00:00Z"));
 assert.equal(p.scheduled_post_date,p.studio_scheduled_at);
 assert.equal(p.error_messages.Existing_Evidence,"preserve");
 assert.equal(p.error_messages.Studio_3159_NYC_MAE_Repair_Receipt.state,"pending_commit");
 for(const k of ["do_not_publish","auto_publish_enabled","publish_status","review_status","publish_retry_eligible"])assert.equal(Object.hasOwn(p,k),false);
 const q=nycMaeExactSelector(r);for(const k of ["error_messages","publish_hold_reason","published_at","studio_scheduled_at"])assert.ok(q.includes(k+"="));
});
