import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectNativeGalleryPublicationPackage,
  nycOwnerGalleryApprovalEligible,
  preflightNycOwnerGalleryApproval,
  finalizeNycOwnerGalleryOnFactoryClick,
} from "./native-gallery-package-guard.mjs";

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" };
const image = n => "https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2221/shared-small-bottom-right/slide-0" + n + "-abcdef0123456789.jpg";
const drive = n => "owner-drive-reference-nyc-20261122-" + n;
const family = n => "rec" + String(n).padStart(14, "A");
const actor = "recAuthUser123456";
const pairs = [
  ["recO494MDnQ1Tk51b", 10855, "Instagram", "Instagram Carousel"],
  ["recWIWOrdflmqyxKW", 10856, "Facebook", "Facebook Photo Set"],
];
function fixture([id, outputNumber, platform, type]) {
  const clips = [1,2,3,4].map(n => ({
    order:n, url:image(n), googleDriveFileId:drive(n), mediaAssetRecordId:family(n),
  }));
  const output = {
    airtable_record_id:id, output_number:outputNumber,
    platform, platform_output_type:type,
    studio_output_type:type==="Instagram Carousel"?"Carousel":"Multi-Image Post",
    render_status:"Native Photo Route",output_status:"Ready for Review",
    review_status:"Review Sent", publish_status:"Not Ready",
    selected_clip_count:4, selected_assets:{selected_clips:clips},
    render_clip_list:clips,
    do_not_publish:false, auto_publish_enabled:false,
    publish_hold_released_at:"2026-11-23T02:45:37Z",
    scheduled_post_date:null,studio_scheduled_at:null,
    published_at:null,platform_post_url:null,platform_publish_response:null,
    error_messages:{SM_NYC_AI_Creative_QA_20261122:{
      subject_verified:true,caption_and_hashtag_review:"pass",
      factory_final_approval:false,publishing_authorized:false,
    }},
  };
  const slides = [1,2,3,4].map(n=>({
    id:"a0000000-0000-4000-8000-"+String(n).padStart(12,"0"),
    airtable_record_id:"rec"+String(n).padStart(14,"A"),
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
  test("#2371 "+pair[1]+": owner-released RFR gallery has 4 valid slides, no automatic/old-receipt approval",async t=>{
    const {output,slides}=fixture(pair);
    const calls=wire(t,slides);
    assert.equal(nycOwnerGalleryApprovalEligible(output),true);
    assert.equal(inspectNativeGalleryPublicationPackage(output,slides).eligible,false);
    const inspected=await preflightNycOwnerGalleryApproval(env,output);
    assert.equal(inspected.pending,4);
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
    assert.equal(calls.filter(c=>c.method==="PATCH").length,4);
    assert.equal(slides.every(s=>s.fields["Approved For Final"]===true),true);
    assert.equal(slides.every(s=>s.fields.Shared_Asset_Approved===true),true);
    assert.equal(output.output_status,"Ready for Review","parent not approved or published by image finalization");
    assert.equal(output.auto_publish_enabled,false);
    const repeat=await finalizeNycOwnerGalleryOnFactoryClick(env,output,{
      requestId:"factory-new-20261124",approvedByUserRecordId:actor,
      submittedAt:"2026-11-24T04:45:00Z",
    });
    assert.equal(repeat.pending,0);
    assert.equal(calls.filter(c=>c.method==="PATCH").length,4,"idempotent with existing actual review evidence");
  });
}
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
