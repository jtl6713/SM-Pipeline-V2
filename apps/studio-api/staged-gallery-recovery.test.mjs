import test from "node:test";
import assert from "node:assert/strict";
import { stagedGalleryCandidate,GALLERY_STAGE_CUTOFF } from "./staged-gallery-recovery.mjs";
const id="rec12345678901234", profile="rec12345678901235";
const now=GALLERY_STAGE_CUTOFF+600000;
const fresh=()=>({profileId:profile,profileUuid:"profile-uuid",row:{airtable_record_id:id,content_item_id:"content",platform:"Instagram",platform_output_type:"Instagram Carousel",studio_output_type:"Carousel",render_status:"Native Photo Route",review_status:"Approved",output_status:"Approved for Publishing",publish_status:"Ready to Publish",publish_method:"Automated",do_not_publish:false,auto_publish_enabled:true,scheduled_post_date:new Date(now-1000).toISOString(),studio_scheduled_at:new Date(now-1000).toISOString(),asset_set_revision:"r1"},record:{id,fields:{Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",Review_Status:"Approved",Output_Status:"Approved for Publishing",Publish_Status:"Ready to Publish",Do_Not_Publish:false,Auto_Publish_Enabled:true,Scheduled_Post_Date:new Date(now-1000).toISOString(),Image_Count:4,Assets_Ready_Count:4,Output_Caption:"Verified gallery",IG_Carousel_Status:"Ready for Asset Prep"}}});
const proof=e=>({version:"3159-gallery-v1",output_record_id:id,profile_id:profile,due_ms:Date.parse(e.row.scheduled_post_date),asset_revision:"r1",started_ms:now-500});
test("only fresh exact approved native slot enters prep",()=>{
 const e=fresh(); assert.equal(stagedGalleryCandidate(e,now).stage,"ap0c");
 for(const [k,v] of [["do_not_publish",true],["auto_publish_enabled",false],["studio_scheduled_at",null],["test_run_id","test"],["platform_post_url","https://example.org"],["publish_method","Manual"]]){
  const x=fresh();x.row[k]=v;assert.equal(stagedGalleryCandidate(x,now).ok,false,k);
 }
 const x=fresh();x.row.scheduled_post_date=x.row.studio_scheduled_at=new Date(GALLERY_STAGE_CUTOFF-1).toISOString();
 assert.equal(stagedGalleryCandidate(x,now).ok,false);
 assert.equal(stagedGalleryCandidate(e,now+300000).ok,false);
 e.record.fields.Studio_Publish_Dispatch_Count=1;assert.equal(stagedGalleryCandidate(e,now).ok,false);
});
test("continuation requires exact stage-one marker and excludes ambiguous retry",()=>{
 const e=fresh(),m=proof(e);e.row.ig_carousel_status="Assets Ready";
 assert.equal(stagedGalleryCandidate(e,now,m).stage,"ap1c");
 assert.equal(stagedGalleryCandidate(e,now,{...m,profile_id:"wrong"}).ok,false);
 assert.equal(stagedGalleryCandidate(e,now,{...m,asset_revision:"r2"}).ok,false);
 e.row.ig_carousel_status="Retry Pending";assert.equal(stagedGalleryCandidate(e,now,m).ok,false);
 e.row.ig_carousel_status="Publishing";assert.equal(stagedGalleryCandidate(e,now,m).ok,false);
 e.record.fields.IG_Carousel_Published_Media_ID="123456789";assert.equal(stagedGalleryCandidate(e,now,m).stage,"ap5c");
});
test("Facebook route is exact collage only; held review and conflicting IDs never admitted",()=>{
 const e=fresh();e.row.platform="Facebook";e.row.platform_output_type="Facebook Photo Set";e.row.studio_output_type="Multi-Image Post";e.row.fb_resolved_publish_mode="Multi-Photo Collage";
 e.record.fields.Platform="Facebook";e.record.fields.Platform_Output_Type="Facebook Photo Set";delete e.record.fields.IG_Carousel_Status;
 assert.equal(stagedGalleryCandidate(e,now).stage,"fb0");
 e.row.fb_resolved_publish_mode="Slideshow Reel";assert.equal(stagedGalleryCandidate(e,now).ok,false);
 e.row.fb_resolved_publish_mode="Multi-Photo Collage";e.record.fields.Studio_Render_Review_Hold_Active=true;assert.equal(stagedGalleryCandidate(e,now).ok,false);
});
