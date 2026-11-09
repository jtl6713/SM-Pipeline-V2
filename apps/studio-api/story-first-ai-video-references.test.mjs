import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStoryVideoReferences, storyVideoReferenceManifest, verifyStudioReferenceAsset,
  fetchStudioReferenceFromDrive, uploadStudioReferenceToEleven, uploadStoryVideoReferences,
} from "./story-first-ai-video-references.mjs";

const profileId="recChicagoProfile";
const source={
  id:"recImageOne",fields:{
    Content_Profile:[profileId],Rights_Status:"Owned",Asset_Status:"Available",Active:true,
    "Google Drive File ID":"ABCdef0123456789",MIME_Type:"image/png",File_Size_Bytes:2048,
    "Asset Name":"Chicago river sunset",
  },
};
test("only exact profile-owned, cleared, available Drive originals become external references",()=>{
  const item={asset_id:"recImageOne",type:"image"};
  assert.equal(verifyStudioReferenceAsset(source,item,profileId).mime,"image/png");
  assert.throws(()=>verifyStudioReferenceAsset(source,item,"recOtherProfile"),/profile/);
  assert.throws(()=>verifyStudioReferenceAsset({...source,fields:{...source.fields,Do_Not_Use:true}},item,profileId),/cleared/);
  assert.throws(()=>verifyStudioReferenceAsset({...source,fields:{...source.fields,
    "Google Drive File ID":""}},item,profileId),/Google Drive/);
  assert.throws(()=>verifyStudioReferenceAsset(source,{...item,type:"audio"},profileId),/supported audio/);
  assert.throws(()=>verifyStudioReferenceAsset({...source,fields:{...source.fields,File_Size_Bytes:25000000}},item,profileId),/12 MB/);
});

test("reference constraints reject unknown IDs, duplicates, invalid end frame and mixed frames",()=>{
  assert.throws(()=>normalizeStoryVideoReferences({start_frame:"https://bad.example/file.png"}),/Invalid/);
  assert.throws(()=>normalizeStoryVideoReferences({end_frame:"recImageOne"}),/requires/);
  assert.throws(()=>normalizeStoryVideoReferences({start_frame:"recImageOne",images:["recImageTwo"]}),/OR/);
  assert.throws(()=>normalizeStoryVideoReferences({images:["recImageOne","recImageOne"]}),/only be used once/);
  assert.deepEqual(storyVideoReferenceManifest({images:[{asset_id:"recImageOne",role:"style"}]}),
    [{field:"images",type:"image",asset_id:"recImageOne",role:"style"}]);
});

test("authenticated Drive bytes must come from exact stored Drive file ID",async()=>{
  const record=verifyStudioReferenceAsset(source,{asset_id:"recImageOne",type:"image"},profileId);
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    return new Response(new Uint8Array(2048),{status:200,headers:{"Content-Type":"image/png"}});
  };
  const bytes=await fetchStudioReferenceFromDrive(record,"oauth-access-token",fetcher);
  assert.equal(bytes.byteLength,2048);
  assert.match(calls[0].url,/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/ABCdef0123456789\?alt=media/);
  assert.equal(calls[0].options.headers.Authorization,"Bearer oauth-access-token");
  await assert.rejects(()=>fetchStudioReferenceFromDrive(record,""),/Google Drive access/);
});

test("ElevenLabs asset upload uses trusted bytes, correct MIME and managed API key",async()=>{
  const record=verifyStudioReferenceAsset(source,{asset_id:"recImageOne",type:"image"},profileId);
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({asset_id:"ElevenRef12345",mime_type:"image/png"}),{
      status:200,headers:{"Content-Type":"application/json"},
    });
  };
  const data=await uploadStudioReferenceToEleven({ELEVENLABS_VIDEO_API_KEY:"secret"},record,
    new Uint8Array(2048),fetcher);
  assert.deepEqual(data,{type:"asset",asset_id:"ElevenRef12345"});
  assert.equal(calls[0].url,"https://api.elevenlabs.io/v1/assets");
  assert.equal(calls[0].options.headers["xi-api-key"],"secret");
  assert.ok(calls[0].options.body instanceof FormData);
});

test("reference transfers never fall back to the narration-only API key",async()=>{
  const record=verifyStudioReferenceAsset(source,{asset_id:"recImageOne",type:"image"},profileId);
  let calls=0;
  const blocked=async()=>{calls+=1;return new Response("{}");};
  await assert.rejects(
    ()=>uploadStudioReferenceToEleven({ELEVENLABS_API_KEY:"voice-only-secret"},record,
      new Uint8Array(2048),blocked),
    /Dedicated ElevenLabs video key is not configured/,
  );
  assert.equal(calls,0);
});

test("reference-to-provider conversion checks all sources and uploads only after approval",async()=>{
  const requests=[];
  const fetcher=async(url,opts)=>{
    requests.push({url,opts});
    if(url.startsWith("https://www.googleapis.com/")){
      return new Response(new Uint8Array(2048),{headers:{"Content-Type":"image/png"}});
    }
    return new Response(JSON.stringify({asset_id:"ElevenRef12345",mime_type:"image/png"}),{
      status:200,headers:{"Content-Type":"application/json"},
    });
  };
  const env={ELEVENLABS_VIDEO_API_KEY:"secret"};
  const result=await uploadStoryVideoReferences(env,{start_frame:"recImageOne"},profileId,{
    loadAsset:async id=>({...source,id}),driveToken:async()=>"oauth-token",fetcher,
  });
  assert.deepEqual(result.provider_references,{
    start_frame:{type:"asset",asset_id:"ElevenRef12345"}});
  assert.deepEqual(result.provider_asset_ids,["ElevenRef12345"]);
  assert.equal(requests.length,2);
  await assert.rejects(()=>uploadStoryVideoReferences(env,{start_frame:"recImageOne"},
    "recDifferentProfile",{loadAsset:async()=>source,driveToken:async()=>"oauth-token",fetcher}),/profile/);
  assert.equal(requests.length,2);
});


test("reference requests use Cloudflare manual redirects and reject cross-host redirects", async () => {
  const record = verifyStudioReferenceAsset(source,
    {asset_id: "recImageOne", type: "image"}, profileId);
  await assert.rejects(() => fetchStudioReferenceFromDrive(record, "access-token", async (url, opts) => {
    assert.equal(opts.redirect, "manual");
    assert.match(url, /^https:\/\/www\.googleapis\.com\//);
    return new Response(null, {status: 302, headers: {Location: "https://evil.example/source"}});
  }), /unexpectedly redirected/i);
  await assert.rejects(() => uploadStudioReferenceToEleven(
    {ELEVENLABS_VIDEO_API_KEY: "secret"}, record, new Uint8Array(2048),
    async (url, opts) => {
      assert.equal(opts.redirect, "manual");
      assert.equal(url, "https://api.elevenlabs.io/v1/assets");
      return new Response(null, {status: 307, headers: {Location: "https://evil.example/upload"}});
    },
  ), /upload redirected/i);
});
