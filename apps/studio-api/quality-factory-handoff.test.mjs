import test from "node:test";
import assert from "node:assert/strict";
import {
  FACTORY_HANDOFF_SCHEMA, FACTORY_HANDOFF_SIGNATURE, FACTORY_HANDOFF_RUNBOOK,
  assessProductionFactoryHandoff, auditFactoryCardProjection,
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
  ...photo(10858,"YouTube","Short"),render_status:"Rendered",selected_clip_count:0,
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
    gallerySlides:slides(),factoryCards:cards(all)});
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
