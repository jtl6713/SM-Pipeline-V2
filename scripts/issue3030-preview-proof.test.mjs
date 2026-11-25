import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewProofBridge, EXACT, imageEnvelope } from "./issue3030-preview-proof.mjs";
const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=","base64"));
const id=Object.keys(EXACT)[0],token="test-only";
const create=(overrides={})=>createPreviewProofBridge({token,expires:Date.now()+60000,reviewUser:"test@example.invalid",expectedVersion:"release",...overrides});
const req=(path,method="GET")=>new Request("https://bridge.invalid/"+path,{method});
const url=token+"/probe/"+id;
test("valid complete PNG envelope; reject truncated bytes and HTML",()=>{
  assert.equal(imageEnvelope(png,"image/png"),true);
  assert.equal(imageEnvelope(png.subarray(0,png.length-1),"image/png"),false);
  assert.equal(imageEnvelope(png,"text/html"),false);
});
test("exact GET-only token protected scope and expiry",async()=>{
  const env={STUDIO_API:{fetch:()=>assert.fail("must not call upstream")}};
  for(const r of [req("wrong/probe/"+id),req(token+"/probe/recNOT_ALLOWED"),req(url,"POST"),req(url+"?other=1")])assert.equal((await create().fetch(r,env)).status,404);
  assert.equal((await create({expires:0}).fetch(req(url),env)).status,404);
});
test("real route and sanitized private raster proof",async()=>{
  const env={STUDIO_API:{fetch:async r=>{
    assert.equal(new URL(r.url).pathname,"/api/media-assets/"+id+"/preview");
    assert.equal(r.method,"GET");
    assert.equal(r.headers.get("Cf-Access-Authenticated-User-Email"),"test@example.invalid");
    return new Response(png,{headers:{"Content-Type":"image/png","Cache-Control":"private,max-age=300","X-Studio-Preview-Source":"drive-photo-thumbnail"}});
  }}};
  const b=await (await create().fetch(req(url),env)).json();
  assert.equal(b.ok,true);assert.equal(b.byte_count,png.length);
  assert.equal(b.envelope_verified,true);assert.equal(b.bytes,undefined);
});
test("fail closed on wrong original size, unauthenticated response, malformed image or public cache",async()=>{
  for(const [status,type,source,cache,bytes] of [
    [200,"image/png","google-drive-media-asset","private",png],
    [403,"text/plain","","no-store","secret raw error"],
    [200,"image/png","drive-photo-thumbnail","private","not image"],
    [200,"image/png","drive-photo-thumbnail","public",png],
    [200,"image/png","drive-photo-thumbnail","private",new Uint8Array(3500001)],
  ]){
    const env={STUDIO_API:{fetch:async()=>new Response(bytes,{status,headers:{"Content-Type":type,"Cache-Control":cache,"X-Studio-Preview-Source":source}})}};
    const b=await (await create().fetch(req(url),env)).json();
    assert.equal(b.ok,false);assert.equal(JSON.stringify(b).includes("secret raw error"),false);
  }
});
test("health only confirms exact release, never returns raw version or payload",async()=>{
  const env={STUDIO_API:{fetch:async r=>{assert.equal(new URL(r.url).pathname,"/health");return Response.json({version:"release",secret:"hidden"});}}};
  assert.deepEqual(await (await create().fetch(req(token+"/probe/health"),env)).json(),{ok:true,status:200,version_matches:true});
});