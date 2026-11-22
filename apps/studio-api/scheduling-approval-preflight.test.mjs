import test from "node:test";
import assert from "node:assert/strict";
import {
  PREFLIGHT_KEY, assessSchedulingPreflight, schedulingPreflightSignature,
  verifiedSchedulingPreflight, probeSchedulingMedia,
  sweepSchedulingApprovalPreflight,
} from "./scheduling-approval-preflight.mjs";
import { classifyFactoryLane, factoryCardFromRow } from "./factory-desk.mjs";

const CDN = "https://media.chicagoshining.com/";
const BASE = "https://example.supabase.co";
const stamp = "2026-11-22T04:00:00.000Z";
function output(overrides = {}) {
  return {
    id: "a1000000-0000-4000-9000-000000000001",
    airtable_record_id: "rec12345678901234",
    content_item_id: "e1000000-0000-4000-9000-000000000001",
    content_profile_id: "f1000000-0000-4000-9000-000000000001",
    platform: "TikTok", studio_output_type: "Video Draft",
    output_status: "Ready for Review", render_status: "Rendered",
    review_status: null, publish_status: null,
    do_not_publish: false, auto_publish_enabled: false, test_run_id: null,
    output_caption: "A verified Coney Island food walk. #NYC",
    studio_preview_url: CDN + "studio/previews/example/job-1.mp4",
    thumbnail_url: CDN + "studio/previews/thumbnails/cover.png",
    final_file_url: "https://drive.google.com/file/d/sample/view",
    selected_clip_count: 5, selected_assets: null, published_at: null,
    scheduled_post_date: null, studio_scheduled_at: null,
    youtube_scheduled_publish_at: null, platform_post_url: null,
    error_messages: {}, updated_at: stamp,
    ...overrides,
  };
}
function mediaFetch(url) {
  const mime = url.endsWith(".mp4") ? "video/mp4" : "image/png";
  return Promise.resolve(new Response(new Uint8Array([1,2,3,4]), {
    status: 206, headers: { "Content-Type": mime },
  }));
}

test("#2618: finished unheld output is prepared but never authorized for publishing", async () => {
  const row = output();
  const readiness = assessSchedulingPreflight(row);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.media.length, 2);
  assert.equal((await probeSchedulingMedia(readiness, mediaFetch)).ok, true);
  assert.equal(verifiedSchedulingPreflight(row), false, "metadata alone is not a verified preflight");
  const verified = structuredClone(row);
  verified.error_messages[PREFLIGHT_KEY] = {
    status: "verified", signature: readiness.signature, requires_human_approval: true,
    publishing_authorized: false, scheduling_authorized: false,
  };
  assert.equal(verifiedSchedulingPreflight(verified), true);
  assert.equal(verifiedSchedulingPreflight({ ...verified, output_caption: "changed after QA" }), false);
  assert.equal(verifiedSchedulingPreflight({ ...verified, do_not_publish: true }), false);
  assert.equal(verifiedSchedulingPreflight({ ...verified, scheduled_post_date: stamp }), false);
  assert.equal(verifiedSchedulingPreflight({ ...verified, review_status: "Approved" }), false);
});

test("#2618: exact historical holds, old schedules, missing captions, and unfinished renders fail closed", () => {
  const blocked = [
    [output({do_not_publish:true}), "publishing_or_recovery_hold"],
    [output({auto_publish_enabled:true}), "publishing_or_recovery_hold"],
    [output({error_messages:{Publish_Locked_At:stamp}}), "historical_provider_or_review_hold"],
    [output({error_messages:{Studio_Publish_Dispatch_At:stamp}}), "historical_provider_or_review_hold"],
    [output({published_at:stamp}), "existing_schedule_or_provider_operation"],
    [output({studio_scheduled_at:stamp}), "existing_schedule_or_provider_operation"],
    [output({review_status:"Approved"}), "review_or_publication_state"],
    [output({output_caption:""}), "caption_missing"],
    [output({render_status:"Waiting in Render Queue"}), "render_incomplete"],
    [output({final_file_url:null}), "render_final_file_missing"],
    [output({studio_preview_url:"https://evil.test/video.mp4"}), "public_preview_or_cover_missing"],
    [output({test_run_id:"test-123"}), "test_output"],
    [output({content_item_id:null}), "unverified_output_ownership"],
  ];
  for (const [row, reason] of blocked) {
    assert.deepEqual(assessSchedulingPreflight(row), {ready:false,reason});
  }
});

test("#2618: native photo set requires real count and consistent source URLs", () => {
  const row=output({
    platform:"Facebook",studio_output_type:"Multi-Image Post",render_status:"Native Photo Route",
    final_file_url:null,studio_preview_url:CDN+"studio/previews/photo.png", selected_clip_count:2,
    selected_assets:{selected_clips:[{url:CDN+"source-a.png"},{url:CDN+"source-b.png"}]},
  });
  assert.equal(assessSchedulingPreflight(row).ready,true);
  assert.equal(assessSchedulingPreflight({...row,selected_clip_count:3}).reason,"native_photo_manifest_mismatch");
  assert.equal(assessSchedulingPreflight({...row,selected_assets:{selected_clips:[{url:"https://unknown.example/photo.png"},{url:CDN+"source-b.png"}]}}).reason,"native_photo_manifest_mismatch");
});

test("#2618: real HTTP byte probes fail closed when media is unavailable or has wrong MIME", async () => {
  const good=assessSchedulingPreflight(output());
  const wrong=await probeSchedulingMedia(good,async () => new Response("not video",{status:200,headers:{"Content-Type":"text/html"}}));
  assert.equal(wrong.ok,false);
  assert.equal(wrong.reason,"media_http_validation_failed");
  const outage=await probeSchedulingMedia(good,async () => {throw new Error("timeout");});
  assert.equal(outage.ok,false);
  assert.equal(outage.reason,"media_http_validation_unavailable");
});

test("#2618: live cron preparation writes only technical receipt; no approval, schedule, provider write", async t => {
  const row=output();
  const calls=[];
  const before=globalThis.fetch;
  t.after(()=>{globalThis.fetch=before;});
  globalThis.fetch=async (raw,init={})=>{
    const uri=new URL(raw);assert.equal(uri.origin,BASE);
    calls.push({url:uri,init});
    if((init.method||"GET")==="GET") return Response.json([row]);
    assert.equal(init.method,"PATCH");
    assert.equal(uri.pathname,"/rest/v1/platform_outputs");
    assert.equal(uri.searchParams.get("id"),"eq."+row.id);
    assert.equal(uri.searchParams.get("updated_at"),"eq."+stamp);
    assert.equal(uri.searchParams.get("do_not_publish"),"eq.false");
    assert.equal(uri.searchParams.get("scheduled_post_date"),"is.null");
    const body=JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(),["error_messages","updated_at"]);
    assert.equal(body.error_messages[PREFLIGHT_KEY].scheduling_authorized,false);
    assert.equal(body.error_messages[PREFLIGHT_KEY].publishing_authorized,false);
    assert.equal(body.error_messages[PREFLIGHT_KEY].requires_human_approval,true);
    Object.assign(row,body);
    return Response.json([row]);
  };
  const env={SUPABASE_URL:BASE,SUPABASE_SERVICE_ROLE_KEY:"test"};
  const one=await sweepSchedulingApprovalPreflight(env,{
    limit:1,fetchImpl:mediaFetch,clock:()=>new Date("2026-11-22T04:10:00.000Z"),
  });
  assert.equal(one.verified,1);
  assert.equal(row.output_status,"Ready for Review");
  assert.equal(row.review_status,null);
  assert.equal(row.publish_status,null);
  assert.equal(row.scheduled_post_date,null);
  assert.equal(row.auto_publish_enabled,false);
  assert.equal(verifiedSchedulingPreflight(row),true);
  const twice=await sweepSchedulingApprovalPreflight(env,{limit:1,fetchImpl:mediaFetch});
  assert.equal(twice.verified,0,"idempotent second pass");
  assert.equal(calls.filter(c=>c.init.method==="PATCH").length,1);
});

test("#2618: Studio-held records never masquerade as active render or ready to publish", () => {
  const held={id:"rec12345678901234",kind:"output",output_status:"In Production",
    render_status:"Native Photo Route",studio_state:"In Production",
    do_not_publish:true,review_package_ready:false};
  assert.equal(classifyFactoryLane(held),"manual");
  const card=factoryCardFromRow(held);
  assert.equal(card.studio_owned_exception,true);
  assert.equal(card.can_approve,false);
  assert.match(card.studio_state,/Studio-owned safety hold/);
  const prepared={...held,do_not_publish:false,output_status:"Ready for Review",
    render_status:"Rendered",review_package_ready:true,scheduling_approval_ready:true,
    studio_state:"Scheduling approval ready · Media verified"};
  assert.equal(classifyFactoryLane(prepared),"needs_eyes");
  assert.equal(factoryCardFromRow(prepared).scheduling_approval_ready,true);
});

test("#2618: Worker five-minute cron and Factory projection wire technical preflight without publishing", async () => {
  const { readFileSync } = await import("node:fs");
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const factory=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  assert.match(worker,/ctx\.waitUntil\(sweepSchedulingApprovalPreflight\(env, \{ limit: 4 \}\)/);
  assert.match(factory,/verifiedSchedulingPreflight\(\{/);
  assert.match(factory,/scheduling_approval_ready: schedulingTechnicalReady === true/);
  assert.match(factory,/Scheduling approval ready/);
  const scan=readFileSync(new URL("./scheduling-approval-preflight.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(scan,/\b(?:auto_publish_enabled|scheduled_post_date|review_status|output_status|publish_status)\s*:\s*["'](?:Approved|Ready to Schedule|Scheduled|Published)/);
});
