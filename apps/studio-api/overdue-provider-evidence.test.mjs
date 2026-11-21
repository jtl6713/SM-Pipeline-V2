import test from "node:test";
import assert from "node:assert/strict";
import { classifyOverdueProviderEvidence as assess, OVERDUE_PROVIDER_EVIDENCE_LANES } from "./overdue-provider-evidence.mjs";
import { reconcileExceptionCensus } from "./exception-recovery-counts.mjs";

const base={Review_Status:"Approved",Output_Status:"Approved for Publishing",Scheduled_Post_Date:"2026-11-01T12:00:00Z",Publish_Status:"Ready to Publish"};
const row=(id,fields)=>({id:"rec"+id.padStart(14,"0"),fields:{...base,...fields}});
const mapped=row=>({id:row.id,platform:row.fields.Platform,
 review_status:row.fields.Review_Status,output_status:row.fields.Output_Status,
 publish_status:row.fields.Publish_Status,scheduled_post_date:row.fields.Scheduled_Post_Date,
 do_not_publish:row.fields.Do_Not_Publish===true,
 published_at:row.fields.Published_At,platform_post_url:row.fields.Platform_Post_URL,
 studio_state:"Scheduled"});

test("saved provider objects are never equivalent to verified public posts",()=>{
 const cases=[
  [{Platform:"YouTube",YouTube_Video_ID:"Ls65TemEHSo"},"youtube_existing_video_id"],
  [{Platform:"TikTok",TikTok_Draft_Publish_ID:"v_inbox_url~v2.123"},"tiktok_existing_draft_id"],
  [{Platform:"Instagram",IG_Story_Container_ID:"18115347590139610",Publish_Status:"Failed"},"instagram_story_existing_creation_container"],
  [{Platform:"Instagram",IG_Carousel_Parent_Container_ID:"18134569969783117"},"instagram_carousel_existing_parent_container"],
  [{Platform:"Facebook",Platform_Post_ID:"1234567890"},"saved_post_id_needs_authenticated_account_get"],
  [{Platform:"TikTok",Publish_Status:"Published"},"published_label_without_saved_public_receipt"],
  [{Platform:"Instagram",Studio_Publish_Dispatch_Count:8,Publish_Status:"Ready to Schedule"},"prior_dispatch_without_saved_remote_identity"],
  [{Platform:"Facebook",Publish_Status:"Ready to Schedule"},"no_saved_dispatch_provider_preflight_required"]
 ];
 for(const [fields,expected] of cases){
  const proof=assess(fields);
  assert.equal(proof.lane,expected);
  assert.equal(proof.published_post_verified,false);
  assert.equal(proof.authorized_to_reupload,false);
  assert.equal(proof.requires_provider_preflight,true);
  assert.ok(OVERDUE_PROVIDER_EVIDENCE_LANES.includes(proof.lane));
 }
});

test("prior dispatch takes precedence over a misleading Ready to Schedule label",()=>{
 const result=assess({Platform:"Instagram",Publish_Status:"Ready to Schedule",Publish_Attempt_Count:"2"});
 assert.equal(result.lane,"prior_dispatch_without_saved_remote_identity");
});

test("canonical census separates creation objects from provider-publication proofs",()=>{
 const rows=[
  row("1",{Platform:"Instagram",IG_Story_Container_ID:"18115347590139610",Publish_Status:"Failed",Publish_Retry_Eligible:false}),
  row("2",{Platform:"Instagram",IG_Carousel_Parent_Container_ID:"18134569969783117"}),
  row("3",{Platform:"YouTube",YouTube_Video_ID:"Ls65TemEHSo"}),
  row("4",{Platform:"TikTok",TikTok_Draft_Publish_ID:"v_inbox_url~v2.123"}),
  row("5",{Platform:"Facebook",Studio_Publish_Dispatch_Count:2}),
  row("6",{Platform:"Facebook",Publish_Status:"Ready to Schedule"}),
  row("7",{Platform:"TikTok",Publish_Status:"Published"}),
 ];
 const actual=reconcileExceptionCensus(rows,mapped,{atMs:Date.parse("2026-11-20T20:00:00Z"),source:"supabase"});
 assert.equal(Object.values(actual.overdue_provider_evidence_lanes).reduce((a,b)=>a+b,0),7);
 assert.equal(actual.overdue_provider_evidence_lanes.instagram_story_existing_creation_container,1);
 assert.equal(actual.overdue_provider_evidence_lanes.instagram_carousel_existing_parent_container,1);
 assert.equal(actual.overdue_provider_evidence_lanes.youtube_existing_video_id,1);
 assert.equal(actual.overdue_provider_evidence_lanes.tiktok_existing_draft_id,1);
 assert.equal(actual.overdue_provider_evidence_lanes.prior_dispatch_without_saved_remote_identity,1);
 assert.equal(actual.overdue_provider_evidence_lanes.no_saved_dispatch_provider_preflight_required,1);
 assert.equal(actual.overdue_provider_evidence_lanes.published_label_without_saved_public_receipt,1);
 assert.equal(actual.overdue_provider_evidence_count,7);
 assert.equal(actual.overdue_provider_evidence_cases.length,7);
 assert.equal(actual.overdue_provider_evidence_cases_truncated,false);
 assert.ok(actual.overdue_provider_evidence_cases.every(x=>!x.actions_enabled && !x.provider_reconciliation.authorized_to_reupload));
 assert.ok(actual.exception_items.every(x=>!x.provider_reconciliation || !x.provider_reconciliation.authorized_to_reupload));
});

test("contradictory Published label remains in provider drilldown even when Home omits it",()=>{
 const rows=[
  row("1",{Platform:"TikTok",Output_ID:5094,Publish_Status:"Published"}),
  row("2",{Platform:"Instagram",Output_ID:3149,Publish_Status:"Ready to Schedule",IG_Story_Container_ID:"18111111111111111",Do_Not_Publish:true,Publish_Retry_Eligible:false})
 ];
 const actual=reconcileExceptionCensus(rows,mapped,{atMs:Date.parse("2026-11-20T20:00:00Z"),source:"supabase"});
 assert.equal(actual.totals.approved_past_due,0);
 assert.equal(actual.overdue_provider_evidence_count,2);
 const published=actual.overdue_provider_evidence_cases.find(x=>x.output_id==="5094");
 assert.equal(published.provider_reconciliation.lane,"published_label_without_saved_public_receipt");
 assert.equal(published.provider_reconciliation.published_post_verified,false);
 assert.equal(published.actions_enabled,false);
 const story=actual.overdue_provider_evidence_cases.find(x=>x.output_id==="3149");
 assert.equal(story.held,true);
 assert.equal(story.publish_retry_eligible,false);
 assert.equal(story.provider_reconciliation.authorized_to_reupload,false);
});

test("provider-only audit reports full count and explicit truncation, never hidden success",()=>{
 const rows=Array.from({length:1501},(_,i)=>row(i.toString(36),{
  Platform:"TikTok",Output_ID:i+1,Publish_Status:"Published"
 }));
 const actual=reconcileExceptionCensus(rows,mapped,{atMs:Date.parse("2026-11-20T20:00:00Z")});
 assert.equal(actual.overdue_provider_evidence_count,1501);
 assert.equal(actual.overdue_provider_evidence_cases.length,1500);
 assert.equal(actual.overdue_provider_evidence_cases_truncated,true);
 assert.equal(actual.overdue_provider_evidence_lanes.published_label_without_saved_public_receipt,1501);
 assert.ok(actual.overdue_provider_evidence_cases.every(x=>x.actions_enabled===false));
});
