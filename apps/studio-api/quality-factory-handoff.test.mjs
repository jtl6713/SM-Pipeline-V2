import test from "node:test";
import assert from "node:assert/strict";
import {
  FACTORY_HANDOFF_SCHEMA, FACTORY_HANDOFF_SIGNATURE, FACTORY_HANDOFF_RUNBOOK,
  assessProductionFactoryHandoff, auditFactoryCardProjection, scanRecentProductionFactoryHandoffs,
} from "./quality-factory-handoff.mjs";

const request=()=>({
  airtable_record_id:"recProduction2221AA",promoted_content_item_id:"content-2221",
  content_profile_id:"profile-nyc",request_status:"Promoted",
  production_job:{step:"done"},output_plan:{items:[
    {platform:"Instagram",output_type:"Carousel"},
    {platform:"Facebook",output_type:"Multi-Image Post"},
    {platform:"TikTok",output_type:"Multi-Photo"},
    {platform:"YouTube",output_type:"Short"},
  ]},
});
const photo=(number,platform,type)=>({
  airtable_record_id:"rec"+String(number).padStart(14,"A"),
  output_number:number,content_item_id:"content-2221",
  content_profile_id:"profile-nyc",platform,studio_output_type:type,
  platform_output_type:platform==="Instagram"?"Instagram Carousel":"Facebook Photo Set",
  output_status:"Ready for Review",review_status:"Review Sent",
  publish_status:"Not Ready",render_status:"Native Photo Route",
  selected_clip_count:4,output_caption:"Verified NYC ferry caption",
  studio_preview_url:"https://media.chicagoshining.com/studio/previews/nyc.jpg",
  thumbnail_url:"https://media.chicagoshining.com/studio/previews/nyc.jpg",
  do_not_publish:false,
});
const video=()=>({
  ...photo(10858,"YouTube","Short"),platform_output_type:"YouTube Short",
  render_status:"Rendered",selected_clip_count:0,
  final_file_url:"https://media.chicagoshining.com/studio/previews/nyc.mp4",
});
const source=()=>[photo(10855,"Instagram","Carousel"),
  photo(10856,"Facebook","Multi-Image Post"),
  photo(10857,"TikTok","Multi-Photo"),video()];
const slides=()=>Object.fromEntries([10855,10856,10857].map(n=>[String(n),
  [1,2,3,4].map(i=>({current_order:i,
    final_image_url:"https://media.chicagoshining.com/studio/previews/"+n+"-"+i+".jpg",
    media_status:"Ready"}))]));
const cards=outputs=>outputs.map(row=>({
  id:row.airtable_record_id,output_id:row.output_number,
  publish_status:row.publish_status,review_package_ready:true,
}));
const mediaEvidence=outputs=>Object.fromEntries(outputs.map(row=>[String(row.output_number),{
  cdn_bytes_verified:true,topic_location_verified:true,rights_verified:true,
  branding_verified:true,aspect_ratio_verified:true,audio_verified:true,
}]));

test("Quality Agent generic signature is a complete read-only lifecycle playbook",()=>{
  assert.equal(FACTORY_HANDOFF_SIGNATURE,"QA-PRODUCTION-FACTORY-E2E-2846");
  assert.ok(FACTORY_HANDOFF_SCHEMA.endsWith(".1"));
  assert.deepEqual(FACTORY_HANDOFF_RUNBOOK.map(x=>x.stage),
    ["plan","fanout","produce","media","holds","factory","approval","terminal"]);
  assert.equal(FACTORY_HANDOFF_RUNBOOK.some(x=>x.auto_action===true),false);
});

test("detect no outputs after completed Production, with original plan and exact destinations",()=>{
  const result=assessProductionFactoryHandoff({request:request(),outputs:[]});
  assert.equal(result.status,"repair_required");
  assert.equal(result.stage,"fanout");
  assert.equal(result.expected_count,4);
  assert.equal(result.actual_count,0);
  assert.equal(result.findings.length,4);
  assert.ok(result.findings.every(x=>x.reason==="planned_output_missing"
    && x.automatic_action_authorized===false));
  assert.equal(result.publishing_authorized,false);
});

test("an ongoing producer is not misdiagnosed as a missing-output terminal failure",()=>{
  const p=request();p.request_status="Submitted";p.production_job.step="rendering";
  const result=assessProductionFactoryHandoff({request:p,outputs:[]});
  assert.equal(result.status,"in_progress");
  assert.ok(result.findings.every(x=>x.automatic_action_authorized===false));
});

test("partial Output fanout isolates missing sibling, never promotes entire Content",()=>{
  const all=source(),partial=[all[0],all[1],all[3]];
  const result=assessProductionFactoryHandoff({request:request(),outputs:partial,
    gallerySlides:slides(),factoryCards:cards(partial)});
  assert.equal(result.stage,"fanout");
  assert.equal(result.status,"repair_required");
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].reason,"planned_output_missing");
  assert.equal(result.findings[0].platform,"TikTok");
});

test("wrong profile, duplicate destination and damaged plan are never auto repaired",()=>{
  const all=source(),wrong=all.map(x=>({...x}));
  wrong[0].content_profile_id="profile-la";
  const p=assessProductionFactoryHandoff({request:request(),outputs:wrong});
  assert.equal(p.status,"blocked");
  assert.equal(p.findings[0].reason,"wrong_content_or_profile_ownership");
  const duplicate=assessProductionFactoryHandoff({request:request(),outputs:[...all,all[0]]});
  assert.equal(duplicate.findings[0].reason,"unexpected_or_duplicate_platform_output");
  const invalid=request();invalid.output_plan.items.push({...invalid.output_plan.items[0]});
  assert.equal(assessProductionFactoryHandoff({request:invalid,outputs:[]})
    .findings[0].reason,"invalid_or_duplicate_output_plan");
});

test("stale failed production and missing media are recovered by stage, no blind provider retry",()=>{
  const all=source();
  all[0].render_status="Failed";all[0].output_status="Failed";
  all[1].selected_clip_count=0;
  all[3].final_file_url=null;
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all)});
  assert.equal(result.findings.length,3);
  assert.deepEqual(result.findings.map(x=>x.reason),
    ["generation_or_render_failed","native_selected_assets_or_public_preview_missing",
      "video_final_or_public_cover_missing"]);
  assert.ok(result.findings.every(x=>x.automatic_action_authorized===false));
});

test("missing or corrupt individual gallery slides require actual media repair",()=>{
  const all=source(),gallery=slides();gallery["10855"]=[];
  gallery["10856"][0].media_status="Error";
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:gallery,factoryCards:cards(all)});
  assert.equal(result.findings.length,2);
  assert.ok(result.findings.every(x=>x.reason==="canonical_gallery_missing_or_unready"));
});

test("no slide readback means verification required, not an invented complete gallery",()=>{
  const all=source();
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:null,factoryCards:cards(all)});
  assert.equal(result.status,"verification_required");
  assert.equal(result.ready_count,4);
  assert.equal(result.publishing_authorized,false);
});

test("creative or publication hold survives media repair and blocks automatic release",()=>{
  const all=source();all[0].do_not_publish=true;
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all)});
  assert.equal(result.stage,"holds");
  assert.equal(result.findings[0].reason,"unresolved_publish_or_creative_safety_hold");
  assert.equal(result.findings[0].automatic_action_authorized,false);
});

test("actual historical #10855/#10856: missing Factory card or dropped publish_status is detected",()=>{
  const all=source(),gallery=slides(),server=cards(all);
  const missing=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:gallery,factoryCards:[server[2],server[3]]});
  assert.deepEqual(missing.findings.map(x=>x.output_id),[10855,10856]);
  assert.ok(missing.findings.every(x=>x.reason==="canonical_ready_output_missing_from_needs_eyes"));
  const dropped=cards(all).map(x=>({...x}));
  dropped[0].publish_status=null;dropped[1].publish_status=null;
  const report=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:gallery,factoryCards:dropped});
  assert.deepEqual(report.findings.map(x=>x.output_id),[10855,10856]);
  assert.ok(report.findings.every(x=>x.reason==="factory_card_publication_or_readiness_projection_mismatch"));
});

test("active submission remains fenced even with a review-ready card",()=>{
  const all=source();
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all),
    activeSubmissionIds:[all[0].airtable_record_id]});
  assert.equal(result.findings[0].reason,"active_approval_submission_requires_reconciliation");
  assert.equal(result.publishing_authorized,false);
});

test("full proof stops BEFORE human Factory approval and never approves or publishes",()=>{
  const all=source(),result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all),
    verifiedMediaEvidence:mediaEvidence(all)});
  assert.equal(result.status,"awaiting_human_factory_approval");
  assert.equal(result.findings.length,0);
  assert.equal(result.expected_count,4);
  assert.equal(result.ready_count,4);
  assert.equal(result.terminal,"await_human_factory_approval");
  assert.equal(result.stop_before_factory_approval,true);
  assert.equal(result.publish_actions,0);
  assert.equal(result.schedule_actions,0);
  assert.equal(result.publishing_authorized,false);
});

test("Factory read-time audit catches only dropped/absent current review cards",()=>{
  const rows=[{id:"recO494MDnQ1Tk51b",kind:"output",output_id:10855,
    output_status:"Ready for Review",review_status:"Review Sent",
    publish_status:"Not Ready",do_not_publish:false,review_package_ready:true},
    {id:"recWIWOrdflmqyxKW",kind:"output",output_id:10856,
    output_status:"Ready for Review",review_status:"Review Sent",
    publish_status:"Not Ready",do_not_publish:false,review_package_ready:true}];
  const x=auditFactoryCardProjection(rows,[{id:rows[0].id,publish_status:null}]);
  assert.deepEqual(x.map(y=>y.reason),
    ["factory_card_publish_status_dropped","factory_ready_output_not_in_needs_eyes"]);
  assert.deepEqual(auditFactoryCardProjection(rows,[
    {id:rows[0].id,publish_status:"Not Ready"},
    {id:rows[1].id,publish_status:"Not Ready"},
  ]),[]);
  assert.deepEqual(auditFactoryCardProjection(rows.map(x=>({...x,do_not_publish:true})),[]),[]);
});

test("bounded Supabase Quality Agent scan catches partial output fanout in two reads",async()=>{
  const uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",profile="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const pr={...request(),promoted_content_item_id:uuid,content_profile_id:profile};
  const rows=source().slice(0,2).map(x=>({...x,content_item_id:uuid,content_profile_id:profile}));
  const urls=[];
  const scan=await scanRecentProductionFactoryHandoffs({
    read:async path=>{
      urls.push(path);
      return path.startsWith("production_requests?")?[pr]:rows;
    },
  });
  assert.equal(urls.length,2);
  assert.ok(urls[0].includes("limit=4"))
  assert.ok(!urls[0].includes("content_profile_id"),
    "production_requests has no content_profile_id column in live Supabase");;
  assert.ok(urls[1].includes("content_item_id=in.("+uuid+")"));
  assert.ok(urls[1].includes("&limit=193"));
  assert.equal(scan.status,"ok");
  assert.equal(scan.incomplete_count,1);
  assert.equal(scan.findings.length,2);
  assert.deepEqual(scan.findings.map(x=>x.platform),["TikTok","YouTube"]);
  assert.equal(scan.reports[0].publishing_authorized,false);
});

test("Quality Agent scanner fails closed on truncated or unavailable canonical source",async()=>{
  const uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const p={...request(),promoted_content_item_id:uuid};
  await assert.rejects(scanRecentProductionFactoryHandoffs({
    read:async path=>path.startsWith("production_requests?")?[p]:Array.from({length:193},()=>source()[0]),
  }),/truncated/);
  await assert.rejects(scanRecentProductionFactoryHandoffs({
    read:async path=>path.startsWith("production_requests?")?[p]:null,
  }),/unavailable/);
  await assert.rejects(scanRecentProductionFactoryHandoffs({
    read:async()=>null,
  }),/unavailable/);
});

test("Quality Agent scan never invents gallery validation or authorizes approval when no deep read",async()=>{
  const uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",profile="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const pr={...request(),promoted_content_item_id:uuid,content_profile_id:profile};
  const rows=source().map(x=>({...x,content_item_id:uuid,content_profile_id:profile}));
  const report=await scanRecentProductionFactoryHandoffs({
    read:async path=>path.startsWith("production_requests?")?[pr]:rows,
  });
  assert.equal(report.incomplete_count,0);
  assert.equal(report.verification_required_count,1);
  assert.equal(report.reports[0].status,"verification_required");
  assert.equal(report.reports[0].publishing_authorized,false);
  assert.ok(report.note.includes("not treated as clear"));
});

test("already scheduled, approved or published outputs are not rewound into Factory",()=>{
  const all=source().map(x=>({...x,output_status:"Approved for Publishing",
    review_status:"Approved",publish_status:"Scheduled"}));
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:[]});
  assert.equal(result.status,"past_factory_review");
  assert.equal(result.stage,"complete");
  assert.equal(result.terminal,"no_quality_reapproval_needed");
  assert.equal(result.findings.length,0);
  assert.equal(result.publishing_authorized,false);
});

test("a promoted parent with verified active producer is IN_PROGRESS, not failed media",()=>{
  const p=request();p.request_status="Promoted";p.production_job.step="rendering";
  const all=source();all[3].final_file_url=null;
  const result=assessProductionFactoryHandoff({request:p,outputs:all});
  assert.equal(result.status,"in_progress");
  assert.equal(result.stage,"produce");
  assert.equal(result.findings.length,0);
  all[3].render_status="Failed";
  const broken=assessProductionFactoryHandoff({request:p,outputs:all});
  assert.equal(broken.status,"repair_required");
  assert.equal(broken.findings[0].reason,"generation_or_render_failed");
});

test("TikTok multi-photo is not forced to invent IG/FB carousel_slides",()=>{
  const all=source();const gallery=slides();
  gallery["10857"]=[];
  const result=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:gallery,factoryCards:cards(all)});
  assert.equal(result.status,"verification_required",
    "typed TikTok media requires separate exact source preflight");
  assert.ok(!result.findings.some(x=>x.output_id===10857
    && x.reason==="canonical_gallery_missing_or_unready"));
});

test("URLs and gallery count without verified bytes, city, rights, branding and audio stay UNKNOWN",()=>{
  const all=source();
  const insufficient=assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all)});
  assert.equal(insufficient.status,"verification_required");
  const proof=mediaEvidence(all);proof["10858"].audio_verified=false;
  assert.equal(assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all),
    verifiedMediaEvidence:proof}).status,"verification_required");
  proof["10858"].audio_verified=true;proof["10855"].topic_location_verified=false;
  assert.equal(assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all),
    verifiedMediaEvidence:proof}).status,"verification_required");
  proof["10855"].topic_location_verified=true;
  assert.equal(assessProductionFactoryHandoff({request:request(),outputs:all,
    gallerySlides:slides(),factoryCards:cards(all),
    verifiedMediaEvidence:proof}).status,"awaiting_human_factory_approval");
});

test("cross-profile leakage among children is held even without parent profile projection",()=>{
  const p=request();delete p.content_profile_id;
  const all=source().map(x=>({...x}));
  all[1].content_profile_id="profile-la";
  const result=assessProductionFactoryHandoff({request:p,outputs:all});
  assert.equal(result.stage,"fanout");
  assert.equal(result.status,"blocked");
  assert.equal(result.findings[0].reason,"wrong_content_or_profile_ownership");
});

test("approved but failed Story is not treated as a complete Factory handoff (#2915 / #5628)",()=>{
  const all=source().map(x=>({...x,output_status:"Approved for Publishing",
    review_status:"Approved",publish_status:"Scheduled"}));
  const p=request();
  p.output_plan.items[0]={platform:"Instagram",output_type:"Story"};
  all[0]={...all[0],output_number:5628,studio_output_type:"Story",
    platform_output_type:"Instagram Story",render_status:"Rendered",
    publish_status:"Failed",do_not_publish:true};
  const result=assessProductionFactoryHandoff({request:p,outputs:all});
  assert.equal(result.status,"repair_required");
  assert.equal(result.stage,"publish");
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].output_id,5628);
  assert.equal(result.findings[0].reason,"approved_publication_failed_requires_reconciliation");
  assert.equal(result.findings[0].automatic_action_authorized,false);
  assert.equal(result.publish_actions,0);
  assert.equal(result.schedule_actions,0);
  // Prior receipt is reconciliation evidence, never a new provider attempt.
  all[0].platform_post_url="https://example.com/already-published";
  assert.equal(assessProductionFactoryHandoff({request:p,outputs:all}).findings[0].reason,
    "approved_publication_failed_requires_reconciliation");
  p.production_job.step="running";
  assert.equal(assessProductionFactoryHandoff({request:p,outputs:all}).stage,"publish");
});

test("2915 compact handoff scan detects the stale TikTok marker before Factory projection",()=>{
  const all=source();
  Object.assign(all[2],{output_number:10865,auto_publish_enabled:false,tiktok_draft_status:"Waiting for Schedule"});
  const result=assessProductionFactoryHandoff({request:request(),outputs:all});
  const match=result.findings.filter(x=>x.reason==="stale_tiktok_waiting_schedule_blocks_review");
  assert.equal(match.length,1);
  assert.equal(match[0].output_id,10865);
  assert.equal(match[0].repair_signature,"QA-TIKTOK-STALE-SCHEDULE-RFR-v1");
  assert.equal(match[0].automatic_action_authorized,false);
  assert.equal(result.status,"repair_required");
  for(const fields of [
    {auto_publish_enabled:true},{auto_publish_enabled:null},{scheduled_post_date:"2026-12-24T03:25Z"},
    {do_not_publish:true},{tiktok_draft_status:"Draft Delivered"},
    {output_status:"Approved for Publishing",review_status:"Approved"}
  ]){
    const copy=all.map(r=>({...r}));
    Object.assign(copy[2],fields);
    const guarded=assessProductionFactoryHandoff({request:request(),outputs:copy});
    assert.equal(guarded.findings.some(x=>x.reason==="stale_tiktok_waiting_schedule_blocks_review"),false);
  }
});


test("Bryant Park legacy draft signature diagnoses existing slides, missing caption and ratio without granting write authority",async()=>{
  const {assessLegacyNativeDraft,scanExactLegacyNativeDraft,LEGACY_NATIVE_DRAFT_SIGNATURE}=await import("./quality-factory-handoff.mjs");
  const req={airtable_record_id:"recbD8PLtJpez8Oz0",request_status:"Promoted",
    promoted_content_item_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    variant_status:"Ready",variant_manifest:{complete:true,ready_count:4,target_count:4},
    production_job:{step:"done"},
    output_plan:{items:[{platform:"Facebook",output_type:"Multi-Image Post"},
      {platform:"Instagram",output_type:"Carousel"}]}};
  const make=(number,id,platform,type,mapping)=>{
    const clips=Array.from({length:4},(_,i)=>({order:i+1,aspect_ratio:"4:5",
      url:"https://media.chicagoshining.com/studio/previews/lettered/"+id+"/"+i+".jpg",
      media_asset_record_id:"rec"+String(i).padStart(14,"A"),google_drive_file_id:"drive"+i}));
    const row={airtable_record_id:id,output_number:number,content_item_id:req.promoted_content_item_id,
      content_profile_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      platform,studio_output_type:type,platform_output_type:mapping,
      output_status:"Ready for Review",render_status:"Native Photo Route",review_status:null,publish_status:"Not Ready",
      do_not_publish:false,auto_publish_enabled:false,output_caption:null,aspect_ratio:null,selected_clip_count:4,
      selected_assets:{authority:"studio_owner_uploaded_exact_source",production_request_record_id:req.airtable_record_id,
        aspect_ratio:"4:5",selected_clips:clips},render_clip_list:structuredClone(clips),
      error_messages:{SM_Native_Gallery_Preflight_Hold_2294:{issue_number:2294,verification_status:"not_yet_verified",publishing_authorized:false}}};
    const slides=clips.map(c=>({airtable_record_id:"sb-native:2294:"+number+":"+c.order,current_order:c.order,
      deleted_from_carousel:false,fields:{"Slide Number":c.order,"Platform Output":[id],PO_Output_ID:[number],
        "Final Image URL":c.url,Asset_4x5_Public_URL:c.url,"Google Drive File ID":c.google_drive_file_id,
        Asset_Family_Key:c.media_asset_record_id,Asset_4x5_Public_Status:"Ready","Approved For Final":false,
        Shared_Asset_Approved:false,"Review Status":"Pending Review",
        SM_Native_Gallery_Draft_Repair_2294:{output_number:number,slide_order:c.order,source_asset:c.media_asset_record_id,
          variant_drive_file_id:c.google_drive_file_id,publishing_authorized:false,final_creative_approved:false}}}));
    return {row,slides};
  };
  const fb=make(10853,"rectw2pvgnBzK3wCN","Facebook","Multi-Image Post","Facebook Photo Set");
  const ig=make(10854,"recJ8jTynJDxsN0hl","Instagram","Carousel","Instagram Carousel");
  const result=assessLegacyNativeDraft(fb.row,fb.slides,req);
  assert.equal(result.matched,true);
  assert.equal(result.signature,LEGACY_NATIVE_DRAFT_SIGNATURE);
  assert.equal(result.existing_draft_slides,4);
  assert.equal(result.missing_caption,true);
  assert.equal(result.missing_typed_aspect_ratio,true);
  assert.equal(result.review_handoff_missing,true);
  assert.equal(result.preserve_existing_slides,true);
  assert.equal(result.automatic_action_authorized,false);
  assert.equal(result.publishing_authorized,false);
  for(const change of [{published_at:"2026-11-23T00:00:00Z"},{do_not_publish:true},
    {studio_scheduled_at:"2026-12-01T00:00:00Z"},{aspect_ratio:"9:16"},
    {error_messages:{...fb.row.error_messages,Publish_Attempt_Count:1}}])
    assert.equal(assessLegacyNativeDraft({...fb.row,...change},fb.slides,req).matched,false);
  assert.equal(assessLegacyNativeDraft(fb.row,fb.slides.slice(1),req).matched,false);
  const approved=structuredClone(fb.slides);approved[0].fields["Approved For Final"]=true;
  assert.equal(assessLegacyNativeDraft(fb.row,approved,req).matched,false);
  const changed=structuredClone(fb.slides);changed[0].fields["Final Image URL"]=changed[1].fields["Final Image URL"];
  assert.equal(assessLegacyNativeDraft(fb.row,changed,req).matched,false);
  const calls=[];
  const exact=await scanExactLegacyNativeDraft({requestId:req.airtable_record_id,read:async path=>{
    calls.push(path);
    if(path.startsWith("production_requests?"))return [req];
    if(path.startsWith("platform_outputs?"))return [fb.row,ig.row];
    if(path.includes("%5B10853%5D"))return fb.slides;
    if(path.includes("%5B10854%5D"))return ig.slides;
    throw Error("unexpected read");
  }});
  assert.equal(calls.length,4);
  assert.ok(exact.results.every(x=>x.matched&&x.existing_draft_slides===4));
  assert.equal(exact.approval_actions+exact.schedule_actions+exact.publish_actions,0);
});

test("#3159 blocked Story legacy dates and prior production approval are preserved as reconciliation evidence",()=>{
  const p=request();p.output_plan.items[3]={platform:"Instagram",output_type:"Story"};
  const all=source();
  const original={...all[3],platform:"Instagram",studio_output_type:"Story",
    platform_output_type:"Instagram Story",output_status:"In Production",render_status:"Blocked",
    review_status:null,final_file_url:null,do_not_publish:false,auto_publish_enabled:null,
    publish_status:"Ready to Publish",scheduled_post_date:"2026-12-21T06:16:00Z",studio_scheduled_at:null};
  for(const fields of [{},{production_approved_at:"2026-11-25T23:12:21Z"},
    {publish_status:null,scheduled_post_date:null,production_approved_at:"2026-11-26T05:38:49Z"},
    {output_status:"Approved for Publishing",review_status:"Approved",publish_status:"Scheduled"}]){
    all[3]={...original,...fields};
    const before=structuredClone(all);
    const result=assessProductionFactoryHandoff({request:p,outputs:all});
    const match=result.findings.find(x=>x.output_id===10858);
    assert.equal(result.status,"repair_required");
    assert.equal(match.reason,"blocked_story_lifecycle_conflict_requires_reconciliation");
    assert.equal(match.preserve_existing_approval,true);
    assert.equal(match.preserve_existing_schedule,true);
    assert.equal(match.automatic_action_authorized,false);
    assert.equal(match.approval_evidence_present,Boolean(fields.production_approved_at||fields.review_status));
    assert.equal(match.canonical_schedule_present,false);
    assert.equal(result.schedule_actions+result.publish_actions,0);
    assert.deepEqual(all,before);
  }
  all[3]={...original,scheduled_post_date:null,publish_status:"Not Ready",do_not_publish:true};
  assert.equal(assessProductionFactoryHandoff({request:p,outputs:all}).findings.find(x=>x.output_id===10858).reason,"generation_or_render_failed");
  all[3]={...original,published_at:"2026-11-25T00:00:00Z",platform_post_url:"https://example.com/receipt"};
  assert.equal(assessProductionFactoryHandoff({request:p,outputs:all}).findings.some(x=>x.output_id===10858),false);
});
test("#3159 rendered sibling with approved review and retained schedule is not reapproved or rerendered",()=>{
  const all=source();
  Object.assign(all[3],{review_status:"Approved",output_status:"Ready for Review",
    publish_status:"Ready to Schedule",auto_publish_enabled:true,
    scheduled_post_date:"2026-12-01T03:18:00Z",studio_scheduled_at:"2026-12-01T03:18:00Z"});
  const before=structuredClone(all);
  const result=assessProductionFactoryHandoff({request:request(),outputs:all});
  const f=result.findings.find(x=>x.output_id===10858);
  assert.equal(f.reason,"approved_rendered_sibling_lifecycle_drift");
  assert.equal(f.preserve_existing_artifact,true);
  assert.equal(f.preserve_existing_approval,true);
  assert.equal(f.preserve_existing_schedule,true);
  assert.equal(f.automatic_action_authorized,false);
  assert.equal(result.schedule_actions+result.publish_actions,0);
  assert.deepEqual(all,before);
  all[3].output_status="Approved for Publishing";
  assert.equal(assessProductionFactoryHandoff({request:request(),outputs:all}).findings.some(x=>x.output_id===10858),false);
});
