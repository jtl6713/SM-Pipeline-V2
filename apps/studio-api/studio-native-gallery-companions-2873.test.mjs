import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {preflightStudioOwnerGallery,finalizeNycOwnerGalleryOnFactoryClick,inspectNativeGalleryPublicationPackage} from "./native-gallery-package-guard.mjs";
import {inspectFactoryNativeSlideInventory} from "./supabase-pipeline-reads.mjs";
import {resumePilsenNativeCompanions,PILSEN_REQUEST} from "./studio-native-gallery-companion-recovery.mjs";
const KEY="SM_Studio_Native_Gallery_2873", approval="SM_Factory_Studio_Gallery_Approval_2873";
const rec=n=>"rec"+String(n).padStart(14,"a");
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const hash=x=>createHash("sha256").update(x).digest("hex");
function fixture(platform="Instagram"){
  const id=rec(99),request=rec(98),profile=rec(97),at="2026-11-24T19:00:00Z";
  const clips=Array.from({length:10},(_,i)=>({order:i+1,url:"https://media.chicagoshining.com/studio/previews/watermarked/gallery/slide-"+i+".jpg",
    google_drive_file_id:"owned-drive-file-"+i,media_asset_record_id:rec(i+1),sha256:hash(Buffer.from([255,216,i,255,217])),is_cover:i===0}));
  const marker={complete:true,request_id:request,slide_count:10,human_approval_required:true,provider_writes:0,prepared_at:at,
    package_sha256:hash(JSON.stringify(clips.map(c=>[c.order,c.media_asset_record_id,c.google_drive_file_id,c.url,c.sha256])))};
  const row={id:uuid(99),airtable_record_id:id,output_number:11158,content_item_id:uuid(95),content_profile_id:uuid(97),
    platform,platform_output_type:platform==="Instagram"?"Instagram Carousel":"Facebook Photo Set",
    output_status:"Ready for Review",review_status:"Review Sent",publish_status:"Not Ready",render_status:"Native Photo Route",
    aspect_ratio:"4:5",selected_clip_count:10,do_not_publish:false,auto_publish_enabled:false,updated_at:at,
    selected_assets:{authority:"studio_owner_uploaded_exact_source",production_request_record_id:request,selected_clips:clips,[KEY]:marker},
    render_clip_list:clips,error_messages:{[KEY]:marker}};
  const slides=clips.map((c,i)=>({id:uuid(i+1),airtable_record_id:rec(i+30),current_order:i+1,deleted_from_carousel:false,updated_at:at,
    fields:{"Platform Output":[id],PO_Output_ID:[11158],"Slide Number":i+1,"Is Cover":i===0,"Final Image URL":c.url,
      Asset_4x5_Public_URL:c.url,Asset_4x5_Public_Status:"Ready",IG_Public_Asset_URL:c.url,IG_Public_Asset_Status:"Ready",
      "Google Drive File ID":c.google_drive_file_id,Asset_Family_Key:c.media_asset_record_id,
      "Approved For Final":false,Shared_Asset_Approved:false,"Review Status":"Review Sent",
      [KEY]:{request_id:request,package_sha256:marker.package_sha256,sha256:c.sha256,owned_media_verified:true,human_approval_required:true}}}));
  const assets=clips.map(c=>({airtable_record_id:c.media_asset_record_id,active:true,do_not_use:false,asset_status:"Available",
    google_drive_file_id:c.google_drive_file_id,metadata:{rights_status:"Owned",content_profile_airtable_id:profile}}));
  return {row,slides,assets,profile};
}
async function withFixture(f,fn){
  const old=globalThis.fetch,calls=[];
  globalThis.fetch=async (url,opts={})=>{
    const u=new URL(url),method=opts.method||"GET";calls.push({url,method});
    if(u.origin==="https://media.chicagoshining.com"){
      const n=Number(u.pathname.match(/slide-(\d+)\.jpg$/)[1]);
      return new Response(Uint8Array.from([255,216,n,255,217]),{headers:{"Content-Type":"image/jpeg"}});
    }
    assert.equal(u.origin,"https://fixture.supabase.co");
    if(u.pathname.endsWith("/carousel_slides")){
      if(method==="PATCH"){
        const id=u.searchParams.get("id").slice(3);
        const slide=f.slides.find(s=>s.id===id);
        Object.assign(slide,JSON.parse(opts.body));
        return Response.json([slide]);
      }
      assert.equal(method,"GET");return Response.json(f.slides);
    }
    if(u.pathname.endsWith("/content_profiles"))return Response.json([{airtable_record_id:f.profile}]);
    if(u.pathname.endsWith("/media_assets"))return Response.json(f.assets);
    throw Error("Unexpected network call "+u.pathname);
  };
  try{return await fn({SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test"},calls);}
  finally{globalThis.fetch=old;}
}
test("both prepared galleries are visible and still require actual human approval",async()=>{
  for(const platform of ["Instagram","Facebook"]){
    const f=fixture(platform);
    assert.equal(inspectFactoryNativeSlideInventory(f.row,f.slides).verified,true);
    assert.equal(inspectNativeGalleryPublicationPackage(f.row,f.slides).eligible,false);
    await withFixture(f,async(env,calls)=>{
      assert.equal((await preflightStudioOwnerGallery(env,f.row)).pending,10);
      await assert.rejects(finalizeNycOwnerGalleryOnFactoryClick(env,f.row,{requestId:"factory-request-1",approvedByUserRecordId:rec(90),submittedAt:"2026-11-24T18:59:59Z"}),/authenticated Factory submitter/);
      assert.equal(calls.filter(c=>c.method==="PATCH").length,0);
      await finalizeNycOwnerGalleryOnFactoryClick(env,f.row,{requestId:"factory-request-2",approvedByUserRecordId:rec(90),submittedAt:"2026-11-24T19:01:00Z"});
      assert.equal(calls.filter(c=>c.method==="PATCH").length,10);
      assert.ok(f.slides.every(s=>s.fields[approval]?.actor_record_id===rec(90)));
      assert.equal(inspectNativeGalleryPublicationPackage(f.row,f.slides).eligible,true);
      assert.equal(f.row.output_status,"Ready for Review");
    });
  }
});
test("missing, changed or foreign linked slides fail closed rather than become selectable",async()=>{
  const missing=fixture();missing.slides.pop();
  assert.equal(inspectFactoryNativeSlideInventory(missing.row,missing.slides).verified,false);
  await withFixture(missing,env=>assert.rejects(preflightStudioOwnerGallery(env,missing.row),/linked_package_invalid/));
  const changed=fixture();changed.slides[2].fields[KEY].package_sha256="f".repeat(64);
  assert.equal(inspectFactoryNativeSlideInventory(changed.row,changed.slides).verified,false);
  await withFixture(changed,env=>assert.rejects(preflightStudioOwnerGallery(env,changed.row),/slide_evidence_invalid/));
  const denied=fixture();denied.assets[0].metadata.rights_status="Unknown";
  await withFixture(denied,env=>assert.rejects(preflightStudioOwnerGallery(env,denied.row),/source_rights_or_identity_invalid/));
});
test("Pilsen exact repair never queues the old runner and is one-shot once accepted",async()=>{
  const values=new Map();
  const bucket={get:async k=>values.get(k)||null,put:async(k,v,o)=>{if(o?.onlyIf&&values.has(k))return null;values.set(k,v);return {etag:"1"};}};
  const ids=["recaQyj12CzOHjIQp","recFmEG6KLrEHvyHk","rec5QpFiGL7IzkPuy"];
  const content=uuid(23);
  const rows=ids.map((id,i)=>({airtable_record_id:id,output_number:11157+i,content_item_id:content,content_profile_id:uuid(9),
    output_status:"Ready for Review",render_status:"Native Photo Route",do_not_publish:false,selected_clip_count:19,
    selected_assets:{authority:"studio_owner_uploaded_exact_source",production_request_record_id:PILSEN_REQUEST}}));
  let job={step:"done"};
  const read=async path=>path.startsWith("production_requests")?[{airtable_record_id:PILSEN_REQUEST,promoted_content_item_id:content,request_status:"Promoted",variant_status:"Ready",variant_manifest:{complete:true,ready_count:38},production_job:job}]:path.startsWith("platform_outputs")?rows:[];
  let launches=0;const resume=async id=>{assert.equal(id,PILSEN_REQUEST);launches++;return {payload:{accepted:true}};};
  assert.equal((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>false})).skipped,"new_runner_not_verified");
  assert.equal(launches,0);
  assert.equal((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>true})).status,"producer_accepted");
  assert.equal((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>true})).skipped,"one_shot_receipt_exists");
  assert.equal(launches,1);
  job={step:"blocked",job_id:"spj-ca8542b8795e",error:"unrelated error"};
  assert.notEqual((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>true})).status,"producer_accepted");
  job={step:"blocked",job_id:"spj-ca8542b8795e",error:"Native gallery contains duplicate final images"};
  assert.equal((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>false})).skipped,"new_runner_not_verified");
  assert.equal((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>true})).revision,2);
  assert.equal((await resumePilsenNativeCompanions({bucket,read,resume,runnerReady:async()=>true})).skipped,"one_shot_receipt_exists");
  assert.equal(launches,2);
});
