import test from "node:test";
import assert from "node:assert/strict";
import { stagedReceiptPatch,runStagedPublicReceiptRecovery } from "./staged-public-receipt-recovery.mjs";
const now=Date.parse("2026-11-28T15:10:00Z"),id="rec12345678901234",profile="rec12345678901235";
const fixture=()=>({
 entry:{profileId:profile,row:{id:"uuid",airtable_record_id:id,content_profile_id:"p-uuid",content_item_id:"c-uuid",platform:"Instagram",platform_output_type:"Instagram Carousel",output_status:"Approved for Publishing",review_status:"Approved",publish_status:"Publishing",do_not_publish:false,auto_publish_enabled:true,updated_at:new Date(now-1000).toISOString(),error_messages:{IG_Carousel_Published_Media_ID:"123456789"}}},
 source:{profile_id:profile,row:{id,fields:{Content_Profile:[profile],Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",Review_Status:"Approved",Output_Status:"Approved for Publishing",Publish_Status:"Publishing",Do_Not_Publish:false,IG_Carousel_Published_Media_ID:"123456789"}}},
 receipt:{verified_public:true,verified_delivery:true,ownership_verified:true,platform:"Instagram",profile_id:profile,remote_id:"123456789",permalink:"https://www.instagram.com/p/abc/",published_at:new Date(now-2000).toISOString(),checked_at:new Date(now).toISOString(),evidence:"verified"}});
test("only verified exact existing public receipt creates canonical status patch",()=>{
 const {entry,source,receipt}=fixture(),result=stagedReceiptPatch(entry,source,receipt,now);
 assert.equal(result.ok,true);assert.equal(result.body.publish_status,"Published");assert.equal(result.body.ig_carousel_status,"Published");
 assert.equal(result.body.error_messages.SM_3159_Verified_Public_Receipt.provider_writes,0);
 for(const k of ["review_status","do_not_publish","auto_publish_enabled","scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","platform_publish_response"])assert.equal(Object.hasOwn(result.body,k),false);
 for(const change of [{verified_public:false},{ownership_verified:false},{remote_id:"999999999"},{profile_id:"wrong"},{checked_at:new Date(now-61000).toISOString()}])
  assert.equal(stagedReceiptPatch(entry,source,{...receipt,...change},now).ok,false);
 entry.row.do_not_publish=true;assert.equal(stagedReceiptPatch(entry,source,receipt,now).ok,false);
});
test("provider GET failure never writes or retries within hour",async()=>{
 const {entry,source,receipt}=fixture();let gets=0,writes=0;const objects=new Map();
 const bucket={get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null,put:async(k,v)=>{if(objects.has(k))return null;objects.set(k,v);return {ok:true};}};
 const deps={bucket,now:()=>now,rest:async(q,o)=>{if(o?.method==="PATCH")writes++;return [{airtable_record_id:id}];},read:async()=>entry,readSource:async()=>source,verifyRemote:async()=>{gets++;return {...receipt,verified_public:false};},lock:async(_,fn)=>fn()};
 assert.equal((await runStagedPublicReceiptRecovery(deps)).status,"unverified_no_write");
 assert.equal((await runStagedPublicReceiptRecovery(deps)).status,"no_eligible_receipt");
 assert.equal(gets,1);assert.equal(writes,0);
});
