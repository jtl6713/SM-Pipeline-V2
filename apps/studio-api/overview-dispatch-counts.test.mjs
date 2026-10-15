import test from "node:test";
import assert from "node:assert/strict";
import { isQueuedForPlatformDispatch, countPendingPlatformDispatch } from "./overview-dispatch-counts.mjs";
const now=Date.parse("2026-10-15T18:00:00Z");
const base={platform:"Facebook",review_status:"Approved",studio_state:"Scheduled",publish_status:"Scheduled",scheduled_post_date:"2026-10-20T18:00:00Z"};
test("only approved, future, not-dispatched outputs count",()=>{
 assert.equal(isQueuedForPlatformDispatch(base,now),true);
 for(const patch of [
 {review_status:"Pending"},{review_status:"Review Sent"},{review_status:"Pending",output_status:"Approved for Publishing"},{studio_state:"Awaiting Approval"},
 {scheduled_post_date:null},
 {published_at:"2026-10-15"},{platform_post_url:"https://example.com/post"},
 {publish_status:"Publishing"},{publish_status:"Published"},
 {studio_state:"Failed"},{studio_state:"Ready for Review"},
 {do_not_publish:true},{facebook_publish_status:"Processing"},
 {platform_publish_status:"Uploaded"},{manual_fallback_required:true},
 ]) assert.equal(isQueuedForPlatformDispatch({...base,...patch},now),false,JSON.stringify(patch));
});
test("platform dispatch / handoff suppresses counted queue entries",()=>{
 const rows=[
 {...base,platform:"Instagram",instagram_carousel_status:"Processing"},
 {...base,platform:"YouTube",youtube_video_id:"abc",youtube_upload_status:"Uploaded"},
 {...base,platform:"TikTok",tiktok_draft_status:"Draft Delivered"},
 {...base,platform:"Facebook",facebook_publish_status:"Published"},
 {...base,platform:"TikTok",tiktok_draft_status:"Waiting for Schedule"},
 {...base,platform:"YouTube",youtube_privacy_status:"private"},
 ];
 assert.deepEqual(countPendingPlatformDispatch(rows,now),{Facebook:0,Instagram:0,TikTok:1,YouTube:1});
});
test("unsanctioned ready-to-schedule never bypasses approval",()=>{
 assert.equal(isQueuedForPlatformDispatch({...base,review_status:"Pending",publish_status:"Ready to Schedule"},now),false);
 assert.equal(isQueuedForPlatformDispatch({...base,review_status:"",output_status:"Approved for Publishing",publish_status:"Ready to Schedule"},now),true);
});

test("past-due approved outputs remain in outstanding platform dispatch queue",()=>{
 assert.equal(isQueuedForPlatformDispatch({...base,scheduled_post_date:"2026-10-10T18:00:00Z"},now),true);
 assert.equal(isQueuedForPlatformDispatch({...base,scheduled_post_date:"2026-10-10T18:00:00Z",platform_publish_status:"Published"},now),false);
});

test("initial dispatch is excluded after a dispatch stamp or provider receipt",()=>{
 for (const patch of [
  {studio_publish_dispatch_at:"2026-10-15T17:00:00Z"},
  {studio_publish_dispatch_count:1},
  {platform:"TikTok",tiktok_draft_publish_id:"pub_123"},
  {platform:"TikTok",tiktok_draft_delivered_at:"2026-10-15T17:00:00Z"},
  {platform:"YouTube",youtube_upload_completed_at:"2026-10-15T17:00:00Z"},
 ]) assert.equal(isQueuedForPlatformDispatch({...base,...patch},now),false,JSON.stringify(patch));
});
