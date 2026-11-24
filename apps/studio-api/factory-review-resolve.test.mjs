import test from "node:test";
import assert from "node:assert/strict";
import {reviewResolveCandidate,inspectResolveOutput,inspectResolveSlides} from "./factory-review-resolve.mjs";
const id="recbzkRN1wyWoBjOn",repair={stage:"owned_branded_draft_materialized",slide_count:4,visual_qa_pending:true,publishing_authorized:false,factory_final_approval:false};
const output={airtable_record_id:id,output_number:11129,selected_clip_count:4,do_not_publish:true,auto_publish_enabled:false,
  output_status:"Ready for Review",render_status:"Native Photo Route",publish_status:"Not Ready",output_caption:"Navy Pier",updated_at:"now",
  error_messages:{SM_Chicago_Gallery_Repair_2890:repair,SM_Native_Gallery_Preflight_Hold_2294:{issue_number:2294,verification_status:"not_yet_verified",publishing_authorized:false}}};
test("exact candidate only; no approval/hold bypass",()=>{
 assert.equal(reviewResolveCandidate(id,11129,true,repair),true);
 assert.equal(reviewResolveCandidate("rec00000000000000",11129,true,repair),false);
 assert.equal(reviewResolveCandidate(id,11129,false,repair),false);
 assert.deepEqual(inspectResolveOutput(output,id),[11129,4]);
 for(const patch of [{scheduled_post_date:"now"},{auto_publish_enabled:true},{publish_status:"Publishing"},
 {error_messages:{...output.error_messages,Factory_Review_Handoff_Safety_Hold_At:"now"}}]){
  assert.throws(()=>inspectResolveOutput({...output,...patch},id));
 }
 assert.throws(()=>inspectResolveSlides(output,[]),/missing or extra/);
});
test("technically unverified slides cannot be finalized by a human checkbox",()=>{
 const wrong=Array.from({length:4},()=>({fields:{}}));
 assert.throws(()=>inspectResolveSlides(output,wrong));
});

const img=n=>"https://media.chicagoshining.com/studio/previews/repairs/issue2890/chicago-2297/slide-"+n+".jpg";
const family=n=>"rec"+String(n).padStart(14,"A");
const drive=n=>"google_drive_variant_id_"+n+"_123456";
const clip=n=>({order:n,url:img(n),mediaAssetRecordId:family(n),googleDriveFileId:drive(n)});
const sha="a".repeat(64);
function fixture(){
 const selected=Array.from({length:4},(_,i)=>clip(i+1));
 const row={...output,studio_output_type:"Carousel",platform_output_type:"Instagram Carousel",
 selected_assets:{selected_clips:selected},render_clip_list:selected};
 const slides=selected.map((c,i)=>({id:"00000000-0000-0000-0000-"+String(i+1).padStart(12,"0"),
 airtable_record_id:"sb-native:2294:11129:"+String(i+1).padStart(2,"0"),current_order:i+1,updated_at:"now",
 deleted_from_carousel:false,fields:{"Platform Output":[id],PO_Output_ID:[11129],"Slide Number":i+1,
 "Final Image URL":c.url,Asset_4x5_Public_URL:c.url,"Google Drive File ID":c.googleDriveFileId,
 Asset_Family_Key:c.mediaAssetRecordId,Asset_4x5_Public_Status:"Ready","Approved For Final":false,
 Shared_Asset_Approved:false,"Review Status":"Pending Review",
 SM_Native_Gallery_Draft_Repair_2294:{output_number:11129,slide_order:i+1,rights_status:"Owned",
 image_http_verified:true,image_geometry_verified:true,verified_dimensions:"1080x1350",public_sha256:sha,
 publishing_authorized:false,final_creative_approved:false},
 SM_Chicago_Gallery_Repair_2890:{brand_verified:true,source_owner_rights_verified:true,verified_branded_sha256:sha,
 visual_qa_pending:true,publishing_authorized:false}}}));
 return {row,slides};
}
test("exact verified pending package can be reviewed without calling approval or publish",()=>{
 const {row,slides}=fixture();const result=inspectResolveSlides(row,slides);
 assert.equal(result.length,4);assert.equal(result[0].image_url,img(1));
 assert.equal(slides[0].fields["Approved For Final"],false);
});
test("foreign output, wrong source hash, missing rights, or missing geometry fail closed",()=>{
 for(const change of [
 s=>{s.fields["Platform Output"]=["recForeignOutput00"];},
 s=>{s.fields.SM_Native_Gallery_Draft_Repair_2294.public_sha256="b".repeat(64);},
 s=>{s.fields.SM_Chicago_Gallery_Repair_2890.source_owner_rights_verified=false;},
 s=>{s.fields.SM_Native_Gallery_Draft_Repair_2294.image_geometry_verified=false;},
 s=>{s.fields["Approved For Final"]=true;}
 ]){const {row,slides}=fixture();change(slides[0]);assert.throws(()=>inspectResolveSlides(row,slides));}
});
