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

test("review resolve GET and POST derive the same server-side authorized profile scope", async () => {
  const {readFileSync}=await import("node:fs");
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const mutations=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const profiles=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
  assert.match(worker,/const scopedAuthorization = await resolveFactoryReviewResolveAuthorization\(env, authorization\);\s*return respond\(request,env,\{ok:true,\.\.\.await readFactoryReviewResolve\(env,outputId,scopedAuthorization\)\}\)/);
  assert.match(mutations,/const scopedAuthorization = await resolveFactoryReviewResolveAuthorization\(env, authorization\);\s*resultExtra=await resolveFactoryGalleryReview\(env,id,scopedAuthorization,payload\)/);
  const scope=profiles.split("export async function resolveFactoryReviewResolveAuthorization")[1].split("/*__STUDIO_WORKER_END:")[0];
  assert.match(scope,/listSupabaseContentProfiles\(env, \{ limit: 100 \}\)/);
  assert.match(scope,/resolveAuthorizedContentProfiles\(env, authorization\)/);
  assert.match(scope,/authorized_profile_ids: authorized\.map\(profile => profile\.id\)/);
  assert.doesNotMatch(scope,/airtableFetch\(|listRecords\(/);
});

test("authenticated gallery review persists every slide, releases only its hold and recovers the exact receipt", async()=>{
  const {readFactoryReviewResolve,resolveFactoryGalleryReview,readFactoryReviewResolveReceipt}=await import("./factory-review-resolve.mjs");
  const {row,slides}=fixture();
  const profile="recAAAAAAAAAAAAAA", actor="recBBBBBBBBBBBBBB";
  const profileUuid="00000000-0000-0000-0000-000000000099";
  Object.assign(row,{id:"00000000-0000-0000-0000-000000000098",content_profile_id:profileUuid,platform:"Instagram",review_status:null});
  const bytes=Uint8Array.from([255,216,255,217]);
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
  for(const slide of slides){
    slide.fields.SM_Native_Gallery_Draft_Repair_2294.public_sha256=digest;
    slide.fields.SM_Chicago_Gallery_Repair_2890.verified_branded_sha256=digest;
  }
  const assets=slides.map(slide=>({airtable_record_id:slide.fields.Asset_Family_Key,active:true,do_not_use:false,asset_status:"Available",metadata:{rights_status:"Owned"}}));
  const auth={authenticated:true,authorized:true,user:{record_id:actor},permissions:{outputs_review:true,publishing_control:true},authorized_profile_ids:[profile]};
  const locks=new Map(); let etag=0,patches=0;
  const bucket={async get(key){const value=locks.get(key);return value?{etag:value.etag,text:async()=>value.body}:null;},async put(key,body){locks.set(key,{body,etag:String(++etag)});return {etag:String(etag)};}};
  const env={SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test-only",STUDIO_MEDIA:bucket};
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input),table=url.pathname.split("/").at(-1),method=init.method||"GET";
    let result;
    if(method==="GET"){
      if(table==="platform_outputs")result=[row];
      else if(table==="content_profiles")result=[{id:profileUuid,airtable_record_id:profile,market_name:"Chicago",platform_setup:{}}];
      else if(table==="carousel_slides")result=slides;
      else if(table==="media_assets")result=assets;
      else throw new Error("Unexpected GET "+table);
    }else if(method==="PATCH"){
      const patch=JSON.parse(init.body);
      if(table==="carousel_slides"){
        const slide=slides.find(s=>url.searchParams.get("id")==="eq."+s.id);
        assert.ok(slide);assert.equal(url.searchParams.get("updated_at"),"eq."+slide.updated_at);
        Object.assign(slide,patch);result=[slide];
      }else if(table==="platform_outputs"){
        assert.equal(url.searchParams.get("do_not_publish"),"eq.true");
        assert.equal(url.searchParams.get("updated_at"),"eq."+row.updated_at);
        Object.assign(row,patch);result=[row];
      }else throw new Error("Unexpected PATCH "+table);
      patches++;
    }else throw new Error("Unexpected method "+method);
    return new Response(JSON.stringify(result),{headers:{"content-type":"application/json"}});
  };
  try{
    const initial=await readFactoryReviewResolve(env,id,auth);
    const pending=await readFactoryReviewResolveReceipt(env,id,auth,initial.package_sha256);
    assert.equal(pending.review_resolved,false);assert.equal(patches,0);
    const payload={package_sha256:initial.package_sha256,confirm_images:true,confirm_caption:true,confirm_branding_rights:true};
    const saved=await resolveFactoryGalleryReview(env,id,auth,payload,{fetchImpl:async()=>new Response(bytes,{headers:{"content-type":"image/jpeg"}})});
    assert.equal(saved.review_resolved,true);assert.equal(saved.id,id);assert.equal(saved.slide_count,4);assert.equal(saved.package_sha256,initial.package_sha256);assert.ok(saved.saved_at);
    assert.equal(patches,5);assert.equal(row.do_not_publish,false);assert.equal(row.auto_publish_enabled,false);assert.equal(row.review_status,"Review Sent");assert.equal(row.publish_status,"Not Ready");
    assert.equal(row.scheduled_post_date,undefined);assert.equal(row.published_at,undefined);
    assert.ok(slides.every(slide=>slide.fields["Approved For Final"]===true));
    const {inspectFactoryNativeSlideInventory}=await import("./supabase-pipeline-reads.mjs");
    const {classifyFactoryLane}=await import("./factory-desk.mjs");
    const inventory=inspectFactoryNativeSlideInventory(row,slides);
    assert.equal(inventory.verified,true,inventory.reason);
    assert.equal(classifyFactoryLane({id,kind:"output",output_status:row.output_status,review_status:row.review_status,render_status:row.render_status,publish_status:row.publish_status,do_not_publish:row.do_not_publish,auto_publish_enabled:row.auto_publish_enabled,studio_state:"Ready for Review",review_package_ready:inventory.verified}),"needs_eyes");
    const recovered=await readFactoryReviewResolveReceipt(env,id,auth,initial.package_sha256);
    assert.equal(recovered.review_resolved,true);assert.equal(recovered.formal_approval_pending,true);assert.equal(recovered.scheduled,false);assert.equal(recovered.published,false);assert.equal(patches,5);
    await assert.rejects(()=>readFactoryReviewResolveReceipt(env,id,auth,"b".repeat(64)),/does not match/);
    await assert.rejects(()=>readFactoryReviewResolveReceipt(env,id,{...auth,authorized_profile_ids:[]},initial.package_sha256),/authorized reviewer/);
  }finally{globalThis.fetch=original;}
});

test("exact pilot final approval uses canonical governed group path",async()=>{
 const {reviewResolvePilotOutput}=await import("./factory-review-resolve.mjs");
 const {readFileSync}=await import("node:fs");
 assert.equal(reviewResolvePilotOutput(id),true);
 assert.equal(reviewResolvePilotOutput("recUnknown00000000"),false);
 const code=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
 const route=code.slice(code.indexOf("const resolvedGalleryPilot = reviewResolvePilotOutput(id)"),code.indexOf("resultExtra = await factoryApproveOutput(env, id, actor, note, ctx);",code.indexOf("const resolvedGalleryPilot = reviewResolvePilotOutput(id)")));
 assert.match(route,/resolvedGalleryPilot && \(studioWriteSource\(env\) !== "supabase"/);
 assert.match(route,/factoryBatchGroupSubmitRoute\(/);
 assert.match(route,/record_ids: \[id\]/);
 assert.match(route,/receipt\?\.accepted !== true/);
});
