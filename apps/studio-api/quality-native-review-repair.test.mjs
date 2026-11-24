import test from "node:test";
import assert from "node:assert/strict";
import { assessVerifiedNativeReviewRepair,recoverOneVerifiedNativeReview,verifyBytes } from "./quality-native-review-repair.mjs";

const id="recFHzU0h4f4mjgrj",content="11111111-1111-4111-8111-111111111111",
  profile="22222222-2222-4222-8222-222222222222",pr="33333333-3333-4333-8333-333333333333",
  idea="44444444-4444-4444-8444-444444444444",rid="55555555-5555-4555-8555-555555555555";
const profileRecord="recgtK8Z7eNADNtVy",ideaRecord="recIdea0000000001";
const sha="a".repeat(64), at="2026-11-24T12:27:50Z",before="2026-11-24T12:20:00Z";
const assets=[1,2].map(i=>({index:i,media_asset_id:"recVariant000000"+i,asset_name:"variant"+i+".jpg",
  drive_id:"drive-variant-"+i,transfer_id:"source-"+i+"-9x16",url:"https://media.chicagoshining.com/variant"+i+".jpg",
  sha256:sha,geometry:"1080x1920",cdn_verified:true}));
test("media byte verification never follows redirects in Cloudflare",async()=>{
 const bytes=new Uint8Array([255,216,255,217]);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
 const ok=await verifyBytes([{url:"https://media.chicagoshining.com/exact.jpg",sha256:digest}],async(url,options)=>{
  assert.equal(url,"https://media.chicagoshining.com/exact.jpg");assert.equal(options.redirect,"manual");
  return new Response(bytes,{status:200,headers:{"Content-Type":"image/jpeg","Content-Length":"4"}});
 });
 assert.equal(ok,true);
});
const clips=assets.map(a=>({order:a.index,url:a.url,google_drive_file_id:a.drive_id,
  media_asset_record_id:a.media_asset_id,verified_media_sha256:a.sha256,source_transfer_id:a.transfer_id,
  watermarked:true,lettered:false,aspect_ratio:"9:16"}));
const row=()=>({id:rid,airtable_record_id:id,output_number:10865,content_item_id:content,content_profile_id:profile,
  platform:"TikTok",studio_output_type:"Multi-Photo",aspect_ratio:"9:16",output_status:"In Production",
  review_status:"Pending",render_status:"Native Photo Route",publish_status:"Not Ready",
  output_caption:"High Line Walk",selected_clip_count:2,selected_assets:{selected_clips:structuredClone(clips)},
  render_clip_list:structuredClone(clips),studio_preview_url:assets[0].url,thumbnail_url:assets[0].url,
  do_not_publish:false,auto_publish_enabled:false,publish_retry_eligible:false,updated_at:at,
  error_messages:{SM_Quality_Native_Variant_Repair_v1:{at,provider_writes:0,source_output:10863,
    stage_receipt:{verified:true,source_writes:0,provider_writes:0,output:10865,source_output:10863,
      target_updated_at:before,assets:structuredClone(assets)}}}});
const report={status:"ok",findings:[{reason:"review_handoff_status_mismatch",record_id:id,output_id:10865,content_item_id:content}]};
function harness({modify=()=>{},deny=false,bytes=true,stale=false,cas=false,reserved=false,badRights=false,staleDraft=false}={}){
  let state=row();if(staleDraft)Object.assign(state,{output_status:"Ready for Review",review_status:"Review Sent",tiktok_draft_status:"Waiting for Schedule"});modify(state);
  const counts={reads:0,patches:0,claims:0,releases:0,reservations:0,checks:0};
  let targetReads=0;
  const siblingClips=[1,2].map(i=>({mediaAssetRecordId:"recSource0000000"+i,googleDriveFileId:"drive-source-"+i}));
  const library=assets.flatMap((a,i)=>[
    {airtable_record_id:a.media_asset_id,asset_name:a.asset_name,google_drive_file_id:a.drive_id,
      active:true,do_not_use:false,asset_status:"Available",media_class:"Image",
      metadata:{rights_status:badRights?"Unknown":"Owned",content_profile_airtable_id:profileRecord,studio_transfer_id:a.transfer_id}},
    {airtable_record_id:siblingClips[i].mediaAssetRecordId,google_drive_file_id:siblingClips[i].googleDriveFileId,
      active:true,do_not_use:false,asset_status:"Available",media_class:"Image",
      metadata:{rights_status:"Owned",content_profile_airtable_id:profileRecord,studio_transfer_id:"source-"+(i+1)+"-4x5"}},
  ]);
  const env={STUDIO_MEDIA:{}};
  const opts={
    read:async path=>{
      counts.reads++;
      if(path.startsWith("platform_outputs?airtable_record_id=")){
        targetReads++;
        if(stale&&targetReads===2)state.updated_at="2026-11-24T12:35:00Z";
        return [structuredClone(state)];
      }
      if(path.startsWith("content_items?"))return [{id:content,content_profile_id:profile,production_request_id:pr}];
      if(path.startsWith("production_requests?"))return [{id:pr,promoted_content_item_id:content,idea_candidate_id:idea,request_status:"Promoted",output_plan_status:"Ready",output_plan:{items:[{platform:"TikTok",output_type:"Multi-Photo"},{platform:"Instagram",output_type:"Carousel"}]},production_job:{step:"done"},updated_at:at}];
      if(path.startsWith("idea_candidates?"))return [{id:idea,airtable_record_id:ideaRecord,content_profile_id:profile}];
      if(path.startsWith("content_profiles?"))return [{id:profile,airtable_record_id:profileRecord}];
      if(path.startsWith("platform_outputs?output_number="))return [{content_item_id:content,content_profile_id:profile,platform:"Instagram",studio_output_type:"Carousel",selected_clip_count:2,selected_assets:{selected_clips:siblingClips},updated_at:at}];
      if(path.startsWith("media_assets?"))return structuredClone(library);
      throw Error("unexpected read "+path);
    },
    patch:async(path,body)=>{
      counts.patches++;
      assert.match(path,/updated_at=eq\./);
      assert.match(path,/do_not_publish=eq.false/);
      assert.match(path,/scheduled_post_date=is.null/);
      assert.deepEqual(Object.keys(body).sort(),staleDraft?["error_messages","tiktok_draft_status","updated_at"]:["error_messages","output_status","review_status","updated_at"]);
      if(cas)return [];
      state={...state,...body};return [structuredClone(state)];
    },
    lock:async(record,fn)=>{assert.equal(record,id);return fn();},
    claim:async(record)=>{counts.claims++;assert.equal(record,ideaRecord);return {admitted:!deny};},
    release:async()=>{counts.releases++;return {released:true};},
    heartbeat:()=>({assertOwned(){},stop:async()=>{}}),
    checkBytes:async()=>{counts.checks++;return bytes;},
    bucket:{put:async(key,body,options)=>{
      counts.reservations++;
      assert.match(key,/studio\/state\/quality-factory-handoff\/v1/);
      if(counts.reservations===1){assert.equal(options.onlyIf.get("If-None-Match"),"*");if(reserved)return null;}
      else assert.equal(options.onlyIf.etagMatches,"etag");
      return {etag:"etag"};
    }},
    now:()=>new Date("2026-11-24T13:00:00Z"),
  };
  return {run:()=>recoverOneVerifiedNativeReview(env,staleDraft?{...report,findings:[{...report.findings[0],reason:"stale_tiktok_waiting_schedule_blocks_review"}]}:report,opts),counts,state:()=>state};
}
test("review-ready transition accepts only protected exact ordered current media",()=>{
  assert.equal(assessVerifiedNativeReviewRepair(row()).eligible,true);
  for(const patch of [
    {do_not_publish:true},{auto_publish_enabled:true},{scheduled_post_date:at},
    {published_at:at},{review_status:"Approved"},{output_status:"Ready for Review"},
    {selected_clip_count:3},{thumbnail_url:"https://example.com/image.jpg"},
    {error_messages:{}},{platform_publish_response:{id:"prior"}},
  ])assert.equal(assessVerifiedNativeReviewRepair({...row(),...patch}).eligible,false);
  const drift=row();drift.selected_assets.selected_clips[0].verified_media_sha256="b".repeat(64);
  assert.equal(assessVerifiedNativeReviewRepair(drift).eligible,false);
  const provider=row();provider.error_messages.TikTok_Draft_Attempt_Count=1;
  assert.equal(assessVerifiedNativeReviewRepair(provider).eligible,false);
});
test("owned canonical stale native handoff repairs exactly once with no publishing or approval mutation",async()=>{
  const h=harness();const result=await h.run();
  assert.equal(result.status,"repaired");
  assert.equal(h.state().output_status,"Ready for Review");
  assert.equal(h.state().review_status,"Review Sent");
  assert.equal(h.state().auto_publish_enabled,false);
  assert.equal(h.counts.patches,1);
  assert.equal(h.counts.claims,1);assert.equal(h.counts.releases,1);
  assert.equal(h.counts.reservations,2);
  assert.equal((await h.run()).status,"skipped");
  assert.equal(h.counts.patches,1);
});
test("missing ownership, governor denial, changed bytes or revision, reserved attempt cannot mutate",async()=>{
  for(const opts of [{badRights:true},{deny:true},{bytes:false},{stale:true},{reserved:true}]){
    const h=harness(opts);assert.equal((await h.run()).status,"skipped");
    assert.equal(h.counts.patches,0);
  }
});
test("uncertain conditional write remains fenced; no automatic approval or retry",async()=>{
  const h=harness({cas:true});
  await assert.rejects(h.run(),/commit_unverified/);
  assert.equal(h.counts.reservations,1);
  assert.equal(h.counts.releases,1);
});

test("2915 exact repeatable signature: repair only stale draft marker, preserve current review",async()=>{
  const h=harness({staleDraft:true});
  const result=await h.run();
  assert.equal(result.status,"repaired");
  assert.equal(h.state().tiktok_draft_status,null);
  assert.equal(h.state().output_status,"Ready for Review");
  assert.equal(h.state().review_status,"Review Sent");
  assert.equal(h.state().publish_status,"Not Ready");
  assert.equal(h.state().auto_publish_enabled,false);
  assert.equal(result.approval_actions,0);
  assert.equal(result.schedule_actions,0);
  assert.equal(result.provider_writes,0);
  assert.equal(h.state().error_messages.SM_Quality_Stale_TikTok_Review_Repair_v1.prior_tiktok_draft_status,"Waiting for Schedule");
  assert.equal((await h.run()).status,"skipped");
  assert.equal(h.counts.patches,1);
});
test("2915 stale marker does not justify mutation on missing proof, real provider attempt, hold or active schedule",async()=>{
  for(const modify of [
    r=>{r.error_messages.TikTok_Draft_Publish_ID="prior-provider-id";},
    r=>{r.error_messages.TikTok_Draft_Attempt_Count=1;},
    r=>{r.error_messages.Last_Publish_Attempt_At=at;},
    r=>{r.error_messages.SM_Quality_Native_Variant_Repair_v1=null;},
    r=>{r.do_not_publish=true;},
    r=>{r.auto_publish_enabled=true;},
    r=>{r.scheduled_post_date=at;},
    r=>{r.review_status="Approved";},
  ]){
    const h=harness({staleDraft:true,modify});
    assert.equal((await h.run()).status,"skipped");
    assert.equal(h.counts.patches,0);
  }
});
