
import test from "node:test";
import assert from "node:assert/strict";
import {issue2618PreviewSpec,issue2618PreviewEligible,serveIssue2618ReviewPreview,fetchIssue2618DriveVideo,refreshIssue2618DriveToken}
  from "./factory-2618-review-preview.mjs";

const ids=["recaV78on0RSfqb31","recgeicEbdlbmQiv5","recy1CzV4MJQycBMq",
  "recfwDzGh6St6WB9f","rec1PDreUDoe2AcPV","rec1kjgusW1fX9BOp","recidhGcJSfOlxMsc"];
const row=id=>{
  const s=issue2618PreviewSpec(id);
  return {
    airtable_record_id:id,
    output_status:"Ready for Review",review_status:"Review Sent",
    publish_status:"Not Ready",do_not_publish:false,auto_publish_enabled:false,
    scheduled_post_date:null,studio_scheduled_at:null,
    youtube_scheduled_publish_at:null,published_at:null,
    platform_post_url:null,platform_publish_response:null,
    final_file_url:"https://drive.google.com/file/d/"+s.fileId+"/view",
    error_messages:{Final_File_ID:s.fileId,
      SM_2618_Creative_Rework_Plan:{candidate_sha256:s.sha256},
      SM_2618_Factory_Review_Handoff:{
        corrected_final_drive_id:s.fileId,candidate_sha256:s.sha256,
        human_factory_approval_pending:true,publishing_authorized:false}},
  };
};
const makeStorage=()=>{
  const files=new Map(),counts={put:0};
  return {counts,
    async head(k){const x=files.get(k);return x?{size:x.bytes.byteLength,customMetadata:x.options.customMetadata}:null;},
    async put(k,b,options){files.set(k,{bytes:b,options});counts.put++;},
    async get(k,opts){
      const x=files.get(k);if(!x)return null;
      const source=new Uint8Array(x.bytes);
      const requested=opts?.range?.get("Range")||"";
      const m=requested.match(/^bytes=(\d+)-(\d*)$/);
      const start=m?Number(m[1]):0,stop=m&&m[2]?Math.min(Number(m[2])+1,source.length):source.length;
      const chunk=source.slice(start,stop);
      return {size:source.length,customMetadata:x.options.customMetadata,
        range:m?{offset:start,length:chunk.length}:undefined,
        body:new ReadableStream({start(c){c.enqueue(chunk);c.close();}})};
    },
  };
};

test("only the exact seven reconciled #2618 outputs have cache specs",()=>{
  assert.equal(ids.length,7);
  for(const id of ids){assert.ok(issue2618PreviewSpec(id));assert.ok(issue2618PreviewEligible(row(id),issue2618PreviewSpec(id)));}
  assert.equal(issue2618PreviewSpec("rec00000000000000"),null);
});
test("superseded file, DNP, scheduling, approval, publication or missing QA provenance fail closed",()=>{
  const id=ids[5],s=issue2618PreviewSpec(id);
  for(const patch of [
    {scheduled_post_date:"2026-12-02T00:00:00Z"},
    {do_not_publish:true},{auto_publish_enabled:true},
    {output_status:"Approved for Publishing"},{review_status:"Approved"},
    {published_at:"2026-11-23T00:00:00Z"},{platform_post_url:"https://example.com/p"},
    {final_file_url:"https://drive.google.com/file/d/old/view"},
    {error_messages:{Final_File_ID:s.fileId,
      SM_2618_Creative_Rework_Plan:{candidate_sha256:s.sha256}}},
  ]) assert.equal(issue2618PreviewEligible({...row(id),...patch},s),false);
});
test("first request verifies exact media and caches privately; range GETs serve 206 without another Drive fetch",async()=>{
  const id=ids[5],s=issue2618PreviewSpec(id),STUDIO_MEDIA=makeStorage();
  let fetches=0,hashed=0;
  const deps={
    env:{STUDIO_MEDIA},outputId:id,
    readRows:async()=>[row(id)],
    fetchVideo:async()=>{
      fetches++;
      return new Response(new Uint8Array(s.bytes),{status:200,headers:{"Content-Type":"video/mp4"}});
    },
    digest:async()=>{hashed++;return s.sha256;},
  };
  const first=await serveIssue2618ReviewPreview({...deps,
    request:new Request("https://studio.chicagoshining.com/api/factory/outputs/"+id+"/preview")});
  assert.equal(first.status,200);
  assert.equal(first.headers.get("X-Studio-Preview-Source"),"issue2618-verified-private-r2");
  assert.equal(first.headers.get("Content-Length"),String(s.bytes));
  assert.equal(first.headers.get("Cache-Control"),"private, no-store");
  assert.equal(STUDIO_MEDIA.counts.put,1);
  assert.equal(fetches,1);assert.equal(hashed,1);
  const second=await serveIssue2618ReviewPreview({...deps,request:new Request(
    "https://studio.chicagoshining.com/api/factory/outputs/"+id+"/preview",{
      headers:{"Range":"bytes=100-199"}})});
  assert.equal(second.status,206);
  assert.equal(second.headers.get("Content-Range"),"bytes 100-199/"+s.bytes);
  assert.equal(second.headers.get("Content-Length"),"100");
  assert.equal(fetches,1);
  const otherId=ids[4];
  const shared=await serveIssue2618ReviewPreview({...deps,
    outputId:otherId,readRows:async()=>[row(otherId)],
    request:new Request("https://studio.chicagoshining.com/api/factory/outputs/"+otherId+"/preview",{
      method:"HEAD"})});
  assert.equal(shared.status,200);
  assert.equal(STUDIO_MEDIA.counts.put,1);
});
test("source hash mismatch never writes a cache, and publication changes veto a prior cached object",async()=>{
  const id=ids[0],s=issue2618PreviewSpec(id),STUDIO_MEDIA=makeStorage();
  const deps={outputId:id,env:{STUDIO_MEDIA},
    request:new Request("https://studio.chicagoshining.com/api/factory/outputs/"+id+"/preview"),
    readRows:async()=>[row(id)],
    fetchVideo:async()=>new Response(new Uint8Array(s.bytes),{headers:{"Content-Type":"video/mp4"}}),
    digest:async()=>"0000000000000000000000000000000000000000000000000000000000000000"};
  await assert.rejects(()=>serveIssue2618ReviewPreview(deps),/FACTORY_2618_FILE_HASH_MISMATCH/);
  assert.equal(STUDIO_MEDIA.counts.put,0);
  await assert.rejects(()=>serveIssue2618ReviewPreview({...deps,readRows:async()=>[
    {...row(id),studio_scheduled_at:"2026-12-02T00:00:00Z"}]}),
    /FACTORY_2618_SOURCE_CHANGED_OR_UNVERIFIED/);
});

test("private Drive fetch requires OAuth and preserves safe upstream categories without anonymous fallback",async()=>{
  const fileId=issue2618PreviewSpec(ids[0]).fileId;
  let calls=0;
  const never=async()=>{calls++;throw Error("unexpected network call");};
  await assert.rejects(()=>fetchIssue2618DriveVideo({fileId,getAccessToken:async()=>"",fetchImpl:never}),/FACTORY_2618_DRIVE_OAUTH_UNAVAILABLE/);
  await assert.rejects(()=>fetchIssue2618DriveVideo({fileId:"unrelated",getAccessToken:async()=>"test-token",fetchImpl:never}),/FACTORY_2618_PROTECTED_SOURCE_UNAVAILABLE/);
  assert.equal(calls,0);
  for(const [status,reason] of [[401,"OAUTH_REJECTED"],[403,"ACCESS_DENIED"],[404,"FILE_NOT_VISIBLE"],[429,"RATE_LIMITED"],[502,"UPSTREAM_FAILED"]]){
    const before=calls;
    await assert.rejects(()=>fetchIssue2618DriveVideo({fileId,getAccessToken:async()=>"test-token",fetchImpl:async(url,opts)=>{
      calls++;
      assert.equal(new URL(url).hostname,"www.googleapis.com");
      assert.equal(opts.headers.Authorization,"Bearer test-token");
      return new Response("private upstream detail",{status});
    }}),new RegExp("FACTORY_2618_DRIVE_"+reason));
    assert.equal(calls,before+1);
  }
  const success=await fetchIssue2618DriveVideo({fileId,getAccessToken:async()=>"test-token",fetchImpl:async()=>new Response(new Uint8Array([1]),{headers:{"Content-Type":"video/mp4"}})});
  assert.equal(success.status,200);
});
test("classified private Drive failure reaches caller without caching anything",async()=>{
  const id=ids[0],s=issue2618PreviewSpec(id),STUDIO_MEDIA=makeStorage();
  await assert.rejects(()=>serveIssue2618ReviewPreview({
    request:new Request("https://studio.chicagoshining.com/api/factory/outputs/"+id+"/preview"),
    env:{STUDIO_MEDIA},outputId:id,readRows:async()=>[row(id)],
    fetchVideo:()=>fetchIssue2618DriveVideo({fileId:s.fileId,getAccessToken:async()=>"test-token",fetchImpl:async()=>new Response(null,{status:403})}),
  }),error=>error.status===503&&error.message==="FACTORY_2618_DRIVE_ACCESS_DENIED");
  assert.equal(STUDIO_MEDIA.counts.put,0);
});

test("OAuth refresh preserves only known Google error categories and never leaks details",async()=>{
  const env={GOOGLE_CLIENT_ID:"test-client",GOOGLE_CLIENT_SECRET:"test-secret",GOOGLE_REFRESH_TOKEN:"test-refresh"};
  let called=0;
  await assert.rejects(()=>refreshIssue2618DriveToken({},async()=>{called++;}),/FACTORY_2618_DRIVE_OAUTH_BINDING_EMPTY/);
  assert.equal(called,0);
  for(const code of ["invalid_client","invalid_grant","unauthorized_client","invalid_scope","invalid_request","unknown-private-error"]){
    await assert.rejects(()=>refreshIssue2618DriveToken(env,async(url,options)=>{
      assert.equal(url,"https://oauth2.googleapis.com/token");
      assert.equal(options.redirect,"error");
      assert.equal(options.body.get("grant_type"),"refresh_token");
      return Response.json({error:code,error_description:"test-secret"}, {status:400});
    }),error=>error.message==="FACTORY_2618_DRIVE_OAUTH_"+(code==="unknown-private-error"?"TOKEN_ENDPOINT_FAILED":code.toUpperCase()));
  }
  assert.equal(await refreshIssue2618DriveToken(env,async()=>Response.json({access_token:"test-access"})),"test-access");
  await assert.rejects(()=>refreshIssue2618DriveToken(env,async()=>Response.json({})),/FACTORY_2618_DRIVE_OAUTH_TOKEN_MISSING/);
  const fileId=issue2618PreviewSpec(ids[0]).fileId;
  await assert.rejects(()=>fetchIssue2618DriveVideo({fileId,
    getAccessToken:()=>refreshIssue2618DriveToken(env,async()=>Response.json({error:"invalid_grant"},{status:400})),
    fetchImpl:async()=>{throw Error("Drive must not be contacted on refresh failure");},
  }),/FACTORY_2618_DRIVE_OAUTH_INVALID_GRANT/);
});
