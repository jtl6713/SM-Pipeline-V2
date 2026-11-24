import test from "node:test";
import assert from "node:assert/strict";
import {inspectFactoryNativeSlideInventory, readFactoryNativeSlideInventory} from "./supabase-pipeline-reads.mjs";
const p={airtable_record_id:"recg1e2fiwy8wnPpG",output_number:11137,selected_clip_count:2,render_status:"Native Photo Route",output_status:"Ready for Review",studio_output_type:"Multi-Image Post",do_not_publish:false};
const slide=i=>({current_order:i,deleted_from_carousel:false,fields:{"Platform Output":[p.airtable_record_id],PO_Output_ID:[p.output_number],"Final Image URL":"https://media.chicagoshining.com/studio/previews/test/slide"+i+".jpg"}});
test("gallery readiness fails closed for missing, partial, unavailable and wrong-owner inventory",()=>{
 assert.equal(inspectFactoryNativeSlideInventory(p,[]).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(1)]).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory(p,null).verified,false);
 const foreign=slide(2);foreign.fields["Platform Output"]=["recForeignOutput00"];
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(1),foreign]).verified,false);
 const duplicate=slide(2);duplicate.fields["Final Image URL"]=slide(1).fields["Final Image URL"];
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(1),duplicate]).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(2),slide(1)]).verified,true);
});
test("bounded inventory read excludes video and held candidates, returns exact output status",async()=>{
 const calls=[];
 const result=await readFactoryNativeSlideInventory({},[p,{...p,airtable_record_id:"recOtherOutput001",studio_output_type:"Reel"},{...p,airtable_record_id:"recHeldOutput0001",do_not_publish:true}],{read:async path=>{calls.push(path);return [slide(1),slide(2)];}});
 assert.equal(calls.length,1);assert.match(calls[0],/carousel_slides/);
 assert.equal(result.size,1);assert.equal(result.get(p.airtable_record_id).verified,true);
 const unavailable=await readFactoryNativeSlideInventory({},[p],{read:async()=>{throw Error("timeout")}});
 assert.equal(unavailable.get(p.airtable_record_id).verified,false);
});

test("human-resolved native gallery returns to Needs Eyes without authorizing publication",()=>{
 const receipt={actor_record_id:"recAAAAAAAAAAAAAA",at:"2026-11-24T05:12:34.927Z",package_sha256:"a".repeat(64),slide_count:2,formal_approval_pending:true,human_images_caption_branding_rights_confirmed:true,publishing_authorized:false};
 const parent={...p,review_status:"Review Sent",publish_status:"Not Ready",auto_publish_enabled:false,error_messages:{
  SM_Factory_Review_Resolve_2907:receipt,
  SM_Chicago_Gallery_Repair_2890:{stage:"human_review_verified",visual_qa_pending:false,publishing_authorized:false},
  SM_Native_Gallery_Preflight_Hold_2294:{issue_number:2294,verification_status:"resolved_for_formal_factory_review",publishing_authorized:false}
 }};
 const make=(i)=>{
  const s=slide(i),sha=String(i).repeat(64);
  s.airtable_record_id="sb-native:2294:"+p.output_number+":"+String(i).padStart(2,"0");
  Object.assign(s.fields,{"Slide Number":i,"Approved For Final":true,Shared_Asset_Approved:true,"Review Status":"Final Approved",Asset_4x5_Public_Status:"Ready",Asset_4x5_Public_URL:s.fields["Final Image URL"],
   SM_Native_Gallery_Draft_Repair_2294:{publishing_authorized:false,final_creative_approved:true,output_number:p.output_number,slide_order:i,rights_status:"Owned",image_http_verified:true,image_geometry_verified:true,verified_dimensions:"1080x1350",public_sha256:sha},
   SM_Chicago_Gallery_Repair_2890:{brand_verified:true,source_owner_rights_verified:true,visual_qa_pending:false,publishing_authorized:false,verified_branded_sha256:sha},
   SM_Factory_Review_Resolve_2907:{actor_record_id:receipt.actor_record_id,at:receipt.at,package_sha256:receipt.package_sha256,slide_sha256:sha,human_images_caption_branding_rights_confirmed:true,publishing_authorized:false}});
  return s;
 };
 const complete=[make(1),make(2)];
 assert.equal(inspectFactoryNativeSlideInventory(parent,complete).verified,true);
 assert.equal(inspectFactoryNativeSlideInventory({...parent,error_messages:{}},complete).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory({...parent,do_not_publish:true},complete).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory({...parent,auto_publish_enabled:true},complete).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory({...parent,scheduled_post_date:"2026-12-01"},complete).verified,false);
 const mismatch=make(2);mismatch.fields.SM_Factory_Review_Resolve_2907.package_sha256="b".repeat(64);
 assert.equal(inspectFactoryNativeSlideInventory(parent,[make(1),mismatch]).verified,false);
 const pending=make(2);pending.fields["Approved For Final"]=false;
 assert.equal(inspectFactoryNativeSlideInventory(parent,[make(1),pending]).verified,false);
 assert.equal(complete[0].fields.SM_Native_Gallery_Draft_Repair_2294.publishing_authorized,false);
});
