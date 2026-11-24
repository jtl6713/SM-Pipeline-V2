import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectNativeGalleryPublicationPackage,
  nycOwnerGalleryApprovalEligible,
  preflightNycOwnerGalleryApproval,
  finalizeNycOwnerGalleryOnFactoryClick, siblingGalleryReviewEligible, verifySiblingGalleryEvidence,
} from "./native-gallery-package-guard.mjs";

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" };
const image = n => "https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2221/shared-small-bottom-right/slide-0" + n + "-abcdef0123456789.jpg";
const drive = n => "owner-drive-reference-nyc-20261122-" + n;
const family = n => "rec" + String(n).padStart(14, "A");
const actor = "recAuthUser123456";
const pairs = [
  ["recO494MDnQ1Tk51b", 10855, "Instagram", "Instagram Carousel", 4],
  ["recWIWOrdflmqyxKW", 10856, "Facebook", "Facebook Photo Set", 4],
  ["recVoFLCOAGHNIkD3", 10863, "Instagram", "Instagram Carousel", 8],
  ["rechOtaxHOwY18A8F", 10864, "Facebook", "Facebook Photo Set", 8],
  ["rec61JeXiA6Aai1Kk", 10867, "Instagram", "Instagram Carousel", 4],
  ["recttY0sPY2RGkcaq", 10869, "Instagram", "Instagram Carousel", 4],
  ["recUIDBjcY6RgSy0n", 10870, "Facebook", "Facebook Photo Set", 4],
  ["recWq5HIxBT8BCtme", 10875, "Instagram", "Instagram Carousel", 4],
];
function fixture([id, outputNumber, platform, type, slideCount]) {
  const clips = Array.from({length:slideCount}, (_,i)=>i+1).map(n => ({
    order:n, url:image(n), googleDriveFileId:drive(n), mediaAssetRecordId:family(n),
  }));
  const output = {
    airtable_record_id:id, output_number:outputNumber,
    platform, platform_output_type:type,
    studio_output_type:type==="Instagram Carousel"?"Carousel":"Multi-Image Post",
    render_status:"Native Photo Route",output_status:"Ready for Review",
    review_status:"Review Sent", publish_status:"Not Ready",
    selected_clip_count:slideCount, selected_assets:{selected_clips:clips},
    render_clip_list:clips,
    do_not_publish:false, auto_publish_enabled:false,
    publish_hold_released_at:"2026-11-23T02:45:37Z",
    scheduled_post_date:null,studio_scheduled_at:null,
    published_at:null,platform_post_url:null,platform_publish_response:null,
    error_messages:{SM_NYC_AI_Creative_QA_20261122:{
      subject_verified:true,caption_and_hashtag_review:"pass",
      factory_final_approval:false,publishing_authorized:false,
      output_native_slides_checked:slideCount,
    }},
  };
  const slides = Array.from({length:slideCount}, (_,i)=>i+1).map(n=>({
    id:"a0000000-0000-4000-8000-"+String(n).padStart(12,"0"),
    // Mirror the real 2026-11-22 recovery rows: rec + 16 hex, not Airtable rec14.
    airtable_record_id:"rec"+String(n).padStart(16,"a"),
    current_order:n,deleted_from_carousel:false,
    updated_at:"2026-11-23T04:35:40.123456Z",
    fields:{
      "Platform Output":[id],PO_Output_ID:[outputNumber],
      "Slide Number":n,"Final Image URL":image(n),
      "Asset_4x5_Public_URL":image(n),
      "Asset_4x5_Public_Status":"Ready",
      "Asset_Family_Key":family(n),"Google Drive File ID":drive(n),
      "Review Status":"Review Sent","Approved For Final":false,
      Shared_Asset_Approved:false,
      SM_NYC_AI_Creative_QA_20261122:{
        brand_verified:true,source_owner_rights_verified:true,
        publishing_authorized:false,verified_branded_sha256:"a".repeat(64),
      },
    },
  }));
  return {output,slides};
}
function wire(t,slides,{conflictAt=0}={}) {
  const initial=globalThis.fetch,requests=[];
  t.after(()=>{globalThis.fetch=initial;});
  globalThis.fetch=async(url,opts={})=>{
    const u=new URL(url);
    assert.equal(u.origin,"https://example.supabase.co");
    assert.equal(u.pathname,"/rest/v1/carousel_slides");
    const method=opts.method||"GET";
    requests.push({method,url:String(u),body:opts.body});
    if(method==="GET")return Response.json(slides.map(s=>structuredClone(s)));
    assert.equal(method,"PATCH");
    assert.equal(opts.headers?.Prefer,"return=representation");
    const id=String(u.searchParams.get("id")||"").replace("eq.","");
    const target=slides.find(s=>s.id===id);
    assert.ok(target);
    const body=JSON.parse(opts.body);
    assert.equal(u.searchParams.get("updated_at"),"eq."+target.updated_at);
    assert.equal(u.searchParams.get("airtable_record_id"),"eq."+target.airtable_record_id);
    assert.equal(body.fields.SM_Factory_NYC_Final_Slide_Approval_2371.actor_record_id,actor);
    assert.equal(body.fields.SM_Factory_NYC_Final_Slide_Approval_2371.provider_writes,0);
    if(conflictAt===target.current_order)return Response.json([]);
    target.fields=structuredClone(body.fields);
    target.updated_at=body.updated_at;
    return Response.json([target]);
  };
  return requests;
}
for(const pair of pairs){
  test("#2371 "+pair[1]+": owner-released RFR gallery has exact validated slides, no automatic/old-receipt approval",async t=>{
    const {output,slides}=fixture(pair);
    const calls=wire(t,slides);
    assert.equal(nycOwnerGalleryApprovalEligible(output),true);
    assert.equal(inspectNativeGalleryPublicationPackage(output,slides).eligible,false);
    const inspected=await preflightNycOwnerGalleryApproval(env,output);
    assert.equal(inspected.pending,pair[4]);
    assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
    await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
      requestId:"factory-new-20261123",approvedByUserRecordId:null,
    }),/authenticated Factory submitter/);
    assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
    const approved=await finalizeNycOwnerGalleryOnFactoryClick(env,output,{
      requestId:"factory-new-20261123",approvedByUserRecordId:actor,
      submittedAt:"2026-11-23T04:45:00Z",
    });
    assert.equal(approved.eligible,true);
    assert.equal(calls.filter(c=>c.method==="PATCH").length,pair[4]);
    assert.equal(slides.every(s=>s.fields["Approved For Final"]===true),true);
    assert.equal(slides.every(s=>s.fields.Shared_Asset_Approved===true),true);
    assert.equal(output.output_status,"Ready for Review","parent not approved or published by image finalization");
    assert.equal(output.auto_publish_enabled,false);
    const repeat=await finalizeNycOwnerGalleryOnFactoryClick(env,output,{
      requestId:"factory-new-20261124",approvedByUserRecordId:actor,
      submittedAt:"2026-11-24T04:45:00Z",
    });
    assert.equal(repeat.pending,0);
    assert.equal(calls.filter(c=>c.method==="PATCH").length,pair[4],"idempotent with existing actual review evidence");
  });
}
test("#2371 exact six-output recovery: an 8-slide High Line gallery cannot silently become four",async t=>{
  const {output,slides}=fixture(pairs[2]);
  const calls=wire(t,slides);
  assert.equal(nycOwnerGalleryApprovalEligible(output),true);
  slides.splice(4,4);
  await assert.rejects(preflightNycOwnerGalleryApproval(env,output),/native_gallery_slide_count_mismatch/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
});
test("#2371 exact six-output recovery: mismatched QA slide count is ineligible",async t=>{
  const {output,slides}=fixture(pairs[3]);
  const calls=wire(t,slides);
  output.error_messages.SM_NYC_AI_Creative_QA_20261122.output_native_slides_checked=4;
  assert.equal(nycOwnerGalleryApprovalEligible(output),false);
  assert.equal(await preflightNycOwnerGalleryApproval(env,output),null);
  assert.equal(calls.length,0);
});
test("#2371 exact six-output recovery: prior hold release is required for eight slides",async t=>{
  const {output,slides}=fixture(pairs[2]);
  const calls=wire(t,slides);
  output.publish_hold_released_at="2026-11-23T05:00:00Z";
  await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
    requestId:"factory-old-before-release",approvedByUserRecordId:actor,
    submittedAt:"2026-11-23T04:59:59Z",
  }),/AFTER the owner hold release/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
});
test("#2371 rejects a forged/malformed recovered slide identity before any writes",async t=>{
  const {output,slides}=fixture(pairs[0]);
  slides[0].airtable_record_id="rec-fake-slide-id";
  const calls=wire(t,slides);
  await assert.rejects(preflightNycOwnerGalleryApproval(env,output),/independent slide evidence\/decision invalid/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
  assert.equal(output.output_status,"Ready for Review");
});
test("#2371 the actual recovered 19-character slide IDs do not authenticate a user",async t=>{
  const {output,slides}=fixture(pairs[0]);
  const calls=wire(t,slides);
  const validated=await preflightNycOwnerGalleryApproval(env,output);
  assert.equal(validated.pending,4);
  await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
    requestId:"factory-new-20261123",approvedByUserRecordId:slides[0].airtable_record_id,
    submittedAt:"2026-11-23T04:45:00Z",
  }),/authenticated Factory submitter/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
});
test("#2371 pending slides cannot be finalized while hold is active",async t=>{
  const {output,slides}=fixture(pairs[0]);output.do_not_publish=true;
  const calls=wire(t,slides);
  assert.equal(await preflightNycOwnerGalleryApproval(env,output),null);
  assert.equal(await finalizeNycOwnerGalleryOnFactoryClick(env,output,{
    requestId:"factory-new-20261123",approvedByUserRecordId:actor,
      submittedAt:"2026-11-23T04:45:00Z",
  }),null);
  assert.equal(calls.length,0);
});
test("#2371 source/media identity drift blocks all writes",async t=>{
  const {output,slides}=fixture(pairs[1]); slides[1].fields["Final Image URL"]=image(1);
  const calls=wire(t,slides);
  await assert.rejects(preflightNycOwnerGalleryApproval(env,output),/public_image_or_manifest_mismatch/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
});
test("#2371 inherited QA does not authorize publication or an anonymous approval",async t=>{
  const {output,slides}=fixture(pairs[0]); const calls=wire(t,slides);
  await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
    requestId:"factory-new-20261123",approvedByUserRecordId:"unverified-service",
  }),/authenticated Factory submitter/);
  output.error_messages.Studio_Publish_Dispatch_Count=1;
  assert.equal(nycOwnerGalleryApprovalEligible(output),false,"unknown historic provider attempt must reconcile");
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
});
test("#2371 concurrent slide edit fails closed and never authorizes parent publication",async t=>{
  const {output,slides}=fixture(pairs[0]); const calls=wire(t,slides,{conflictAt:2});
  await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
    requestId:"factory-new-20261123",approvedByUserRecordId:actor,
      submittedAt:"2026-11-23T04:45:00Z",
  }),/changed during authenticated final approval/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,2);
  assert.equal(slides[0].fields["Approved For Final"],true,"first authored slide receipt retained");
  assert.equal(slides[1].fields["Approved For Final"],false);
  assert.equal(output.output_status,"Ready for Review");
  assert.equal(output.auto_publish_enabled,false);
});
test("#2371 no other gallery gets this owner-only human-finalization bridge",async t=>{
  const {output,slides}=fixture(pairs[0]);output.airtable_record_id="recUnrelated123456";
  const calls=wire(t,slides);
  assert.equal(nycOwnerGalleryApprovalEligible(output),false);
  assert.equal(await preflightNycOwnerGalleryApproval(env,output),null);
  assert.equal(calls.length,0);
});

test("#2371 historic Factory batch predating owner hold release cannot final-approve corrected slides",async t=>{
  const {output,slides}=fixture(pairs[1]);const calls=wire(t,slides);
  await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
    requestId:"old-failed-factory-request",approvedByUserRecordId:actor,
    submittedAt:"2026-11-22T05:44:56Z",
  }),/AFTER the owner hold release/);
  assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
});

function siblingFixture(){
 const {output:source,slides:originalSlides}=fixture(pairs[4]);
 const content="86536e0c-aa7a-4b43-86e9-0a56bc1b19d8",profile="63c2e81b-0cd1-423d-a033-11366e69bdee";
 Object.assign(source,{id:"d2151602-797a-4df5-b256-0ba4e8dc8b34",content_item_id:content,
 content_profile_id:profile,aspect_ratio:"4:5",output_title:"Gantry Plaza Sunset",output_caption:"Queens waterfront"});
 const marker={at:"2026-11-24T11:52:58Z",source_output:10867,human_approval_required:true,provider_writes:0};
 const output={...structuredClone(source),id:"abeab297-98df-4546-8ad0-c34415bbe5a2",
 airtable_record_id:"recCdLDCXYXKZr13y",output_number:10868,platform:"Facebook",
 platform_output_type:"Facebook Photo Set",studio_output_type:"Multi-Image Post",
 error_messages:{SM_Quality_Exact_Sibling_Media_20261124:marker}};
 const slides=originalSlides.map((row,i)=>{
   const q=row.fields.SM_NYC_AI_Creative_QA_20261122;
   const g={geometry:"1080x1350",cdn_sha256_verified:true,verified_branded_url:row.fields["Final Image URL"],
     branded_sha256:q.verified_branded_sha256};
   row.fields.SM_NYC_Shared_Small_Watermark_20261122=g;
   return {...structuredClone(row),id:"b0000000-0000-4000-8000-"+String(i+1).padStart(12,"0"),
     airtable_record_id:"rec"+String(i+1).padStart(16,"b"),fields:{...row.fields,
       "Platform Output":[output.airtable_record_id],PO_Output_ID:[10868],
       SM_NYC_AI_Creative_QA_20261122:undefined,
       SM_Quality_Exact_Sibling_Media_20261124:{source_output:10867,source_slide_id:row.airtable_record_id,
         prior_verified_media_evidence:q,prior_verified_geometry_and_hash:g,
         requires_new_human_approval:true,provider_writes:0}}};
 });
 const assets=slides.map(row=>({airtable_record_id:row.fields.Asset_Family_Key,active:true,do_not_use:false,
 asset_status:"Available",metadata:{rights_status:"Owned"}}));
 return {output,source,slides,originalSlides,assets};
}
test("#2915 verified sibling repair is not limited to historical output-number allowlist",()=>{
 const {output,source,slides,originalSlides,assets}=siblingFixture();
 assert.equal(nycOwnerGalleryApprovalEligible(output),false);
 assert.equal(siblingGalleryReviewEligible(output),true);
 assert.equal(verifySiblingGalleryEvidence(output,source,slides,originalSlides,assets),true);
 // A new repair may use the same versioned certificate without adding IDs to source.
 output.error_messages.SM_Quality_Exact_Sibling_Media_v1=output.error_messages.SM_Quality_Exact_Sibling_Media_20261124;
 delete output.error_messages.SM_Quality_Exact_Sibling_Media_20261124;
 assert.equal(verifySiblingGalleryEvidence(output,source,slides,originalSlides,assets),true);
});
test("#2915 sibling evidence fails on profile, caption, source identity, rights and changed byte proof",()=>{
 const {output,source,slides,originalSlides,assets}=siblingFixture();
 for(const wrong of [{...source,content_profile_id:"foreign"},{...source,output_caption:"different"},
 {...source,content_item_id:"wrong"},{...source,output_number:99999},{...source,aspect_ratio:"9:16"}]){
  assert.equal(verifySiblingGalleryEvidence(output,wrong,slides,originalSlides,assets),false);
 }
 assert.equal(verifySiblingGalleryEvidence(output,source,slides,originalSlides,
  [{...assets[0],do_not_use:true},...assets.slice(1)]),false);
 const wrong=structuredClone(slides);wrong[0].fields.SM_Quality_Exact_Sibling_Media_20261124.source_slide_id="wrong";
 assert.equal(verifySiblingGalleryEvidence(output,source,wrong,originalSlides,assets),false);
 assert.equal(siblingGalleryReviewEligible({...output,do_not_publish:true}),false);
 assert.equal(siblingGalleryReviewEligible({...output,error_messages:{...output.error_messages,Publish_Attempt_Count:1}}),false);
});
test("#2915 old click cannot approve a newly repaired sibling revision even after earlier release",async t=>{
 const {output,source,slides,originalSlides,assets}=siblingFixture();
 const original=globalThis.fetch;let writes=0;
 t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async(url,opts={})=>{
  const u=new URL(url);
  if(opts.method==="PATCH"){writes++;throw Error("must not write");}
  if(u.pathname.endsWith("/platform_outputs"))return Response.json([source]);
  if(u.pathname.endsWith("/media_assets"))return Response.json(assets);
  if(u.pathname.endsWith("/carousel_slides"))return Response.json(
    u.searchParams.get("fields->PO_Output_ID").includes("10868")?slides:originalSlides);
  throw Error("unexpected "+u.pathname);
 };
 const proof=await preflightNycOwnerGalleryApproval(env,output);
 assert.equal(proof.pending,4);
 assert.equal(proof.siblingRepair,true);
 await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,output,{
 requestId:"old-failed-factory-request",approvedByUserRecordId:actor,submittedAt:"2026-11-23T05:00:00Z"
 }),/AFTER the owner hold release/);
 assert.equal(writes,0);
});
