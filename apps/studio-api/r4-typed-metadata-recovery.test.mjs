import test from "node:test";
import assert from "node:assert/strict";
import {
  assessR4TypedMetadataRecovery, sweepR4TypedMetadataRecovery,
} from "./r4-typed-metadata-recovery.mjs";

const BASE="https://example.supabase.co";
const CDN="https://media.chicagoshining.com/";
const TIME="2026-11-22T04:50:00.000Z";
const id="recAbc12345678901";
const UUID="40404040-4040-4040-8040-404040404040";
const contentId="50505050-5050-4050-8050-505050505050";
const profileId="60606060-6060-4060-8060-606060606060";
const requestId="70707070-7070-4070-8070-707070707070";
function output(extra={}) {return {
  id:UUID,airtable_record_id:id,output_number:11014,
  content_item_id:contentId,content_profile_id:profileId,
  output_status:"In Production",render_status:"Ready for Render",
  do_not_publish:false,test_run_id:null,review_status:null,publish_status:null,
  auto_publish_enabled:null,remotion_job_id:null,final_file_url:null,
  published_at:null,platform_post_url:null,output_filename:null,render_total_frames:null,
  render_clip_list_text:'[{"src":"https://media.chicagoshining.com/a.jpg"}]',
  render_clip_list:[{src:CDN+"a.jpg"}],
  selected_clip_count:2,selected_assets:{selected_clips:[{url:CDN+"a.jpg"},{url:CDN+"b.jpg"}]},
  error_messages:{Output_Filename:"studio-PR-20261121145007-AHVKK2-instagram-reel.mp4",
    Render_Total_Frames:"1416",Composition_ID:"ChicagoShiningPhotoSequence"},
  updated_at:TIME,...extra,
};}

test("legacy R3 bag is safely eligible for typed-only R4 repair, even with provisional date",()=>{
  const row=output({scheduled_post_date:"2026-12-13T19:05:00.000Z"});
  const v=assessR4TypedMetadataRecovery(row);
  assert.equal(v.eligible,true);assert.equal(v.frames,1416);
  assert.equal(v.filename,row.error_messages.Output_Filename);
});

test("fail closed on holds, provider attempts, unsafe media or out-of-sync typed columns",()=>{
  const mutations=[
    {do_not_publish:true},{test_run_id:"test123"},{review_status:"Approved"},
    {auto_publish_enabled:true},{remotion_job_id:"job-old"},
    {published_at:TIME},{platform_post_url:"https://social.example/post"},
    {output_status:"Ready for Review"},{render_status:"Rendering"},
    {error_messages:{...output().error_messages,Publish_Locked_At:TIME}},
    {error_messages:{Output_Filename:"../bad.mp4",Render_Total_Frames:"1416",Composition_ID:"ChicagoShiningPhotoSequence"}},
    {error_messages:{Output_Filename:"studio-PR-20261121145007-AHVKK2-instagram-reel.mp4",Render_Total_Frames:"0",Composition_ID:"ChicagoShiningPhotoSequence"}},
    {output_filename:"different.mp4"},{render_total_frames:100},
    {selected_assets:{selected_clips:[{url:CDN+"a.jpg"}]}},
    {selected_assets:{selected_clips:[{url:"https://evil.invalid/asset.jpg"},{url:CDN+"b.jpg"}]}},
    {render_clip_list:[]},{render_clip_list_text:""},
    {updated_at:null},{content_item_id:null},
  ];
  for(const change of mutations) assert.equal(assessR4TypedMetadataRecovery(output(change)).eligible,false,
    "must skip "+JSON.stringify(change));
});

test("sweep checks exact Content Item/PR ownership and writes ONLY typed metadata",async t=>{
  let row=output({scheduled_post_date:"2026-12-13T19:05:00.000Z",publish_status:"Ready to Publish"});
  const calls=[];
  const prev=globalThis.fetch;t.after(()=>globalThis.fetch=prev);
  globalThis.fetch=async (url,init={})=>{
    const u=new URL(url);assert.equal(u.origin,BASE);
    calls.push({path:u.pathname,method:init.method||"GET",url:u});
    if((init.method||"GET")==="GET" && u.pathname.endsWith("/platform_outputs"))
      return Response.json([row]);
    if((init.method||"GET")==="GET" && u.pathname.endsWith("/content_items")){
      assert.equal(u.searchParams.get("content_profile_id"),"eq."+profileId);
      return Response.json([{id:contentId,production_request_id:requestId}]);
    }
    if((init.method||"GET")==="GET" && u.pathname.endsWith("/production_requests"))
      return Response.json([{id:requestId,production_job:{step:"done"}}]);
    assert.equal(init.method,"PATCH");assert.ok(u.pathname.endsWith("/platform_outputs"));
    assert.equal(u.searchParams.get("id"),"eq."+UUID);
    assert.equal(u.searchParams.get("updated_at"),"eq."+TIME);
    assert.equal(u.searchParams.get("do_not_publish"),"eq.false");
    assert.equal(u.searchParams.get("review_status"),"is.null");
    assert.equal(u.searchParams.get("remotion_job_id"),"is.null");
    const body=JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(),["output_filename","render_total_frames","updated_at"]);
    assert.equal(body.output_filename,row.error_messages.Output_Filename);
    assert.equal(body.render_total_frames,1416);
    row={...row,...body};
    return Response.json([row]);
  };
  const env={SUPABASE_URL:BASE,SUPABASE_SERVICE_ROLE_KEY:"fixture"};
  const first=await sweepR4TypedMetadataRecovery(env,{limit:1,now:()=>new Date("2026-11-22T04:53:00.000Z")});
  assert.equal(first.repaired,1);
  assert.equal(row.output_status,"In Production");assert.equal(row.review_status,null);
  assert.equal(row.publish_status,"Ready to Publish");
  assert.equal(row.scheduled_post_date,"2026-12-13T19:05:00.000Z");
  assert.equal(row.auto_publish_enabled,null);assert.equal(row.remotion_job_id,null);
  const second=await sweepR4TypedMetadataRecovery(env,{limit:1});
  assert.equal(second.repaired,0);assert.equal(second.skipped,1);
  assert.equal(calls.filter(x=>x.method==="PATCH").length,1,"idempotent");
});

test("stale row or an uncompleted parent prevents mutation",async t=>{
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let patched=0;
  globalThis.fetch=async (url,init={})=>{
    const u=new URL(url);
    if(init.method==="PATCH"){patched++;return Response.json([]);}
    if(u.pathname.endsWith("/content_items"))
      return Response.json([{id:contentId,production_request_id:requestId}]);
    if(u.pathname.endsWith("/production_requests"))
      return Response.json([{id:requestId,production_job:{step:"escalated"}}]);
    return Response.json([output()]);
  };
  const env={SUPABASE_URL:BASE,SUPABASE_SERVICE_ROLE_KEY:"fixture"};
  const res=await sweepR4TypedMetadataRecovery(env,{limit:1});
  assert.equal(res.repaired,0);assert.equal(res.unavailable,1);assert.equal(patched,0);
});
